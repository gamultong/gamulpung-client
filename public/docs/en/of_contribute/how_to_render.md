# How to Render Tiles

This project uses three `<canvas>` elements to render graphics for animation efficiency:

1. **Tile Canvas**: Renders the tiles.
2. **Interaction Canvas**: Draws cursor paths and interaction ranges.
3. **Cursor Canvas**: Draws the user cursor.

---

## How to Generate Frames

### 0. Initialize Start and End Points

Initialize the tiles based on the client's window size and initial tile size, and set the start and end points. This is calculated based on the number of tiles that can be rendered in the client's window. For more details, see `play/page.tsx`.

---

### 1. Connect to the Server

This hook attempts to reconnect the WebSocket using the specified URL and view size if the WebSocket is not open and the start and end points are defined. For more details, see `play/page.tsx`.

---

### 2. Fetch Tile Data from the Server Using WebSocket

Establish a WebSocket connection to fetch tile and cursor data from the server and listen for incoming messages. When a message is received, parse the data and update the state.

- Request all tiles based on the start and end points, initially setting all tiles to "??".

**Note**:
- The `start_y` and `end_y` coordinates are inverted on the y-axis.
Reason: The backend uses Cartesian coordinates, while the frontend is based on the browser's rendering direction.

- Use the extracted values in the `replaceTiles` function to update the tiles.
  1. Parse the received hex data string as follows:
     0 - Open check, 1 - Mine check, 2 - Flag check, 3 ~ 4 Color (00 red, 01 yellow, 10 blue, 11 purple), 5 ~ 7 Number of mines (000 0, 010 2, ... 111 8)
  2. Fill the next line if one line is complete.
  3. If all lines are filled, invert the y-axis and replace only the requested tiles.

When the requested tiles are delivered from the server, replace the dummy data tiles with the delivered tiles. For more details, see `play/page.tsx`.

---

### 3. Path2D Object and Font Caching

Cache Path2D objects to improve rendering performance and use `fontface.load()` to load local fonts as a Promise object to prevent initial font application issues. For more details, see `components/canvas/index.tsx`.

---

### 4. Render Tiles on Canvas

Once all properties are cached, set the loading state to `false` and render the tiles on the tile canvas. Rendering varies based on properties such as tile map, tile size, cursor position, click position, color, zoom, etc.

- **My Cursor Canvas**
  A canvas used to simply display the client's cursor in the center of the client's screen.

- **Tile Canvas**:
  This canvas uses React-Pixi for graphics.
  - Define internal coordinates: Set the area to apply the gradient.
  - Tile Texture
    1. Create tile texture: Create a virtual canvas to draw the vector path, then cache the canvas as a texture.
    2. Cache tile texture: Retrieve the cached texture if the tile size changes.
  - Tile Component
    1. Create tile component: Render the created texture using PIXI.js's Sprite component.
    2. Cache tile component: Clone the cached tile sprite.
  - Rendering Optimization: Antialiasing is not used to smooth textures, and the resolution (quality) decreases when client movement is detected.

- **Interaction Canvas**:
  - Highlight clicked tile: Draw a border around the clicked tile to provide visual feedback.
  - Draw client cursor path: If a path exists (`paths.length > 0`), draw a line connecting the centers of the tiles.

- **Cursor Canvas**:
  - Set up canvas: Get the canvas to draw other user cursors.
  - Clear previous drawings: Use `clearRect` to clear the canvas.
  - Draw cursors:
    - Iterate through each cursor in the `cursors` array.
    - Calculate the exact position of each cursor.
    - Use the `drawCursor` function to draw the cursor with the correct position and color.

- **Canvas Animation Due to Client Movement (excluding less than 40%)**
  - All canvases except my cursor canvas set a CSS transform effect towards the next path as the tile state changes with my cursor movement.

For detailed code, see `components/canvas/index.tsx`.

---

### 5. Update Canvas

Update the canvas when the following events occur:

#### 5-1. When the Client Cursor Position Changes

Load tiles in the direction of movement, similar to the previous tile loading method. Push tiles in the opposite direction and fill the empty space with "??", then load and replace the tiles.

Diagonal movement is handled in the same way. Load tiles in the direction of movement, push tiles in the opposite direction, fill the empty space, and replace the tiles.

Then set the start and end points and re-render all canvases based on the cursor position.

#### 5-2. When the State of Other Cursors Changes

Re-render the cursor canvas based on the position of other cursors.

#### 5-3. When a Specific Tile is Updated

Replace the tile and re-render all canvases. When replacing tiles, parse the hex value and apply it immediately without using dummy data like "??".

#### 5-4. When the Client Adjusts the Tile Size

Set the start and end points and re-render all canvases based on the cursor position.
