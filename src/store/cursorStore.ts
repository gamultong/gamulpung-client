import { create } from 'zustand';

type Color = 'red' | 'blue' | 'yellow' | 'purple';

export interface CursorState {
  x: number;
  y: number;
  color: Color;
  revive_at?: number;
}

interface ClientCursorState extends CursorState {
  originX: number;
  originY: number;
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

interface OtherUserCursorsState {
  cursors: CursorState[];
  addCursors: (cursor: CursorState[]) => void;
  removeCursor: (cursor: CursorState) => void;
  setCursors: (cursors: CursorState[]) => void;
}

export const useCursorStore = create<ClientCursorState>(set => ({
  x: 100,
  y: 100,
  color: 'blue',
  originX: 100,
  originY: 100,
  zoom: 1,
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
