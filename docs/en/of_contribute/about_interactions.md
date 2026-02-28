# About Interactions

## Overview

User input is handled by the `useInputHandlers` hook.
It detects mouse/touch events, calculates tile coordinates, and executes appropriate actions based on tile state.

**File**: `src/hooks/useInputHandlers.ts`

---

## Click Types

| Input | Event | Action |
|-------|-------|--------|
| Left click | `handleClick()` | Open tile or move |
| Right click | `handleRightClick()` | Set/remove flag or install bomb |
| Long press (500ms) | `handleLongPress()` | Dismantle flagged mine (DISMANTLE_MINE) |

---

## Coordinate Conversion

How screen click positions are converted to tile grid coordinates:

```
1. Canvas coordinates
   Convert mouse event clientX/clientY to canvas-relative position

2. Relative tile coordinates
   Divide click position by tile size to get grid-relative position
   (accounts for zoom level and tile padding)

3. Absolute world coordinates
   Adjust relative coordinates based on cursor origin (cursorPosition)
   → Absolute tile position to send to server
```

---

## Actions by Tile State

### Left Click

| Tile State | Adjacent (within 1 tile) | Distant |
|-----------|--------------------------|---------|
| Closed | Send `OPEN_TILES` → open tile | A* pathfind → move then open |
| Opened | Move (1 tile) | A* pathfind → move |
| Flagged | No action | Move to nearest open neighbor |
| Bomb | No action | A* pathfind → move |

### Right Click

| Tile State | Normal Mode | Bomb Mode |
|-----------|-------------|-----------|
| Closed | `SET_FLAG` → set flag | `INSTALL_BOMB` → install bomb |
| Flagged | `SET_FLAG` → remove flag | No action |
| Opened | No action | No action |

### Long Press (500ms)

| Tile State | Action |
|-----------|--------|
| Flagged | `DISMANTLE_MINE` → dismantle flag |
| Other | No action |

---

## A* Pathfinding

**File**: `src/utils/aStar.ts`

When clicking a distant tile, the A* algorithm calculates the optimal path.

### Features

- **8-directional movement**: Cardinal + diagonal
- **Impassable tiles**: Flag tiles are treated as obstacles
- **Early exit**: Skips full search if target is adjacent
- **Cost calculation**: Straight 1.0, diagonal 1.414 (Euclidean distance)

### Path Execution Flow

```
A* path calculation
  → Generate waypoints array [start, ..., destination]
  ↓
useMovement:
  → setInterval at MOVE_SPEED (ms) intervals
  → Each step:
      1. Calculate direction to next waypoint
      2. Move cursor 1 tile
      3. Send MOVE event to server
      4. Call padtiles() (shift grid in movement direction)
      5. CSS transform animation
  → Execute original action on arrival
```

### Movement Speed

Base movement interval: `MOVE_SPEED` (ms/tile)

Movement speed changes based on skills purchased from the skill tree:

```typescript
// Speed multiplier calculation in useSkillTree
const speedMultiplier = purchasedSkills
  .filter(skill => skill.type === 'speed')
  .reduce((mult, skill) => mult * skill.value, 1.0);
```

---

## Chat

Toggle chat input mode with the Enter key:

1. Enter → Activate chat input
2. Type message
3. Enter → Send `CHAT` event to server
4. Displayed as speech bubble for other users (8 seconds)

Movement/click inputs are disabled while chatting.

---

## Special Conditions

- **Stun state**: All inputs disabled for 10 seconds when within 3x3 explosion range
- **Revive countdown**: `inactive` component shows countdown overlay
- **Out-of-grid click**: Ignored (early return after bounds check)
