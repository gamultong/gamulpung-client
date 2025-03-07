# Kinds of Websocket Events
## 1. Summary
The websocket message handler processes various events sent from the server. Each event triggers specific actions based on its type and associated payload. This handles tiles, cursor positions, and user actions, maintaining synchronization between the client and server.

| Request Name        | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `Create Connection` | Creates a websocket connection to the server, including the client's screen size in the URL query string. |
| `fetch-tiles`       | Requests tile data for a specified range from the server.                   |
| `set-view-size`     | Sends the client's current screen size to the server to optimize tiles for the visible area. |
| `pointing`          | Sends the cursor position to the server and performs a click action on a specific tile. |
| `moving`            | Requests to move to a target location, checking if the move is possible according to the rules. |

| Event Name          | Purpose                                | Key Actions                                           |
|---------------------|----------------------------------------|-------------------------------------------------------|
| `tiles`             | Updates the requested tile grid.       | Updates the grid with `replaceTiles`.                 |
| `flag-set`          | Processes tile flags.                  | Updates cached tile data.                             |
| `tiles-opened`      | Updates the state of all tiles.        | Modifies the tile grid based on the payload.          |
| `single-tile-opened`| Updates the state of a single tile.    | Replaces data in the current tile array immediately.  |
| `my-cursor`         | Sets initial user information.         | Updates cursor position, color, and pointer info.     |
| `you-died`          | Manages user death countdown.          | Calculates and sets the revival time.                 |
| `cursors-died`      | Manages other users' death countdown.  | Calculates and displays the revival time.             |
| `my-cursor`         | Sets the initial client position.      | Loads nearby tile data based on the user's position.  |
| `cursors`           | Updates other users' cursors.          | Normalizes cursor positions and colors, then updates the state. |
| `moved`             | Updates cursor movement events.        | Dynamically adjusts cursor positions.                 |
| `cursor-quit`       | Removes the cursor of a user who quit. | Deletes cursor data from the state.                   |
| `pointer-set`       | Allows clients to see where others are pointing. | Adjusts the pointer position of non-client cursors.   |
| `chat`              | Displays chat messages from other users. | Outputs chats on the chat component.                  |

---

## 2. Request Types and Actions

### 2.1. `Create Connection` Request
Creates a websocket connection, adding the screen width and height information to the URL query string.
Purpose: Allows the server to determine the number of tiles the client browser can render.

---

### 2.2. `fetch-tiles` Request
Sends a `fetch-tiles` request to the server to retrieve tile data for a defined range of coordinates.

**Request Body Fields**
| Field Name | Type   | Description                                      |
|------------|--------|--------------------------------------------------|
| `start_p`  | Object | Defines the start position of the requested tile range. |
| `start_p.x`| Number | X-coordinate of the start point.                 |
| `start_p.y`| Number | Y-coordinate of the start point.                 |
| `end_p`    | Object | Defines the end position of the requested tile range.   |
| `end_p.x`  | Number | X-coordinate of the end point.                   |
| `end_p.y`  | Number | Y-coordinate of the end point.                   |

---

### 2.3. `set-view-size` Request
Informs the server of the current client screen or display area size, allowing the server to optimize tile data for the visible area.

**Request Body Fields**
| Field Name | Type   | Description                                      |
|------------|--------|--------------------------------------------------|
| `width`    | Number | Width of the current screen or visible area (in tiles). |
| `height`   | Number | Height of the current screen or visible area (in tiles). |

---

### 2.4. `pointing` Request
Sends the current cursor position to the server and performs a click action on a specific tile. The server processes this event and responds with updated cursor information or tile status.

**Request Body Fields**
| Field Name  | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `position.x`| Integer| X-coordinate of the cursor position.             |
| `position.y`| Integer| Y-coordinate of the cursor position.             |
| `click_type`| String | Type of click interaction (`GENERAL_CLICK` or `SPECIAL_CLICK`). |

---

### 2.5. `moving` Request
Sends the target location the player wants to move to the server. The server processes this event and checks if the move is possible according to the rules.

**Request Body Fields**
| Field Name  | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `position.x`| Integer| X-coordinate of the target location.             |
| `position.y`| Integer| Y-coordinate of the target location.             |

---

## 3. Event Types and Actions

### 3.1. `tiles` Event
- **Purpose**: Processes the tiles requested by the user.
- **Payload**: Includes tile grid and boundary position data.
- **Actions**:
  - Extracts the tile grid (`unsortedTiles`) and boundary positions (`start_p`, `end_p`).
  - Calls `replaceTiles` to update the tile grid.

---

### 3.2. `flag-set`, `tiles-opened`, `single-tile-opened` Events
- **Purpose**: Processes unsolicited tile updates or tile flags.
- **Payload**: Includes detailed information on tile positions, states, and visual properties.
- **Actions**:
  - Updates cached tiles with `setCachingTiles`.
  - Determines the following based on tile state:
    - **Opened Tiles**:
      - Contains a mine → Set to `'B'`.
      - No mine → Display the number of surrounding mines (`number`).
    - **Closed Tiles**:
      - Flag set → Display as `'F'` with tile color.
      - No flag → Display as `'C'`.
      - Apply visual changes based on tile position pattern (`0` or `1`).

### 3.3. `my-cursor` Event
- **Purpose**: Initializes current user information and sets cursor state.
- **Payload**: Includes initial coordinates and cursor color.
- **Actions**:
  1. Sets the user cursor based on coordinates (`x`, `y`) and color data provided by the server.
  2. Calls `setMyCursor` to update cursor information.

---

### 3.4. `you-died` Event
- **Purpose**: Manages the revival waiting time after the user transitions to a "dead" state.
- **Payload**: Includes the revival waiting time (`revive_time`).
- **Actions**:
  1. Calculates the revival time based on the current time.
  2. Calls `setReviveTime` to set the revival waiting state.

---

### 3.5. `cursors` Event
- **Purpose**: Updates the cursor states of other users currently in the game.
- **Payload**: Includes coordinates and color information of other users' cursors.
- **Actions**:
  1. Normalizes user cursor data on the client.
  2. Calls `setCursors` to synchronize the current cursor state.

---

### 3.6. `moved` Event
- **Purpose**: Processes the movement event of a specific cursor.
- **Payload**: Includes the final position and state of the moved cursor.
- **Actions**:
  1. Identifies the moved user cursor.
  2. Calls `moveCursor` to update the cursor to the new coordinates.

---

### 3.7. `cursor-quit` Event
- **Purpose**: Removes the cursor of a user who has quit the game or disconnected.
- **Payload**: Includes the ID information of the disconnected user.
- **Actions**:
  1. Removes the cursor corresponding to the specific user ID.
  2. Calls `setCursors` to update the state on the client.

### 3.8. `pointer-set` Event
- **Purpose**: Allows clients to see where other users are pointing.
- **Payload**: Includes the coordinates and user ID of the pointer.
- **Actions**:
  1. Extracts the pointer coordinates (`x`, `y`) and user ID.
  2. Calls `setCursors` to display the pointer at the specified location.

---

### 3.9. `chat` Event
- **Purpose**: Displays chat messages sent by other users.
- **Payload**: Includes the chat message and user ID.
- **Actions**:
  1. Extracts the chat message and user ID.
  2. Calls `setCursors` to add the message to the chat component.

---

### 3.10. `cursors-died` Event
- **Purpose**: Manages the death state of other users.
- **Payload**: Includes the ID and revival waiting time of the deceased user.
- **Actions**:
  1. Extracts the ID and revival waiting time of the deceased user.
  2. Calls `setCursors` to set the revival waiting state.

---