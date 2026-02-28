# Tile System

## Tile Byte Encoding

Tile data is stored as a **flat Uint8Array** in the `TileGrid` class (`src/utils/tileGrid.ts`).
Each tile is represented by 1 byte (0x00~0xFF).

| Byte Value | Constant | Meaning |
|-----------|----------|---------|
| `0x00` (0) | `Tile.OPEN_0` | Opened, 0 adjacent mines |
| `0x01`~`0x07` (1-7) | `Tile.OPEN_1`~`OPEN_7` | Opened, 1-7 adjacent mines |
| `0x08` (8) | `Tile.BOMB` | Bomb |
| `0x10` (16) | `Tile.CLOSED_0` | Closed, checkerboard 0 |
| `0x11` (17) | `Tile.CLOSED_1` | Closed, checkerboard 1 |
| `0x20`~`0x27` (32-39) | `Tile.FLAG_00`~`FLAG_31` | Flag (color 0-3, checker 0-1) |
| `0xFF` (255) | `Tile.FILL` | Uninitialized / empty tile |

### Bit Structure

```
Closed tile: 0001 000C  (C = checkerboard bit)
Flag tile:   0010 CCPC  (CC = color 2 bits, P = parity, C = checker)
```

### Fast Predicate Functions (Bitwise)

| Function | Logic | Purpose |
|----------|-------|---------|
| `isTileOpen(b)` | `b <= 7` | Open tile (0-7) |
| `isTileBomb(b)` | `b === 0x08` | Bomb |
| `isTileClosed(b)` | `(b & 0xFE) === 0x10` | Closed tile |
| `isTileFlag(b)` | `b >= 0x20 && b <= 0x27` | Flag tile |
| `isTileFill(b)` | `b === 0xFF` | Uninitialized |
| `isTileClosedOrFlag(b)` | `b >= 0x10 && b <= 0x27` | Closed or flag |
| `getTileChecker(b)` | `b & 1` | Checkerboard parity |
| `getFlagColor(b)` | `(b - 0x20) >> 1` | Flag color index |

---

## TileGrid Class

**File**: `src/utils/tileGrid.ts`

```typescript
class TileGrid {
  data: Uint8Array;    // flat array (row * width + col)
  width: number;
  height: number;

  get(row, col): number    // returns Tile.FILL for out-of-bounds
  set(row, col, value)     // no-op for out-of-bounds
  clone(): TileGrid        // Uint8Array.slice() native memcpy
  isEmpty: boolean         // width === 0 || height === 0
  static empty(): TileGrid // empty grid (0x0)
}
```

**Memory layout:**
- Row-major order
- Indexed by `data[row * width + col]`
- `clone()` uses `Uint8Array.slice()` → native memcpy (optimized O(n))

---

## Server → Client Tile Conversion

### Hex Encoding Format

The server sends tile data as a **hex string**.

```
Each tile = 2-digit hex (1 byte)
Example: "0A1B2C..." → tile0=0x0A, tile1=0x1B, tile2=0x2C
```

**Hex byte bit structure:**
```
Bit 7: opened (0=opened)
Bit 6: is mine
Bit 5: is flag
Bit 4-3: color (00=red, 01=yellow, 10=blue, 11=purple)
Bit 2-0: adjacent mine count (0-7)
```

### Conversion Paths

#### WASM Path (Default)

**File**: `src/utils/wasmTileEngine.ts`

```
hex string
  → TextEncoder.encode() (convert to Uint8Array)
  → wasm.process_hex_tiles_inplace(hexBytes, gridData, ...)
  → writes directly to TileGrid.data
  → returns change count
```

- **Synchronous processing**: no async/await overhead
- **Zero-copy**: clones existing grid, then WASM modifies directly
- Automatic JS fallback if WASM load fails

#### JS Fallback Path

**File**: `src/hooks/useTileProcessing.ts`

```
hex string
  → read 2 bytes at a time (charCodeAt)
  → VECTORIZED_TILE_LUT[16-bit index] (O(1) lookup)
  → compute checkerboard parity: (col + yAbs + startPoint.x) & 1
  → create change array → applyTileChanges()
```

**VECTORIZED_TILE_LUT**: Pre-computed lookup table with 65,536 entries
- 16-bit index = (first hex char << 8) | second hex char
- O(1) tile type determination without branching

---

## LRU Tile Cache

**File**: `src/utils/tileCache.ts`

### Purpose

When the cursor moves, `padtiles(type=ALL)` initializes the entire grid with FILL (0xFF).
Without the LRU cache, previously loaded tiles appear empty until the server responds.
With the cache, tiles are **restored instantly before the server response**.

### How It Works

```
┌─────────────────────────────────────┐
│         Cache Write                  │
│  After replaceTiles completes:       │
│  cacheTiles(worldX, worldY,          │
│             data, width, height)     │
│  → stores non-FILL tiles as "x,y"   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         Cache Read                   │
│  During padtiles(type=ALL):          │
│  restoreCachedTiles(worldX, worldY,  │
│                     data, w, h)      │
│  → uses cached values instead of FILL│
└─────────────────────────────────────┘
```

### Configuration

- **Max size**: 100,000 tiles
- **Key format**: `"${worldX},${worldY}"` (world coordinates)
- **Eviction**: FIFO (oldest entries deleted first)
- **Memory**: ~100KB (100K × 1-byte values + key strings)

---

## padtiles (Tile Shifting)

**File**: `src/store/tileStore.ts`

When the cursor moves, the existing tile grid is shifted in the movement direction, filling gaps.

### Direction-Based Operations

| Direction | Action | Empty Space |
|-----------|--------|-------------|
| `ALL` | Create entirely new grid | Restore from LRU cache |
| `UP` | Shift rows down by 1 | First row = FILL |
| `DOWN` | Shift rows up by 1 | Last row = FILL |
| `LEFT` | Shift columns right by 1 | First column = FILL |
| `RIGHT` | Shift columns left by 1 | Last column = FILL |
| `UP_LEFT`, `UP_RIGHT`, ... | Combined vertical + horizontal | Corner + edges |

### Implementation

- `Uint8Array.copyWithin()`: Native memory move (equivalent to C's memmove)
- `Uint8Array.fill()`: Fill empty space with FILL (0xFF)
- Diagonal movement applies vertical shift + horizontal shift sequentially

---

## Checkerboard Pattern

Closed tiles and flag tiles display two alternating colors in a checkerboard pattern.

```
checkerboard bit = (absoluteX + absoluteY) & 1
```

- `0`: Even parity (light color)
- `1`: Odd parity (dark color)

Checkerboard values are based on **absolute world coordinates**, so they must be recomputed when tiles are shifted.
`computedRenderTiles` resets the checkerboard bit for closed/flag tiles:

```typescript
if (tile >= 0x10 && tile <= 0x27) {
  dstData[idx] = (tile & 0xFE) | ((absX + absY) & 1);
}
```
