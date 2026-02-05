import { XYType } from '@/types';
import { CursorColor } from '@/types/canvas';
import { create } from 'zustand';

export interface ItemsStateType {
  bomb: number;
}

interface CursorState {
  id: string;
  position: XYType;
  color: CursorColor;
  revive_at?: number;
  score: number;
  items: ItemsStateType;
}

interface ClientCursorState extends CursorState {
  id: string;
  originPosition: XYType;
  setId: (id: string) => void;
  setColor: (newColor: CursorColor) => void;
  setPosition: (position: XYType) => void;
  setOriginPosition: (position: XYType) => void;
  isBombMode: boolean;
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomUp: () => void;
  zoomDown: () => void;
  moveUp: () => void;
  moveDown: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  setScore: (score: number) => void;
  setItems: (items: ItemsStateType) => void;
  setIsBombMode: (isBombMode: boolean) => void;
}

export interface OtherCursorState extends CursorState {
  pointer: XYType;
  message: string;
  messageTime: number;
}

interface OtherUserCursorListState {
  cursors: OtherCursorState[];
  addCursors: (cursors: OtherCursorState[]) => void;
  removeCursor: (cursor: OtherCursorState) => void;
  setCursors: (cursors: OtherCursorState[]) => void;
}

export const useCursorStore = create<ClientCursorState>(set => ({
  id: '',
  position: { x: 0, y: 0 },
  color: 'blue',
  originPosition: { x: 0, y: 0 },
  zoom: 1,
  score: 0,
  isBombMode: false,
  items: { bomb: 0 },
  setId: id => set({ id }),
  setColor: color => set({ color }),
  setZoom: zoom => set({ zoom }),
  setIsBombMode: (isBombMode: boolean) => set({ isBombMode }),
  setOriginPosition: (position: XYType) => set({ originPosition: position }),
  setPosition: (position: XYType) => set({ position }),
  zoomUp: () => set(s => ({ zoom: s.zoom * 1.5 < 1.7 ? s.zoom * 1.5 : s.zoom })),
  zoomDown: () => set(s => ({ zoom: s.zoom / 1.5 > 0.15 ? s.zoom / 1.5 : s.zoom })),
  moveUp: () => set(s => ({ position: { x: s.position.x, y: s.position.y - 1 } })),
  moveDown: () => set(s => ({ position: { x: s.position.x, y: s.position.y + 1 } })),
  moveLeft: () => set(s => ({ position: { x: s.position.x - 1, y: s.position.y } })),
  moveRight: () => set(s => ({ position: { x: s.position.x + 1, y: s.position.y } })),
  setScore: score => set({ score }),
  setItems: items => set({ items }),
}));

export const useOtherUserCursorsStore = create<OtherUserCursorListState>(set => ({
  cursors: [],
  addCursors: cursors => set(state => ({ cursors: [...state.cursors, ...cursors] })),
  removeCursor: cursor => set(state => ({ cursors: state.cursors.filter(c => c !== cursor) })),
  setCursors: cursors => set({ cursors }),
}));
