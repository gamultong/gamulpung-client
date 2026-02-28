# 데이터 흐름

## 전체 파이프라인 개요

```
┌─────────────────────────────────────────────────────┐
│                    서버 통신                          │
│  WebSocket 연결 → JSON 메시지 수신/발신               │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  메시지 라우팅                         │
│  useMessageHandler → 이벤트별 핸들러 분기              │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  타일 처리                            │
│  hex 문자열 → WASM/JS 디코딩 → TileGrid 업데이트      │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                 렌더 스냅샷 생성                       │
│  cachingTiles + 커서 오프셋 → renderTiles             │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  화면 출력                            │
│  Pixi.js 스프라이트 풀 + Canvas 2D 오버레이           │
└─────────────────────────────────────────────────────┘
```

---

## 1단계: WebSocket 연결

**파일**: `src/store/websocketStore.ts`

WebSocket 연결은 Zustand 스토어에서 관리됩니다.

```
클라이언트 시작
  → connect(url) 호출
  → socket.onopen: isOpen = true
  → socket.onmessage: message 상태 업데이트
  → socket.onclose: isOpen = false, 재연결 시도
```

**핵심 상태:**
- `socket`: WebSocket 인스턴스
- `isOpen`: 연결 상태
- `message`: 최신 수신 텍스트 메시지
- `binaryMessage`: 최신 수신 바이너리 메시지 (향후 사용)
- `sendMessage(event, payload)`: JSON 직렬화 후 전송

---

## 2단계: 메시지 라우팅

**파일**: `src/hooks/useMessageHandler.ts`

수신된 WebSocket 메시지는 `header.event` 값에 따라 분기됩니다.

```
wsMessage (JSON 문자열)
  → JSON.parse → { header: { event }, payload }
  → switch(event):
      TILES_STATE    → replaceTiles() (타일 그리드 업데이트)
      EXPLOSION      → onExplosion() (폭발 애니메이션)
      CURSORS_STATE  → setCursors() (다른 유저 커서)
      MY_CURSOR      → setId() (내 커서 ID 설정)
      SCOREBOARD     → setRanking() (랭킹 업데이트)
      QUIT_CURSOR    → 커서 제거
      CHAT           → 채팅 메시지 표시
```

**타일 처리 특징:**
- `tiles_li` 배열의 각 청크를 **순차적으로** 처리 (`await`)
- 각 청크가 처리되면 즉시 화면에 반영 (점진적 렌더링)

---

## 3단계: 타일 처리

**파일**: `src/hooks/useTileProcessing.ts`

### 처리 흐름

```
replaceTiles(end_x, end_y, start_x, start_y, hexData, type)
  │
  ├─ type === 'All' → padtiles(Direction.ALL)
  │                    (그리드 초기화 + LRU 캐시 복원)
  │
  ├─ WASM 사용 가능?
  │   ├─ YES: process_hex_tiles_inplace()
  │   │       (동기, Uint8Array 직접 쓰기, async 오버헤드 없음)
  │   └─ NO:  processTileData() (JS 폴백)
  │           (VECTORIZED_TILE_LUT 16비트 룩업)
  │
  └─ 결과 → setTiles(newTiles)
           → cacheTiles() (LRU 캐시 저장)
```

### WASM vs JS 처리 경로

| 구분 | WASM 경로 | JS 경로 |
|------|-----------|---------|
| 함수 | `process_hex_tiles_inplace()` | `processTileData()` |
| 방식 | Uint8Array에 직접 기록 | 변경 배열 생성 후 일괄 적용 |
| 속도 | 매우 빠름 (동기) | 빠름 (LUT O(1) 룩업) |
| 사용 시점 | WASM 로드 완료 후 | WASM 로드 전 |

### LRU 타일 캐시

**파일**: `src/utils/tileCache.ts`

```
타일 처리 완료 → cacheTiles(worldX, worldY, data, w, h)
                  (비-FILL 타일을 월드 좌표로 저장)

padtiles(type=ALL) → restoreCachedTiles(worldX, worldY, data, w, h)
                      (FILL 대신 캐시된 타일 복원)
```

- 최대 100,000개 타일 저장
- FIFO 방식 퇴거 (가장 오래된 항목부터)
- 재방문 시 서버 응답 전에 즉시 표시

---

## 4단계: 렌더 스냅샷 생성

**파일**: `src/hooks/useTileProcessing.ts` (`computedRenderTiles`)

```
cachingTiles (tileStore.tiles)
  + cursorOriginPosition
  + cursorPosition
  → offsetX/Y 계산
  │
  ├─ offset === 0 → cachingTiles 그대로 반환 (O(1))
  │
  └─ offset !== 0 → processWithStableCPU()
                     (행 단위 memcpy + 체커보드 재계산)
                     → renderTiles 생성
```

**핵심 포인트:**
- `cachingTiles`: 서버에서 받은 원본 타일 데이터
- `renderTiles`: 커서 이동 오프셋을 적용한 화면 표시용 데이터
- 커서가 정확히 정렬되어 있으면 복사 없이 O(1) 반환
- 오프셋이 있으면 `Uint8Array.set(subarray())` 행 단위 네이티브 복사

---

## 5단계: 화면 출력

### Pixi.js 타일 렌더링

**파일**: `src/components/tilemap/index.tsx`

```
renderTiles (TileGrid)
  → useLayoutEffect:
      1. 뷰포트 내 보이는 타일 범위 계산
      2. 스프라이트 풀 확보 (ensurePool)
      3. 타일별 렌더링:
         ├─ FILL → closedPool (캐시 복원 또는 빈 타일)
         ├─ Closed → closedPool (outer + inner 체커보드)
         ├─ Flag → closedPool + flagPool (깃발 오버레이)
         ├─ Opened → outerPool + innerPool
         ├─ Bomb → outerPool + innerPool + boomPool
         └─ Number(1-7) → outerPool + innerPool + numberPool
      4. 미사용 스프라이트 숨김 (hidePoolFrom)
```

### Canvas 2D 오버레이

**파일**: `src/hooks/useCursorRenderer.ts`, `useShockwaveAnimation.ts`

Pixi Stage 위에 Canvas 2D로 그려지는 요소:
- 내 커서 (방향 회전 포함)
- 이동 경로 (곡선)
- 다른 유저 커서
- 클릭 대상 타일 강조
- 폭발 애니메이션 (섬광, 광선, 링, 스파크)

---

## 사용자 입력 데이터 흐름

```
마우스/터치 이벤트
  → useInputHandlers:
      좌클릭 → handleClick()
      우클릭 → handleRightClick()
      롱프레스 → handleLongPress()
  │
  ├─ 인접 타일 (1칸 이내):
  │   → 즉시 OPEN_TILES / SET_FLAG / INSTALL_BOMB / DISMANTLE_MINE 전송
  │
  └─ 원거리 타일:
      → A* 경로탐색 (useMovement)
      → 경로 따라 MOVE 이벤트 순차 전송
      → 도착 후 원래 액션 실행
```

---

## 뷰포트 동기화 흐름

**파일**: `src/hooks/useTileViewport.ts`

```
windowWidth/windowHeight/zoom 변경
  → useLayoutEffect:
      1. 시작/종료 지점 재계산
      2. tileSize 업데이트
  → useLayoutEffect (디바운스 200ms):
      → SET_WINDOW 메시지 서버 전송
      → 서버: 새 뷰포트에 맞는 TILES_STATE 응답
```

**디바운스 효과:**
- 연속 줌/리사이즈 시 마지막 변경만 서버에 전송
- 서버 요청량 약 70% 감소
