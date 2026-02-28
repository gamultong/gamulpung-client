# 타일 렌더링 방법

이 프로젝트는 **2개의 렌더링 레이어**를 사용합니다:

1. **Pixi.js Stage**: WebGL 기반 타일 렌더링 (스프라이트 풀)
2. **Canvas 2D**: 커서, 경로, 폭발 애니메이션 오버레이

---

## 렌더링 파이프라인 전체 흐름

```
텍스처 프리렌더링 (한 번만)
  → useTilemapTextures: 숫자, 깃발, 폭탄 텍스처 생성
  ↓
renderTiles 변경 감지
  → Tilemap useLayoutEffect 트리거
  ↓
뷰포트 내 보이는 타일 범위 계산
  → startCol/endCol, startRow/endRow
  ↓
스프라이트 풀 확보
  → ensurePool()로 필요한 만큼 확장
  ↓
타일별 렌더링
  → 타일 타입에 따라 적절한 풀에서 스프라이트 할당
  ↓
미사용 스프라이트 숨김
  → hidePoolFrom()
  ↓
Canvas 2D 오버레이
  → 커서, 경로, 폭발 효과 그리기
```

---

## 1. 텍스처 생성 (useTilemapTextures)

**파일**: `src/hooks/useTilemapTextures.ts`

게임 시작 시 필요한 텍스처를 **미리 생성**하여 캐싱합니다.

### 텍스처 종류

| 텍스처 | 생성 방법 | 캐시 키 |
|--------|-----------|---------|
| 타일 그라디언트 (outer/inner) | 4px 캔버스에 색상 보간 → `Texture.from()` | `"${색상1}${색상2}${tileSize}"` |
| 숫자 (1~8) | 캔버스에 폰트 렌더링 → `canvasToTexture()` | 숫자 인덱스 |
| 깃발 (4색) | SVG Path2D → 캔버스 → `canvasToTexture()` | `"flag${인덱스}"` |
| 폭탄 | SVG Path2D → 캔버스 → `canvasToTexture()` | `"boom"` |

### 동시성 제한

텍스처 생성은 GPU 작업이므로, `createLimiter(8)`로 **최대 8개 동시 실행**하여 메인 스레드/GPU 과부하를 방지합니다.

### 체커보드 색상

타일은 위치에 따라 2가지 색상 조합을 사용합니다:

```
패리티 = (col + row) & 1
패리티 0: tileColors.outer[0], tileColors.inner[0]  (밝은 색)
패리티 1: tileColors.outer[1], tileColors.inner[1]  (어두운 색)
```

색상 정의는 `src/assets/renderPaths.json`의 `tileColors`에 있습니다.

---

## 2. Pixi.js 타일 렌더링 (Tilemap)

**파일**: `src/components/tilemap/index.tsx`

### Stage 구조

```
<Stage>  (Pixi Application)
  └── <Container name="container">
        ├── <Container name="background">     ← outerPool, innerPool, numberPool
        ├── <Container name="closed-layer">   ← closedPool (outer + inner 쌍)
        ├── <Container name="boom-layer">     ← boomPool
        └── <Container name="flag-layer">     ← flagPool
```

### 스프라이트 풀 패턴

매 프레임 스프라이트를 생성/파괴하면 **GC 부담과 GPU 할당 비용**이 발생합니다.
대신 **오브젝트 풀**을 사용하여 스프라이트를 재사용합니다.

```
풀 종류:
  outerPool    — 열린 타일의 외부 배경
  innerPool    — 열린 타일의 내부 배경 (패딩 적용)
  closedPool   — 닫힌/깃발 타일의 outer+inner 쌍
  boomPool     — 폭탄 스프라이트
  flagPool     — 깃발 스프라이트
  numberPool   — 숫자(1~7) 스프라이트
```

**풀 관리 함수** (`src/utils/pixiSpritePool.ts`):
- `ensurePool(pool, container, needed)`: 풀 크기가 부족하면 스프라이트 추가
- `hidePoolFrom(pool, fromIndex)`: 사용하지 않는 스프라이트 숨김

### 보이는 타일 범위 계산

```typescript
const startCol = Math.max(0, Math.ceil(tilePadWidth - 1));
const endCol = Math.min(totalCols - 1, (tilePadWidth + (windowWidth + tileSize) / tileSize) >>> 0);
const startRow = Math.max(0, Math.ceil(tilePadHeight - 1));
const endRow = Math.min(totalRows - 1, (tilePadHeight + (windowHeight + tileSize) / tileSize) >>> 0);
```

뷰포트 밖의 타일은 렌더링하지 않아 GPU 부하를 줄입니다.

### 타일 타입별 렌더링

| 타일 타입 | 사용 풀 | 렌더링 |
|-----------|---------|--------|
| FILL (0xFF) | closedPool | 닫힌 타일 모양으로 표시 |
| Closed (0x10-0x11) | closedPool | outer + inner 체커보드 |
| Flag (0x20-0x27) | closedPool + flagPool | 체커보드 + 깃발 오버레이 |
| Opened (0x00-0x07) | outerPool + innerPool | 열린 배경 |
| Bomb (0x08) | outerPool + innerPool + boomPool | 열린 배경 + 폭탄 |
| Number (0x01-0x07) | outerPool + innerPool + numberPool | 열린 배경 + 숫자 |

### 갭 없는 타일 배치

부동소수점 좌표를 정수로 스냅하여 타일 사이 틈을 방지합니다:

```typescript
const xFloat = (colIdx - tilePadWidth) * tileSize;
const startX = Math.round(xFloat);
const endX = Math.round(xFloat + tileSize);
const w = endX - startX;  // 반올림으로 인해 1px 차이 보정
```

---

## 3. Canvas 2D 오버레이

### 커서 렌더링 (useCursorRenderer)

**파일**: `src/hooks/useCursorRenderer.ts`

Pixi Stage 위에 Canvas 2D로 그려지는 요소:

- **내 커서**: 화면 중앙에 고정, 클릭 방향으로 회전
- **이동 경로**: A* 경로를 부드러운 곡선으로 표시
- **다른 유저 커서**: 상대 좌표로 위치 계산, 기절 상태 표시
- **클릭 타겟**: 클릭한 타일에 테두리 강조

### 폭발 애니메이션 (useShockwaveAnimation)

**파일**: `src/hooks/useShockwaveAnimation.ts`

`requestAnimationFrame` 루프로 60fps 애니메이션을 실행합니다:

```
진행도 0%~100%:
  0~8%   : 화면 전체 흰색 섬광
  0~70%  : 방사형 광선 (12개 방향)
  5~100% : 동심원 링 (5개 레이어, 시차 적용)
  0~80%  : 비산하는 스파크 (불꽃 입자)
  0~40%  : 중앙 백열 코어
```

각 폭발은 `useExplosionManager`에서 `{ position, startTime, id }`로 추적됩니다.

---

## 4. 커서 이동 시 캔버스 애니메이션

커서가 경로를 따라 이동할 때, 실제 타일 데이터가 바뀌기 전에 **CSS transform**으로 캔버스를 밀어 부드러운 이동 효과를 줍니다.

```
MOVE 이벤트 전송
  → CSS transform: translate(dx * tileSize, dy * tileSize)
  → 타일 데이터 도착 후 transform 리셋
  → 새 타일로 렌더링
```

이 방식은 Pixi Stage를 다시 그리지 않고도 즉시 시각적 피드백을 제공합니다.
