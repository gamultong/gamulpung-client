# 타일 시스템

## 타일 바이트 인코딩

타일 데이터는 `TileGrid` 클래스(`src/utils/tileGrid.ts`)에 **flat Uint8Array**로 저장됩니다.
각 타일은 1바이트(0x00~0xFF)로 표현됩니다.

| 바이트 값 | 상수 | 의미 |
|-----------|------|------|
| `0x00` (0) | `Tile.OPEN_0` | 열림, 인접 지뢰 0개 |
| `0x01`~`0x07` (1-7) | `Tile.OPEN_1`~`OPEN_7` | 열림, 인접 지뢰 1~7개 |
| `0x08` (8) | `Tile.BOMB` | 폭탄 |
| `0x10` (16) | `Tile.CLOSED_0` | 닫힘, 체커보드 0 |
| `0x11` (17) | `Tile.CLOSED_1` | 닫힘, 체커보드 1 |
| `0x20`~`0x27` (32-39) | `Tile.FLAG_00`~`FLAG_31` | 깃발 (색상 0~3, 체커보드 0~1) |
| `0xFF` (255) | `Tile.FILL` | 미초기화 / 빈 타일 |

### 비트 구조

```
닫힘 타일: 0001 000C  (C = 체커보드 비트)
깃발 타일: 0010 CCPC  (CC = 색상 2비트, P = 패리티, C = 체커보드)
```

### 빠른 판별 함수 (비트 연산)

| 함수 | 로직 | 용도 |
|------|------|------|
| `isTileOpen(b)` | `b <= 7` | 열린 타일 (0~7) |
| `isTileBomb(b)` | `b === 0x08` | 폭탄 |
| `isTileClosed(b)` | `(b & 0xFE) === 0x10` | 닫힌 타일 |
| `isTileFlag(b)` | `b >= 0x20 && b <= 0x27` | 깃발 타일 |
| `isTileFill(b)` | `b === 0xFF` | 미초기화 |
| `isTileClosedOrFlag(b)` | `b >= 0x10 && b <= 0x27` | 닫힘 또는 깃발 |
| `getTileChecker(b)` | `b & 1` | 체커보드 패리티 |
| `getFlagColor(b)` | `(b - 0x20) >> 1` | 깃발 색상 인덱스 |

---

## TileGrid 클래스

**파일**: `src/utils/tileGrid.ts`

```typescript
class TileGrid {
  data: Uint8Array;    // flat 배열 (row * width + col)
  width: number;
  height: number;

  get(row, col): number    // 범위 밖이면 Tile.FILL 반환
  set(row, col, value)     // 범위 밖이면 무시
  clone(): TileGrid        // Uint8Array.slice() 네이티브 memcpy
  isEmpty: boolean         // width === 0 || height === 0
  static empty(): TileGrid // 빈 그리드 (0x0)
}
```

**메모리 레이아웃:**
- 행 우선(row-major) 순서
- `data[row * width + col]` 로 인덱싱
- `clone()`은 `Uint8Array.slice()` 사용 → 네이티브 memcpy (O(n) 최적화)

---

## 서버 → 클라이언트 타일 변환

### Hex 인코딩 형식

서버는 타일 데이터를 **hex 문자열**로 전송합니다.

```
각 타일 = 2자리 hex (1바이트)
예: "0A1B2C..." → 타일0=0x0A, 타일1=0x1B, 타일2=0x2C
```

**hex 바이트 비트 구조:**
```
비트 7: 열림 여부 (0=열림)
비트 6: 지뢰 여부
비트 5: 깃발 여부
비트 4-3: 색상 (00=red, 01=yellow, 10=blue, 11=purple)
비트 2-0: 인접 지뢰 수 (0~7)
```

### 변환 경로

#### WASM 경로 (기본)

**파일**: `src/utils/wasmTileEngine.ts`

```
hex 문자열
  → TextEncoder.encode() (Uint8Array로 변환)
  → wasm.process_hex_tiles_inplace(hexBytes, gridData, ...)
  → TileGrid.data에 직접 기록
  → 변경된 타일 수 반환
```

- **동기 처리**: async/await 오버헤드 없음
- **제로 카피**: 기존 그리드를 clone한 후 WASM이 직접 수정
- WASM 로드 실패 시 자동으로 JS 폴백

#### JS 폴백 경로

**파일**: `src/hooks/useTileProcessing.ts`

```
hex 문자열
  → 2바이트씩 읽기 (charCodeAt)
  → VECTORIZED_TILE_LUT[16비트 인덱스] (O(1) 룩업)
  → 체커보드 패리티 계산: (col + yAbs + startPoint.x) & 1
  → 변경 배열 생성 → applyTileChanges()
```

**VECTORIZED_TILE_LUT**: 65,536개 엔트리의 미리 계산된 룩업 테이블
- 16비트 인덱스 = (첫번째 hex 문자 << 8) | 두번째 hex 문자
- 분기(branching) 없이 O(1)으로 타일 타입 결정

---

## LRU 타일 캐시

**파일**: `src/utils/tileCache.ts`

### 목적

커서 이동 시 `padtiles(type=ALL)`이 전체 그리드를 FILL(0xFF)로 초기화합니다.
LRU 캐시가 없으면 이전에 로드했던 타일도 서버 응답까지 빈 타일로 표시됩니다.
캐시가 있으면 **서버 응답 전에 즉시 복원**됩니다.

### 동작 방식

```
┌─────────────────────────────────────┐
│         캐시 저장 (Write)            │
│  replaceTiles 완료 후:               │
│  cacheTiles(worldX, worldY,          │
│             data, width, height)     │
│  → 비-FILL 타일을 "x,y" 키로 저장    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         캐시 복원 (Read)             │
│  padtiles(type=ALL) 시:              │
│  restoreCachedTiles(worldX, worldY,  │
│                     data, w, h)      │
│  → FILL 대신 캐시된 값 사용           │
└─────────────────────────────────────┘
```

### 설정

- **최대 크기**: 100,000개 타일
- **키 형식**: `"${worldX},${worldY}"` (월드 좌표)
- **퇴거 방식**: FIFO (가장 오래된 항목부터 삭제)
- **메모리**: 약 100KB (100K × 1바이트 값 + 키 문자열)

---

## padtiles (타일 시프트)

**파일**: `src/store/tileStore.ts`

커서가 이동할 때 기존 타일 그리드를 이동 방향으로 밀고, 빈 공간을 채웁니다.

### 방향별 동작

| 방향 | 동작 | 빈 공간 |
|------|------|---------|
| `ALL` | 전체 새 그리드 생성 | LRU 캐시에서 복원 |
| `UP` | 행을 아래로 1칸 이동 | 첫 번째 행 = FILL |
| `DOWN` | 행을 위로 1칸 이동 | 마지막 행 = FILL |
| `LEFT` | 열을 오른쪽으로 1칸 이동 | 첫 번째 열 = FILL |
| `RIGHT` | 열을 왼쪽으로 1칸 이동 | 마지막 열 = FILL |
| `UP_LEFT`, `UP_RIGHT`, ... | 수직 + 수평 결합 | 코너 + 가장자리 |

### 구현

- `Uint8Array.copyWithin()`: 네이티브 메모리 이동 (C의 memmove와 동일)
- `Uint8Array.fill()`: 빈 공간을 FILL(0xFF)로 채움
- 대각선 이동은 수직 시프트 + 수평 시프트를 순차적으로 적용

---

## 체커보드 패턴

닫힌 타일과 깃발 타일은 체커보드 패턴으로 2가지 색상을 번갈아 표시합니다.

```
체커보드 비트 = (절대X + 절대Y) & 1
```

- `0`: 짝수 패리티 (밝은 색)
- `1`: 홀수 패리티 (어두운 색)

체커보드 값은 **절대 월드 좌표** 기준이므로, 타일 이동 시 재계산이 필요합니다.
`computedRenderTiles`에서 닫힘/깃발 타일의 체커보드 비트를 재설정합니다:

```typescript
if (tile >= 0x10 && tile <= 0x27) {
  dstData[idx] = (tile & 0xFE) | ((absX + absY) & 1);
}
```
