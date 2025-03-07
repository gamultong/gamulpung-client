# About Interactions

You can interact with the client through `onClick` and `onMouseDown` events. All interactions are handled on the interaction canvas.

---

## Overview of Click Interactions  
Users can interact with the tile grid using mouse clicks, and there are two types:  

- **Normal Click (Left Click)**: Used to open tiles or move the cursor.  
- **Special Click (Right Click)**: Used to set or remove flags on tiles.  

The system calculates the tile position and evaluates the tile state to perform the appropriate action.

---

## Coordinate System  
To determine the tile clicked by the user, the system performs the following coordinate transformations:  

1. **Canvas Coordinates**  
  Adjust the mouse click position relative to the screen to fit the canvas grid.  

2. **Relative Tile Coordinates**  
  Convert the click position to a relative position within the tile grid. This is calculated by dividing the adjusted click position by the tile size, considering the spacing between tiles.  

3. **Absolute Tile Coordinates**  
  Adjust the relative coordinates based on the origin to calculate the absolute position of the tile.  

---

## Tile States and Content  
Each tile in the grid can have one of the following states:  

- **Closed Tile**: A tile that has not been interacted with yet.  
- **Flagged Tile**: A tile marked as a potential mine.  
- **Opened Tile**: A revealed tile (no mine).  
- **Out of Bounds Tile**: When a click is outside the grid.  

---

## Click Types  
The type of click interaction is determined by the mouse button:  

| **Click Type**   | **Mouse Button** | **Action**                       |  
|------------------|------------------|----------------------------------|  
| **Normal Click** | Left Click       | Open tile or move cursor.        |  
| **Special Click**| Right Click      | Set or remove flag on tile.      |  

---

## Actions Based on Tile State  

### Normal Click (Left Click)  

| **Tile State**   | **Action**                                      |  
|------------------|-------------------------------------------------|  
| **Closed Tile**  | Open the tile to reveal its content.            |  
| **Opened Tile**  | Move the cursor to the tile if a path exists.   |  
| **Flagged Tile** | No action.                                      |  
| **Out of Bounds**| No action.                                      |  

### Special Click (Right Click)  

| **Tile State**   | **Action**                                      |  
|------------------|-------------------------------------------------|  
| **Closed Tile**  | Set a flag on the tile (mark as suspected mine).|  
| **Flagged Tile** | Remove the flag (revert to closed state).       |  
| **Opened Tile**  | No action.                                      |  
| **Out of Bounds**| No action.                                      |  

---

## Tile Movement  
When the user normal clicks on an opened or exploded tile:  

- The system attempts to move the cursor to the clicked tile.  
- Movement occurs only if there is a valid path from the current position to the target tile.  
- Movement speed is fixed at 5 tiles per second.  

---

## Chat  
Pressing the Enter key activates the chat component. Typing a message and pressing Enter again sends the chat, making it visible to other users.

---

## Event Handling  
When the user interacts with a tile:  

1. The system calculates the tile position (relative and absolute).  
2. Retrieves the content of the clicked tile.  
3. Evaluates the click type (normal or special).  
4. Performs the appropriate action:  
  - Normal Click: Open the tile.  
  - Special Click: Set or remove a flag.  
  - Normal Click (valid tile): Move the cursor.  

---

## Special Conditions  
- If an adjacent tile explodes during interaction, all tile controls are restricted for a certain period (e.g., 3 minutes).  
- Clicks outside the grid are ignored and marked as "Out of Bounds".  