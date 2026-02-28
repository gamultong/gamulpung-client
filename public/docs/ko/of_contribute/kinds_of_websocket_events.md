# 웹소켓 이벤트 종류

## 개요

클라이언트와 서버는 WebSocket을 통해 JSON 메시지를 주고받습니다.
모든 메시지는 `{ header: { event }, payload }` 형식을 따릅니다.

**서버 URL**: `${NEXT_PUBLIC_WS_HOST}/session`

---

## 클라이언트 → 서버 (Send Events)

**파일**: `src/types/message.ts` (`SendMessageEvent`)

| 이벤트 | 설명 | 페이로드 |
|--------|------|---------|
| `MOVE` | 커서 이동 | `{ position: { x, y } }` |
| `OPEN_TILES` | 타일 열기 | `{ position: { x, y } }` |
| `SET_FLAG` | 깃발 설정/해제 | `{ position: { x, y } }` |
| `CREATE_CURSOR` | 세션 참가 (커서 생성) | `{ width, height }` |
| `SET_WINDOW` | 뷰포트 크기 변경 | `{ width, height }` |
| `CHAT` | 채팅 메시지 전송 | `{ message: string }` |
| `DISMANTLE_MINE` | 깃발 타일 해체 | `{ position: { x, y } }` |
| `INSTALL_BOMB` | 폭탄 설치 | `{ position: { x, y } }` |

### SET_WINDOW 디바운스

**파일**: `src/hooks/useTileViewport.ts`

`SET_WINDOW`은 뷰포트 크기(windowWidth, windowHeight, zoom) 변경 시 전송됩니다.
**200ms 디바운스**가 적용되어 연속 변경 시 마지막 값만 전송합니다.

```
줌/리사이즈 변경
  → 200ms 대기 (이전 타이머 취소)
  → 마지막 변경값으로 SET_WINDOW 전송
  → 서버: TILES_STATE로 응답
```

### 뷰포트 크기 계산

```typescript
const width = ((windowWidth * RENDER_RANGE) / (ORIGIN_TILE_SIZE * zoom) / 2) >>> 0;
const height = ((windowHeight * RENDER_RANGE) / (ORIGIN_TILE_SIZE * zoom) / 2) >>> 0;
```

- `RENDER_RANGE = 1.5`: 화면 크기의 1.5배 영역을 요청 (프리페칭)
- `ORIGIN_TILE_SIZE = 80`: 기본 타일 크기 (px)

---

## 서버 → 클라이언트 (Receive Events)

**파일**: `src/hooks/useMessageHandler.ts`

### TILES_STATE

서버가 요청한 타일 그리드 데이터를 전송합니다.

**페이로드 구조:**
```json
{
  "tiles_li": [
    {
      "data": "0A1B2C...",
      "range": {
        "top_left": { "x": -10, "y": 15 },
        "bottom_right": { "x": 10, "y": -5 }
      }
    }
  ]
}
```

**처리 과정:**
1. `tiles_li` 배열의 각 청크를 **순차적으로** 처리
2. `range`에서 시작/종료 좌표 추출
3. 전체 뷰포트 크기와 비교하여 `All` 또는 `PART` 결정
4. `replaceTiles()` 호출 → hex 디코딩 → TileGrid 업데이트
5. 각 청크 처리 후 즉시 화면 반영 (점진적 렌더링)

**참고:**
- y축은 반전됨 (서버: 데카르트 좌표계, 클라이언트: 브라우저 좌표계)
- `top_left.y > bottom_right.y` (서버 기준)

---

### EXPLOSION

지뢰 폭발 이벤트. 뷰포트 내 모든 폭발에 대해 애니메이션을 재생합니다.

**페이로드:**
```json
{
  "position": { "x": 5, "y": -3 }
}
```

**처리:**
1. `onExplosion(position)` → 충격파 애니메이션 시작
2. 커서가 3×3 범위 내에 있으면 → 10초 기절 (`setLeftReviveTime(10)`)

---

### CURSORS_STATE

현재 접속 중인 모든 커서의 상태를 업데이트합니다.

**페이로드:**
```json
{
  "cursors": [
    {
      "id": "cursor_abc",
      "position": { "x": 10, "y": -5 },
      "score": 150,
      "active_at": "2024-01-01T00:00:00Z",
      "items": { "bombs": 3 }
    }
  ]
}
```

**처리:**
1. 내 커서 ID와 일치하면 → 점수, 아이템, 위치 업데이트
2. 다른 커서 → O(n+m) 머지로 기존 상태와 병합
3. 새 커서는 추가, 기존 커서는 업데이트

---

### MY_CURSOR

최초 연결 시 서버가 할당한 커서 ID를 전달합니다.

**페이로드:**
```json
{ "id": "cursor_abc123" }
```

**처리:**
1. `setId(id)` → 내 커서 ID 설정
2. `setTimeout(() => setIsInitialized(true), 0)` → 초기화 완료 플래그

---

### SCOREBOARD_STATE

랭킹 데이터를 업데이트합니다.

**페이로드:**
```json
{
  "scoreboard": {
    "1": 5000,
    "2": 3200,
    "3": 1500
  }
}
```

**처리:**
1. `setRanking()` → 리더보드 업데이트
2. 커서 ID가 없으면 → `CREATE_CURSOR` 메시지 전송 (세션 참가)

---

### QUIT_CURSOR

유저 연결 해제 시 커서를 제거합니다.

**페이로드:**
```json
{ "id": "cursor_abc123" }
```

**처리:** 해당 ID의 커서를 목록에서 필터링

---

### CHAT

다른 유저의 채팅 메시지를 표시합니다.

**페이로드:**
```json
{
  "id": "cursor_abc123",
  "message": "안녕하세요!"
}
```

**처리:** 해당 커서의 `message`와 `messageTime` 업데이트 (8초간 표시)

---

## 메시지 처리 아키텍처

```
WebSocket onmessage
  → websocketStore.message 업데이트
  ↓
useLayoutEffect([message])
  → handleWebSocketMessage(message)
  ↓
JSON.parse → switch(event)
  → 이벤트별 핸들러 실행
  → Zustand 스토어 업데이트
  → React 리렌더링 트리거
```

**주요 설계 결정:**
- `useCursorStore.getState()` / `useOtherUserCursorsStore.getState()`로 콜백 내에서 최신 상태 읽기 (stale closure 방지)
- `useLayoutEffect` 사용 (paint 전에 실행, 깜빡임 방지)
- 바이너리 메시지 핸들러 (`handleBinaryMessage`)는 향후 1바이트/타일 형식 지원을 위해 준비됨
