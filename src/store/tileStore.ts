import { create } from 'zustand';
import { Direction, XYType } from '@/types';

const FILL_CHAR = '??';

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
  moveCursor: (start_x: number, start_y: number, end_x: number, end_y: number, type: Direction) => void;
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
  
  setTiles: (tiles) => set({ tiles }),
  setRenderTiles: (renderTiles) => set({ renderTiles }),
  setStartPoint: (startPoint) => set({ startPoint }),
  setEndPoint: (endPoint) => set({ endPoint }),
  setRenderStartPoint: (renderStartPoint) => set({ renderStartPoint }),
  setTileSize: (tileSize) => set({ tileSize }),
  
  moveCursor: (start_x, start_y, end_x, end_y, type) => {
    const { tiles } = get();
    const [rowLen, colLen] = [Math.abs(end_x - start_x) + 1, Math.abs(start_y - end_y) + 1];
    const [rowLenObj, colLenObj] = [{ length: rowLen }, { length: colLen }];
    const { UP, ALL, DOWN, LEFT, RIGHT } = Direction;
    const prevTiles = tiles;
    let map = [...prevTiles];

    const fillRow = Array(rowLen).fill(FILL_CHAR);
    const fillCol = Array.from(colLenObj, () => fillRow);

    if (type === UP) map = [...fillCol, ...map.slice(0, -colLen)];
    if (type === DOWN) map = [...map.slice(colLen), ...fillCol];
    if (type === LEFT) for (let i = 0; i < colLen && map[i]; i++) map[i] = [...fillRow, ...map[i].slice(0, map[i].length - rowLen)];
    if (type === RIGHT) for (let i = 0; i < colLen && map[i]; i++) map[i] = [...map[i].slice(rowLen), ...fillRow];
    if (type === ALL) map = Array.from(colLenObj, () => Array.from(rowLenObj, () => FILL_CHAR));
    
    set({ tiles: map });
  },
  
  applyTileChanges: (changes) => {
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

