import { XYType } from '@/types';
import { CursorColor } from '@/types/canvas';
import { create } from 'zustand';

interface CursorState {
  id: string;
  x: number;
  y: number;
  color: CursorColor;
  revive_at?: number;
}

interface ClientCursorState extends CursorState {
  id: string;
  originX: number;
  originY: number;
  setId: (id: string) => void;
  setColor: (newColor: CursorColor) => void;
  setPosition: (x: number, y: number) => void;
  setX: (x: number) => void;
  setY: (y: number) => void;
  goOriginTo: (x: number, y: number) => void;
  setOringinPosition: (x: number, y: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomUp: () => void;
  zoomDown: () => void;
  moveUp: () => void;
  moveDown: () => void;
  moveLeft: () => void;
  moveRight: () => void;
}

export interface OtherUserSingleCursorState extends CursorState {
  pointer: XYType;
  message: string;
  messageTime: number;
}

interface OtherUserCursorsState {
  cursors: OtherUserSingleCursorState[];
  addCursors: (cursor: OtherUserSingleCursorState[]) => void;
  removeCursor: (cursor: OtherUserSingleCursorState) => void;
  setCursors: (cursors: OtherUserSingleCursorState[]) => void;
}

export const useCursorStore = create<ClientCursorState>(set => ({
  id: '',
  x: 0,
  y: 0,
  color: 'blue',
  originX: 0,
  originY: 0,
  zoom: 1,
  setId: id => set({ id }),
  setColor: color => set({ color }),
  setX: x => set({ x }),
  setY: y => set({ y }),
  setZoom: zoom => set({ zoom }),
  setOringinPosition: (x, y) => set({ originX: x, originY: y }),
  goOriginTo: (x, y) => set(s => ({ originX: x + s.originX, originY: y + s.originY })),
  setPosition: (x, y) => set({ x, y }),
  zoomUp: () => set(s => ({ zoom: s.zoom * 1.5 < 1.7 ? s.zoom * 1.5 : s.zoom })),
  zoomDown: () => set(s => ({ zoom: s.zoom / 1.5 > 0.15 ? s.zoom / 1.5 : s.zoom })),
  moveUp: () => set(s => ({ y: s.originY - 1 })),
  moveDown: () => set(s => ({ y: s.originY + 1 })),
  moveLeft: () => set(s => ({ x: s.originX - 1 })),
  moveRight: () => set(s => ({ x: s.originX + 1 })),
}));

export const useOtherUserCursorsStore = create<OtherUserCursorsState>(set => ({
  cursors: [],
  addCursors: cursors => set(state => ({ cursors: [...state.cursors, ...cursors] })),
  removeCursor: cursor => set(state => ({ cursors: state.cursors.filter(c => c !== cursor) })),
  setCursors: cursors => set({ cursors }),
}));
