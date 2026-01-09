import { create } from 'zustand';
import { Direction, XYType } from '@/types';

export const FILL_CHAR = '??';

interface TileStore {
  // 실제 타일 데이터 (canonical data)
  tiles: string[][];

  // 렌더링용 스냅샷
  renderTiles: string[][];

  // 시작/끝 포인트
  startPoint: XYType;
  endPoint: XYType;
  renderStartPoint: XYType;

  // 타일 크기
  tileSize: number;

  // 업데이트 함수들
  setTiles: (tiles: string[][]) => void;
  setRenderTiles: (tiles: string[][]) => void;
  setStartPoint: (point: XYType) => void;
  setEndPoint: (point: XYType) => void;
  setRenderStartPoint: (point: XYType) => void;
  setTileSize: (size: number) => void;

  // 타일 조작 함수들
  padtiles: (from_x: number, from_y: number, to_x: number, to_y: number, type: Direction) => void;
  applyTileChanges: (changes: Array<{ row: number; col: number; value: string }>) => void;

  // 초기화
  reset: () => void;

  // 헬퍼 함수
  getTile: (row: number, col: number) => string;
}

const initialState = {
  tiles: [] as string[][],
  renderTiles: [] as string[][],
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
    const [rowLen, colLen] = [Math.abs(to_x - from_x) + 1, Math.abs(to_y - from_y) + 1];
    const [rowLenObj, colLenObj] = [{ length: rowLen }, { length: colLen }];
    const { UP, ALL, DOWN, LEFT, RIGHT, DOWN_LEFT, DOWN_RIGHT, UP_LEFT, UP_RIGHT } = Direction;
    const prevTiles = tiles;
    let map = [...prevTiles];
    const fillRow = Array(rowLen).fill(FILL_CHAR);

    if (type === ALL) map = Array.from(colLenObj, () => Array.from(rowLenObj, () => FILL_CHAR));
    // except type is ALL, pad 1 block to side
    if (type === UP || type === UP_RIGHT || type === UP_LEFT) map = [fillRow, ...map.slice(0, map.length - 1)];
    if (type === DOWN || type === DOWN_RIGHT || type === DOWN_LEFT) map = [...map.slice(1, map.length), fillRow];
    if (type === LEFT || type === DOWN_LEFT || type === UP_LEFT)
      for (let i = 0; i < map.length && map[i]; i++) map[i] = [FILL_CHAR, ...map[i].slice(0, map[i].length - 1)];
    if (type === RIGHT || type === DOWN_RIGHT || type === UP_RIGHT)
      for (let i = 0; i < map.length && map[i]; i++) map[i] = [...map[i].slice(1, map[i].length), FILL_CHAR];

    console.log('pad after', type, performance.now(), map.map(row => row.map(cell => cell[0]).join('')).join('\n'));
    set({ tiles: map });
  },

  applyTileChanges: changes => {
    if (changes.length < 1) return;
    const { tiles } = get();
    const newTiles = tiles.map(row => [...row]); // Deep copy

    changes.forEach(({ row, col, value }) => {
      if (!newTiles[row]) return;
      newTiles[row][col] = value;
    });

    set({ tiles: newTiles });
  },

  reset: () => set(initialState),

  getTile: (row, col) => {
    const { tiles } = get();
    return tiles[row]?.[col] || FILL_CHAR;
  },
}));

// 성능 최적화를 위한 selector hooks
export const useTiles = () => useTileStore(state => state.tiles);
export const useRenderTiles = () => useTileStore(state => state.renderTiles);
export const useStartPoint = () => useTileStore(state => state.startPoint);
export const useEndPoint = () => useTileStore(state => state.endPoint);
export const useRenderStartPoint = () => useTileStore(state => state.renderStartPoint);
export const useTileSize = () => useTileStore(state => state.tileSize);
