import { create } from 'zustand';
import { Direction, XYType } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TileGrid, Tile } from '@/utils/tileGrid';

const COLOR_NONE = 0;

interface ColoredTileStore {
  colorTiles: TileGrid;
  renderColorTiles: TileGrid;

  startPoint: XYType;

  setColorTiles: (tiles: TileGrid) => void;
  setRenderColorTiles: (tiles: TileGrid) => void;
  setStartPoint: (point: XYType) => void;

  applyColorChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
  padColorTiles: (from_x: number, from_y: number, to_x: number, to_y: number, type: Direction) => void;

  reset: () => void;
}

const initialState = {
  colorTiles: TileGrid.empty(),
  renderColorTiles: TileGrid.empty(),
  startPoint: { x: 0, y: 0 },
};

export const useColoredTileStore = create<ColoredTileStore>((set, get) => ({
  ...initialState,

  setColorTiles: colorTiles => set({ colorTiles }),
  setRenderColorTiles: renderColorTiles => set({ renderColorTiles }),
  setStartPoint: startPoint => set({ startPoint }),

  applyColorChanges: changes => {
    if (changes.length < 1) return;
    const { colorTiles } = get();
    const newTiles = colorTiles.clone();
    for (const { row, col, value } of changes) {
      newTiles.set(row, col, value);
    }
    set({ colorTiles: newTiles });
  },

  padColorTiles: (from_x, from_y, to_x, to_y, type) => {
    const { colorTiles } = get();
    const width = Math.abs(to_x - from_x) + 1;
    const height = Math.abs(to_y - from_y) + 1;
    const { UP, ALL, DOWN, LEFT, RIGHT, DOWN_LEFT, DOWN_RIGHT, UP_LEFT, UP_RIGHT } = Direction;

    if (type === ALL) {
      const newGrid = new TileGrid(width, height, COLOR_NONE);
      set({ colorTiles: newGrid });
      return;
    }

    const newGrid = colorTiles.clone();
    const { data } = newGrid;
    const w = newGrid.width;
    const h = newGrid.height;

    if (type === UP || type === UP_RIGHT || type === UP_LEFT) {
      data.copyWithin(w, 0, (h - 1) * w);
      data.fill(COLOR_NONE, 0, w);
    }
    if (type === DOWN || type === DOWN_RIGHT || type === DOWN_LEFT) {
      data.copyWithin(0, w, h * w);
      data.fill(COLOR_NONE, (h - 1) * w, h * w);
    }

    if (type === LEFT || type === DOWN_LEFT || type === UP_LEFT) {
      for (let row = h - 1; row >= 0; row--) {
        const offset = row * w;
        data.copyWithin(offset + 1, offset, offset + w - 1);
        data[offset] = COLOR_NONE;
      }
    }
    if (type === RIGHT || type === DOWN_RIGHT || type === UP_RIGHT) {
      for (let row = 0; row < h; row++) {
        const offset = row * w;
        data.copyWithin(offset, offset + 1, offset + w);
        data[offset + w - 1] = COLOR_NONE;
      }
    }

    set({ colorTiles: newGrid });
  },

  reset: () => set(initialState),
}));

export const useColorTiles = () => useColoredTileStore(state => state.colorTiles);
export const useRenderColorTiles = () => useColoredTileStore(state => state.renderColorTiles);
