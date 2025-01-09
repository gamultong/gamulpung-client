import { create } from 'zustand';

type Color = 'red' | 'blue' | 'yellow' | 'purple';

interface CursorState {
  id: string;
  x: number;
  y: number;
  color: Color;
  revive_at?: number;
}

interface ClientCursorState extends CursorState {
  id: string;
  originX: number;
  originY: number;
  setId: (id: string) => void;
  setColor: (newColor: Color) => void;
  setPosition: (x: number, y: number) => void;
  setX: (x: number) => void;
  setY: (y: number) => void;
  goup: () => void;
  godown: () => void;
  goleft: () => void;
  goright: () => void;
  goUpLeft: () => void;
  goUpRight: () => void;
  goDownLeft: () => void;
  goDownRight: () => void;
  setOringinPosition: (x: number, y: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}

export interface OtherUserSingleCursorState extends CursorState {
  pointer: { x: number; y: number };
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
  x: 100,
  y: 100,
  color: 'blue',
  originX: 100,
  originY: 100,
  zoom: 1,
  setId: id => set({ id }),
  setColor: color => set({ color }),
  setX: x => set({ x }),
  setY: y => set({ y }),
  setZoom: zoom => set({ zoom }),
  goup: () => set(state => ({ originY: state.originY - 1 })),
  godown: () => set(state => ({ originY: state.originY + 1 })),
  goleft: () => set(state => ({ originX: state.originX - 1 })),
  goright: () => set(state => ({ originX: state.originX + 1 })),
  goUpLeft: () => set(state => ({ originX: state.originX - 1, originY: state.originY - 1 })),
  goUpRight: () => set(state => ({ originX: state.originX + 1, originY: state.originY - 1 })),
  goDownLeft: () => set(state => ({ originX: state.originX - 1, originY: state.originY + 1 })),
  goDownRight: () => set(state => ({ originX: state.originX + 1, originY: state.originY + 1 })),
  setOringinPosition: (x, y) => set({ originX: x, originY: y }),
  setPosition: (x, y) => set({ x, y }),
}));

export const useOtherUserCursorsStore = create<OtherUserCursorsState>(set => ({
  cursors: [],
  addCursors: cursors => set(state => ({ cursors: [...state.cursors, ...cursors] })),
  removeCursor: cursor => set(state => ({ cursors: state.cursors.filter(c => c !== cursor) })),
  setCursors: cursors => set({ cursors }),
}));
