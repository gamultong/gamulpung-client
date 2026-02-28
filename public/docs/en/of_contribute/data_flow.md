# Data Flow

## Pipeline Overview

```
┌─────────────────────────────────────────────────────┐
│                 Server Communication                 │
│  WebSocket connection → JSON message send/receive    │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  Message Routing                     │
│  useMessageHandler → event-specific handler dispatch │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  Tile Processing                     │
│  hex string → WASM/JS decode → TileGrid update       │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│               Render Snapshot Creation               │
│  cachingTiles + cursor offset → renderTiles          │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                   Screen Output                      │
│  Pixi.js sprite pools + Canvas 2D overlay            │
└─────────────────────────────────────────────────────┘
```

---

## Stage 1: WebSocket Connection

**File**: `src/store/websocketStore.ts`

The WebSocket connection is managed by a Zustand store.

```
Client starts
  → connect(url) called
  → socket.onopen: isOpen = true
  → socket.onmessage: message state updated
  → socket.onclose: isOpen = false, reconnect attempt
```

**Key state:**
- `socket`: WebSocket instance
- `isOpen`: Connection status
- `message`: Latest received text message
- `binaryMessage`: Latest received binary message (future use)
- `sendMessage(event, payload)`: JSON serialize and send

---

## Stage 2: Message Routing

**File**: `src/hooks/useMessageHandler.ts`

Incoming WebSocket messages are dispatched based on `header.event`.

```
wsMessage (JSON string)
  → JSON.parse → { header: { event }, payload }
  → switch(event):
      TILES_STATE    → replaceTiles() (tile grid update)
      EXPLOSION      → onExplosion() (explosion animation)
      CURSORS_STATE  → setCursors() (other user cursors)
      MY_CURSOR      → setId() (own cursor ID)
      SCOREBOARD     → setRanking() (ranking update)
      QUIT_CURSOR    → remove cursor
      CHAT           → display chat message
```

**Tile processing characteristics:**
- Each chunk in `tiles_li` is processed **sequentially** (`await`)
- Each chunk is rendered immediately after processing (progressive rendering)

---

## Stage 3: Tile Processing

**File**: `src/hooks/useTileProcessing.ts`

### Processing Flow

```
replaceTiles(end_x, end_y, start_x, start_y, hexData, type)
  │
  ├─ type === 'All' → padtiles(Direction.ALL)
  │                    (grid init + LRU cache restore)
  │
  ├─ WASM available?
  │   ├─ YES: process_hex_tiles_inplace()
  │   │       (sync, writes directly to Uint8Array, no async overhead)
  │   └─ NO:  processTileData() (JS fallback)
  │           (VECTORIZED_TILE_LUT 16-bit lookup)
  │
  └─ Result → setTiles(newTiles)
            → cacheTiles() (LRU cache store)
```

### WASM vs JS Processing Paths

| Aspect | WASM Path | JS Path |
|--------|-----------|---------|
| Function | `process_hex_tiles_inplace()` | `processTileData()` |
| Method | Writes directly to Uint8Array | Creates change array, applies in batch |
| Speed | Very fast (synchronous) | Fast (LUT O(1) lookup) |
| When used | After WASM load completes | Before WASM is ready |

### LRU Tile Cache

**File**: `src/utils/tileCache.ts`

```
Tile processing complete → cacheTiles(worldX, worldY, data, w, h)
                            (stores non-FILL tiles by world coordinate)

padtiles(type=ALL) → restoreCachedTiles(worldX, worldY, data, w, h)
                      (restores cached tiles instead of FILL)
```

- Stores up to 100,000 tiles
- FIFO eviction (oldest entries first)
- Instant display on revisit before server response

---

## Stage 4: Render Snapshot Creation

**File**: `src/hooks/useTileProcessing.ts` (`computedRenderTiles`)

```
cachingTiles (tileStore.tiles)
  + cursorOriginPosition
  + cursorPosition
  → compute offsetX/Y
  │
  ├─ offset === 0 → return cachingTiles as-is (O(1))
  │
  └─ offset !== 0 → processWithStableCPU()
                     (row-level memcpy + checkerboard recompute)
                     → generate renderTiles
```

**Key points:**
- `cachingTiles`: Original tile data from server
- `renderTiles`: Display data with cursor movement offset applied
- Returns O(1) when cursor is perfectly aligned (no copy)
- Uses `Uint8Array.set(subarray())` for native row-level copy when offset

---

## Stage 5: Screen Output

### Pixi.js Tile Rendering

**File**: `src/components/tilemap/index.tsx`

```
renderTiles (TileGrid)
  → useLayoutEffect:
      1. Calculate visible tile range in viewport
      2. Ensure sprite pools (ensurePool)
      3. Per-tile rendering:
         ├─ FILL → closedPool (cache-restored or empty)
         ├─ Closed → closedPool (outer + inner checkerboard)
         ├─ Flag → closedPool + flagPool (flag overlay)
         ├─ Opened → outerPool + innerPool
         ├─ Bomb → outerPool + innerPool + boomPool
         └─ Number(1-7) → outerPool + innerPool + numberPool
      4. Hide unused sprites (hidePoolFrom)
```

### Canvas 2D Overlay

**Files**: `src/hooks/useCursorRenderer.ts`, `useShockwaveAnimation.ts`

Elements drawn on Canvas 2D over the Pixi Stage:
- Player cursor (with directional rotation)
- Movement path (curved lines)
- Other user cursors
- Click target tile highlight
- Explosion animation (flash, rays, rings, sparks)

---

## User Input Data Flow

```
Mouse/touch event
  → useInputHandlers:
      left-click → handleClick()
      right-click → handleRightClick()
      long-press → handleLongPress()
  │
  ├─ Adjacent tile (within 1 tile):
  │   → Immediately send OPEN_TILES / SET_FLAG / INSTALL_BOMB / DISMANTLE_MINE
  │
  └─ Distant tile:
      → A* pathfinding (useMovement)
      → Send MOVE events sequentially along path
      → Execute original action on arrival
```

---

## Viewport Synchronization Flow

**File**: `src/hooks/useTileViewport.ts`

```
windowWidth/windowHeight/zoom change
  → useLayoutEffect:
      1. Recalculate start/end points
      2. Update tileSize
  → useLayoutEffect (debounced 200ms):
      → Send SET_WINDOW message to server
      → Server responds with TILES_STATE for new viewport
```

**Debounce effect:**
- Only sends the last change during continuous zoom/resize
- Reduces server requests by ~70%
