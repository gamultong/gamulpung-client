import { create } from 'zustand';
import { Direction, XYType } from '@/types';
import { TileGrid, Tile } from '@/utils/tileGrid';

interface TileStore {
  // Canonical tile data (flat Uint8Array via TileGrid)
  tiles: TileGrid;

  // Rendering snapshot
  renderTiles: TileGrid;

  // View bounds
  startPoint: XYType;
  endPoint: XYType;
  renderStartPoint: XYType;

  // Tile pixel size
  tileSize: number;

  // Setters
  setTiles: (tiles: TileGrid) => void;
  setRenderTiles: (tiles: TileGrid) => void;
  setStartPoint: (point: XYType) => void;
  setEndPoint: (point: XYType) => void;
  setRenderStartPoint: (point: XYType) => void;
  setTileSize: (size: number) => void;

  // Tile manipulation
  padtiles: (from_x: number, from_y: number, to_x: number, to_y: number, type: Direction) => void;
  applyTileChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
  applyPackedChanges: (packed: Uint32Array) => void;

  // Reset
  reset: () => void;

  // Helper
  getTile: (row: number, col: number) => number;
}

const initialState = {
  tiles: TileGrid.empty(),
  renderTiles: TileGrid.empty(),
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 0, y: 0 },
  renderStartPoint: { x: 0, y: 0 },
  tileSize: 0,
};

export const useTileStore = create<TileStore>((set, get) => ({
  ...initialState,

  setTiles: tiles => set({ tiles }),
  setRenderTiles: renderTiles => set({ renderTiles }),
  setStartPoint: startPoint => set({ startPoint }),
  setEndPoint: endPoint => set({ endPoint }),
  setRenderStartPoint: renderStartPoint => set({ renderStartPoint }),
  setTileSize: tileSize => set({ tileSize }),

  padtiles: (from_x, from_y, to_x, to_y, type) => {
    const { tiles } = get();
    const width = Math.abs(to_x - from_x) + 1;
    const height = Math.abs(to_y - from_y) + 1;
    const { UP, ALL, DOWN, LEFT, RIGHT, DOWN_LEFT, DOWN_RIGHT, UP_LEFT, UP_RIGHT } = Direction;

    if (type === ALL) {
      set({ tiles: new TileGrid(width, height) });
      return;
    }

    const newGrid = tiles.clone();
    const { data } = newGrid;
    const w = newGrid.width;
    const h = newGrid.height;

    // Vertical shifts
    if (type === UP || type === UP_RIGHT || type === UP_LEFT) {
      // Shift rows down by 1, fill top row with FILL
      data.copyWithin(w, 0, (h - 1) * w);
      data.fill(Tile.FILL, 0, w);
    }
    if (type === DOWN || type === DOWN_RIGHT || type === DOWN_LEFT) {
      // Shift rows up by 1, fill bottom row with FILL
      data.copyWithin(0, w, h * w);
      data.fill(Tile.FILL, (h - 1) * w, h * w);
    }

    // Horizontal shifts
    if (type === LEFT || type === DOWN_LEFT || type === UP_LEFT) {
      // Shift columns right by 1, fill leftmost column with FILL
      for (let row = h - 1; row >= 0; row--) {
        const offset = row * w;
        data.copyWithin(offset + 1, offset, offset + w - 1);
        data[offset] = Tile.FILL;
      }
    }
    if (type === RIGHT || type === DOWN_RIGHT || type === UP_RIGHT) {
      // Shift columns left by 1, fill rightmost column with FILL
      for (let row = 0; row < h; row++) {
        const offset = row * w;
        data.copyWithin(offset, offset + 1, offset + w);
        data[offset + w - 1] = Tile.FILL;
      }
    }

    console.log('pad after', type, performance.now());
    set({ tiles: newGrid });
  },

  applyTileChanges: changes => {
    if (changes.length < 1) return;
    const { tiles } = get();
    const newTiles = tiles.clone(); // Uint8Array.slice() - native memcpy
    for (const { row, col, value } of changes) {
      newTiles.set(row, col, value);
    }
    set({ tiles: newTiles });
  },

  applyPackedChanges: packed => {
    if (packed.length === 0) return;
    const { tiles } = get();
    const newTiles = tiles.clone();
    const data = newTiles.data;
    const w = newTiles.width;
    for (let i = 0; i < packed.length; i++) {
      const p = packed[i];
      data[((p >> 16) & 0xffff) * w + ((p >> 8) & 0xff)] = p & 0xff;
    }
    set({ tiles: newTiles });
  },

  reset: () => set(initialState),

  getTile: (row, col) => {
    const { tiles } = get();
    return tiles.get(row, col);
  },
}));

// Performance selector hooks
export const useTiles = () => useTileStore(state => state.tiles);
export const useRenderTiles = () => useTileStore(state => state.renderTiles);
export const useStartPoint = () => useTileStore(state => state.startPoint);
export const useEndPoint = () => useTileStore(state => state.endPoint);
export const useRenderStartPoint = () => useTileStore(state => state.renderStartPoint);
export const useTileSize = () => useTileStore(state => state.tileSize);
