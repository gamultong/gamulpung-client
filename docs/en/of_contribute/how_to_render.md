# How Tile Rendering Works

This project uses **2 rendering layers**:

1. **Pixi.js Stage**: WebGL-based tile rendering (sprite pools)
2. **Canvas 2D**: Cursor, path, and explosion animation overlay

---

## Full Rendering Pipeline

```
Texture pre-rendering (once)
  → useTilemapTextures: create number, flag, bomb textures
  ↓
renderTiles change detected
  → Tilemap useLayoutEffect triggered
  ↓
Calculate visible tile range in viewport
  → startCol/endCol, startRow/endRow
  ↓
Ensure sprite pools
  → ensurePool() grows pools as needed
  ↓
Per-tile rendering
  → Assign sprites from appropriate pool by tile type
  ↓
Hide unused sprites
  → hidePoolFrom()
  ↓
Canvas 2D overlay
  → Draw cursors, paths, explosion effects
```

---

## 1. Texture Creation (useTilemapTextures)

**File**: `src/hooks/useTilemapTextures.ts`

Textures are **pre-generated and cached** at game start.

### Texture Types

| Texture | Creation Method | Cache Key |
|---------|----------------|-----------|
| Tile gradients (outer/inner) | 4px canvas with color interpolation → `Texture.from()` | `"${color1}${color2}${tileSize}"` |
| Numbers (1-8) | Font rendering on canvas → `canvasToTexture()` | Number index |
| Flags (4 colors) | SVG Path2D → canvas → `canvasToTexture()` | `"flag${index}"` |
| Bomb | SVG Path2D → canvas → `canvasToTexture()` | `"boom"` |

### Concurrency Limiter

Texture creation involves GPU operations, so `createLimiter(8)` limits to **max 8 concurrent** operations to prevent main thread/GPU overload.

### Checkerboard Colors

Tiles use 2 color combinations based on position:

```
parity = (col + row) & 1
parity 0: tileColors.outer[0], tileColors.inner[0]  (light)
parity 1: tileColors.outer[1], tileColors.inner[1]  (dark)
```

Color definitions are in `src/assets/renderPaths.json` under `tileColors`.

---

## 2. Pixi.js Tile Rendering (Tilemap)

**File**: `src/components/tilemap/index.tsx`

### Stage Structure

```
<Stage>  (Pixi Application)
  └── <Container name="container">
        ├── <Container name="background">     ← outerPool, innerPool, numberPool
        ├── <Container name="closed-layer">   ← closedPool (outer + inner pairs)
        ├── <Container name="boom-layer">     ← boomPool
        └── <Container name="flag-layer">     ← flagPool
```

### Sprite Pool Pattern

Creating/destroying sprites every frame causes **GC pressure and GPU allocation costs**.
Instead, an **object pool** pattern reuses sprites.

```
Pool types:
  outerPool    — opened tile outer background
  innerPool    — opened tile inner background (with padding)
  closedPool   — closed/flag tile outer+inner pairs
  boomPool     — bomb sprites
  flagPool     — flag sprites
  numberPool   — number (1-7) sprites
```

**Pool management functions** (`src/utils/pixiSpritePool.ts`):
- `ensurePool(pool, container, needed)`: Grow pool if insufficient
- `hidePoolFrom(pool, fromIndex)`: Hide unused sprites

### Visible Tile Range Calculation

```typescript
const startCol = Math.max(0, Math.ceil(tilePadWidth - 1));
const endCol = Math.min(totalCols - 1, (tilePadWidth + (windowWidth + tileSize) / tileSize) >>> 0);
const startRow = Math.max(0, Math.ceil(tilePadHeight - 1));
const endRow = Math.min(totalRows - 1, (tilePadHeight + (windowHeight + tileSize) / tileSize) >>> 0);
```

Tiles outside the viewport are not rendered, reducing GPU load.

### Per-Tile Type Rendering

| Tile Type | Pools Used | Rendering |
|-----------|-----------|-----------|
| FILL (0xFF) | closedPool | Displayed as closed tile shape |
| Closed (0x10-0x11) | closedPool | outer + inner checkerboard |
| Flag (0x20-0x27) | closedPool + flagPool | checkerboard + flag overlay |
| Opened (0x00-0x07) | outerPool + innerPool | open background |
| Bomb (0x08) | outerPool + innerPool + boomPool | open background + bomb |
| Number (0x01-0x07) | outerPool + innerPool + numberPool | open background + number |

### Gap-Free Tile Placement

Float coordinates are snapped to integers to prevent gaps between tiles:

```typescript
const xFloat = (colIdx - tilePadWidth) * tileSize;
const startX = Math.round(xFloat);
const endX = Math.round(xFloat + tileSize);
const w = endX - startX;  // corrects 1px rounding differences
```

---

## 3. Canvas 2D Overlay

### Cursor Rendering (useCursorRenderer)

**File**: `src/hooks/useCursorRenderer.ts`

Elements drawn on Canvas 2D over the Pixi Stage:

- **Player cursor**: Fixed at screen center, rotated toward click direction
- **Movement path**: A* path displayed as smooth curves
- **Other user cursors**: Positioned by relative coordinates, stun state shown
- **Click target**: Border highlight on clicked tile

### Explosion Animation (useShockwaveAnimation)

**File**: `src/hooks/useShockwaveAnimation.ts`

Runs 60fps animation via `requestAnimationFrame` loop:

```
Progress 0%-100%:
  0-8%   : Full-screen white flash
  0-70%  : Radial light rays (12 directions)
  5-100% : Concentric rings (5 layers, staggered)
  0-80%  : Flying sparks (fire particles)
  0-40%  : Central white-hot core
```

Each explosion is tracked by `useExplosionManager` as `{ position, startTime, id }`.

---

## 4. Canvas Animation During Cursor Movement

When the cursor moves along a path, **CSS transform** shifts the canvas before tile data arrives for smooth visual feedback.

```
MOVE event sent
  → CSS transform: translate(dx * tileSize, dy * tileSize)
  → Tile data arrives → reset transform
  → Render with new tiles
```

This provides immediate visual feedback without re-rendering the Pixi Stage.
