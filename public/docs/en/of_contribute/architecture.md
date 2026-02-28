# Project Architecture

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | Next.js | 14.x | App Router SSR/SSG |
| UI | React | 18.x | Component-based UI |
| Rendering | Pixi.js | 7.x | WebGL 2D tile rendering |
| Rendering Bindings | @pixi/react | 7.x | React-Pixi integration |
| State Management | Zustand | 5.x | Lightweight global state |
| Graph Visualization | @xyflow/react | 12.x | Skill tree / Sitemap |
| Markdown | Showdown | 2.x | Documentation rendering |
| Styling | SASS | 1.x | SCSS modules |
| Tile Processing | WASM (Rust) | — | High-performance hex→tile conversion |

---

## Directory Structure

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx            # Home (landing page)
│   ├── layout.tsx          # Root layout
│   ├── play/               # Game page
│   │   ├── page.tsx        # Game orchestrator
│   │   ├── layout.tsx      # Play layout
│   │   └── constants.ts    # RENDER_RANGE, WS_URL, etc.
│   ├── documents/          # Documentation pages
│   ├── robots.ts           # SEO robots.txt
│   └── sitemap.ts          # Sitemap XML
│
├── components/             # React components
│   ├── canvas/             # Canvas orchestrator
│   ├── tilemap/            # Pixi.js tile renderer
│   ├── canvasDashboard/    # Zoom/stats UI
│   ├── skilltree/          # Skill tree (ReactFlow)
│   ├── chat/               # Chat overlay
│   ├── scoreboard/         # Ranking display
│   ├── inactive/           # Revive countdown
│   └── ...
│
├── hooks/                  # Custom hooks
│   ├── useMessageHandler   # WebSocket message routing
│   ├── useTileProcessing   # hex → Uint8Array conversion
│   ├── useTileViewport     # Viewport calc + SET_WINDOW
│   ├── useInputHandlers    # Mouse/touch input
│   ├── useMovement         # A* pathfinding + cursor animation
│   ├── useCursorRenderer   # Cursor/path Canvas 2D rendering
│   ├── useExplosionManager # Explosion state management
│   ├── useShockwaveAnimation # Explosion animation (RAF)
│   ├── useSkillTree        # Skill tree logic
│   ├── useTilemapTextures  # Pixi texture creation/caching
│   └── useScreenSize       # Window size tracking
│
├── store/                  # Zustand state stores
│   ├── websocketStore      # WebSocket connection state
│   ├── tileStore           # Tile grid + view bounds
│   ├── cursorStore         # Cursor position/zoom/score
│   ├── interactionStore    # Click position/animation
│   ├── skillTreeStore      # Purchased skills list
│   └── rankingStore        # Leaderboard
│
├── utils/                  # Utilities
│   ├── tileGrid.ts         # TileGrid class (Uint8Array)
│   ├── tileCache.ts        # World-coordinate LRU cache
│   ├── wasmTileEngine.ts   # WASM module loader
│   ├── tiles.ts            # Hex parsing LUT (vectorized)
│   ├── aStar.ts            # A* pathfinding algorithm
│   ├── pixiSpritePool.ts   # Sprite object pool
│   ├── canvas.ts           # Canvas drawing helpers
│   └── makePath2d.ts       # SVG → Path2D converter
│
├── types/                  # TypeScript type definitions
│   ├── message.ts          # WebSocket protocol types
│   ├── canvas.ts           # Rendering types
│   ├── position.ts         # Coordinate/direction types
│   └── ...
│
├── constants/              # Global constants
│   └── cursor.ts           # Cursor colors, 8-way offsets
│
├── assets/                 # SVG vector paths
│   └── renderPaths.json    # Tile/cursor/flag/bomb vectors
│
└── wasm-pkg/               # WASM bindings (compiled from Rust)
    └── minesweeper_tile_engine.wasm
```

---

## Zustand State Management

```
┌──────────────────────────────────────┐
│          Zustand Stores              │
├──────────────────────────────────────┤
│ websocketStore  → socket, msg buffer │
│ tileStore       → tile grid, bounds  │
│ cursorStore     → position, zoom     │
│ interactionStore→ click, animation   │
│ skillTreeStore  → purchased skills   │
│ rankingStore    → ranking data       │
└──────────────────────────────────────┘
       ↑ (setters)         ↓ (selectors)
    Hooks/Events        React Components
```

**Unidirectional data flow:**
1. WebSocket event → `useMessageHandler` reads store state
2. Store setter called (e.g., `applyTileChanges`)
3. Subscribed components re-render
4. Components read fresh store state

---

## Module Responsibilities

### Hooks

| Hook | Responsibility |
|------|---------------|
| `useMessageHandler` | Routes incoming WebSocket messages to event-specific handlers |
| `useTileProcessing` | Converts hex-encoded tile data to TileGrid (Uint8Array); WASM-first, JS fallback |
| `useTileViewport` | Calculates viewport bounds from zoom & cursor; debounces SET_WINDOW requests |
| `useInputHandlers` | Detects left-click, right-click, long-press and triggers tile interactions |
| `useMovement` | A* pathfinding, animates cursor along path, sends MOVE events |
| `useCursorRenderer` | Draws player cursor, other cursors, and path lines on Canvas 2D |
| `useExplosionManager` | Tracks active explosions (position, startTime, ID) |
| `useShockwaveAnimation` | RAF loop for explosion animation (flash, rays, rings, sparks) |
| `useSkillTree` | Manages ReactFlow nodes/edges, skill purchase, speed calculation |
| `useTilemapTextures` | Pre-renders number textures + SVG assets as Pixi Textures |
| `useScreenSize` | Detects window resize events, returns viewport dimensions |

### Stores

| Store | Managed State |
|-------|--------------|
| `websocketStore` | Socket object, isOpen, message buffer, binary message, connect/disconnect/sendMessage |
| `tileStore` | tiles (TileGrid), renderTiles, startPoint/endPoint, tileSize, padtiles/applyChanges |
| `cursorStore` | Player: id, position, color, zoom, score, items; Other users' cursor list |
| `interactionStore` | Click position (x, y, content), movecost, useAnimation toggle |
| `skillTreeStore` | purchasedSkills array |
| `rankingStore` | Leaderboard rankings |

### Key Components

| Component | Role |
|-----------|------|
| `canvas/` | Orchestrator: coordinates tilemap, cursor rendering, input, animations |
| `tilemap/` | Pixi Stage + sprite pools (bg, closed, boom, flag, number layers) |
| `canvasDashboard/` | Zoom buttons, score/bomb display, animation/bomb mode toggles |
| `skilltree/` | ReactFlow graph + skill info panel + purchase button |

---

## Performance Optimizations

| Technique | Description |
|-----------|-------------|
| Sprite Pooling | Reuse Pixi sprites instead of create/destroy per frame |
| Flat Uint8Array | O(1) native memcpy tile copy via `Uint8Array.slice()` |
| Vectorized LUT | 16-bit hex→tile type O(1) conversion without branching |
| WASM Processing | Hex tile decoding 10-100x faster than JS |
| RAF Loop | Smooth 60fps animations without blocking main thread |
| Texture Caching | Pre-render number textures + SVG assets once at startup |
| Concurrency Limiter | Max 8 concurrent GPU operations to prevent stalls |
| LRU Tile Cache | World-coordinate cache for instant restore on revisit |
| SET_WINDOW Debounce | 200ms debounce to reduce server request flood |
| A* Early Exit | Adjacent tiles bypass full pathfinding |