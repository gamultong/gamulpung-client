# WebSocket Event Types

## Overview

Client and server communicate via JSON messages over WebSocket.
All messages follow the `{ header: { event }, payload }` format.

**Server URL**: `${NEXT_PUBLIC_WS_HOST}/session`

---

## Client → Server (Send Events)

**File**: `src/types/message.ts` (`SendMessageEvent`)

| Event | Description | Payload |
|-------|------------|---------|
| `MOVE` | Move cursor | `{ position: { x, y } }` |
| `OPEN_TILES` | Open a tile | `{ position: { x, y } }` |
| `SET_FLAG` | Set/remove flag | `{ position: { x, y } }` |
| `CREATE_CURSOR` | Join session (create cursor) | `{ width, height }` |
| `SET_WINDOW` | Viewport size change | `{ width, height }` |
| `CHAT` | Send chat message | `{ message: string }` |
| `DISMANTLE_MINE` | Dismantle flagged tile | `{ position: { x, y } }` |
| `INSTALL_BOMB` | Install bomb | `{ position: { x, y } }` |

### SET_WINDOW Debounce

**File**: `src/hooks/useTileViewport.ts`

`SET_WINDOW` is sent when viewport dimensions (windowWidth, windowHeight, zoom) change.
A **200ms debounce** is applied so only the last value is sent during continuous changes.

```
Zoom/resize change
  → Wait 200ms (cancel previous timer)
  → Send SET_WINDOW with last value
  → Server responds with TILES_STATE
```

### Viewport Size Calculation

```typescript
const width = ((windowWidth * RENDER_RANGE) / (ORIGIN_TILE_SIZE * zoom) / 2) >>> 0;
const height = ((windowHeight * RENDER_RANGE) / (ORIGIN_TILE_SIZE * zoom) / 2) >>> 0;
```

- `RENDER_RANGE = 1.5`: Requests 1.5x the screen area (prefetching)
- `ORIGIN_TILE_SIZE = 80`: Base tile size (px)

---

## Server → Client (Receive Events)

**File**: `src/hooks/useMessageHandler.ts`

### TILES_STATE

Server sends requested tile grid data.

**Payload structure:**
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

**Processing:**
1. Each chunk in `tiles_li` is processed **sequentially**
2. Extract start/end coordinates from `range`
3. Compare with full viewport size to determine `All` or `PART`
4. Call `replaceTiles()` → hex decode → TileGrid update
5. Each chunk renders immediately after processing (progressive rendering)

**Note:**
- Y-axis is inverted (server: Cartesian coordinates, client: browser coordinates)
- `top_left.y > bottom_right.y` (server perspective)

---

### EXPLOSION

Mine explosion event. Plays animation for all explosions in the viewport.

**Payload:**
```json
{
  "position": { "x": 5, "y": -3 }
}
```

**Processing:**
1. `onExplosion(position)` → start shockwave animation
2. If cursor is within 3x3 range → 10-second stun (`setLeftReviveTime(10)`)

---

### CURSORS_STATE

Updates the state of all currently connected cursors.

**Payload:**
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

**Processing:**
1. If matching own cursor ID → update score, items, position
2. Other cursors → O(n+m) merge with existing state
3. New cursors added, existing cursors updated

---

### MY_CURSOR

Server assigns cursor ID on initial connection.

**Payload:**
```json
{ "id": "cursor_abc123" }
```

**Processing:**
1. `setId(id)` → set own cursor ID
2. `setTimeout(() => setIsInitialized(true), 0)` → initialization complete flag

---

### SCOREBOARD_STATE

Updates ranking data.

**Payload:**
```json
{
  "scoreboard": {
    "1": 5000,
    "2": 3200,
    "3": 1500
  }
}
```

**Processing:**
1. `setRanking()` → update leaderboard
2. If no cursor ID → send `CREATE_CURSOR` message (join session)

---

### QUIT_CURSOR

Removes cursor when user disconnects.

**Payload:**
```json
{ "id": "cursor_abc123" }
```

**Processing:** Filter the cursor with matching ID from the list

---

### CHAT

Displays chat message from another user.

**Payload:**
```json
{
  "id": "cursor_abc123",
  "message": "Hello!"
}
```

**Processing:** Update cursor's `message` and `messageTime` (displayed for 8 seconds)

---

## Message Processing Architecture

```
WebSocket onmessage
  → websocketStore.message updated
  ↓
useLayoutEffect([message])
  → handleWebSocketMessage(message)
  ↓
JSON.parse → switch(event)
  → Execute event-specific handler
  → Update Zustand stores
  → Trigger React re-render
```

**Key design decisions:**
- `useCursorStore.getState()` / `useOtherUserCursorsStore.getState()` reads fresh state inside callbacks (prevents stale closures)
- `useLayoutEffect` used (runs before paint, prevents flicker)
- Binary message handler (`handleBinaryMessage`) is prepared for future 1-byte-per-tile format support
