import { CursorColor } from './canvas';
import { XYType } from './position';

export type TileMessageType = {
  tiles: string;
  start_p: XYType;
  end_p: XYType;
};

export type FlagSetMessageType = {
  position: XYType;
  is_set: boolean;
  color: string;
};

export type PointerSetMessageType = {
  id: string;
  pointer: XYType;
};

export type SingleTileOpenedMessageType = {
  tile: string;
  position: XYType;
};

export type TilesOpenedMessageType = {
  tiles: string;
  start_p: XYType;
  end_p: XYType;
};

export type GetMyCusorMessageType = {
  id: string;
  position: XYType;
  color: CursorColor;
  pointer: XYType;
};

export type ReviveTimeMessageType = {
  revive_at: number | string | Date;
};

export const SendMessageEvent = {
  SET_VIEW_SIZE: 'set-view-size',
  MOVING: 'moving',
  FETCH_TILES: 'fetch-tiles',
  POINTING: 'pointing',
  SEND_CHAT: 'send-chat',
} as const;
export type SendMessageEvent = (typeof SendMessageEvent)[keyof typeof SendMessageEvent];

export const ReceiveMessageEvent = {
  TILES: 'tiles',
  FLAG_SET: 'flag-set',
  POINTER_SET: 'pointer-set',
  SINGLE_TILE_OPENED: 'single-tile-opened',
  TILES_OPENED: 'tiles-opened',
  MY_CURSOR: 'my-cursor',
  YOU_DIED: 'you-died',
  CURSORS: 'cursors',
  CURSORS_DIED: 'cursors-died',
  MOVED: 'moved',
  CURSOR_QUIT: 'cursor-quit',
  CHAT: 'chat',
  ERROR: 'error',
};
export type ReceiveMessageEvent = (typeof ReceiveMessageEvent)[keyof typeof ReceiveMessageEvent];
