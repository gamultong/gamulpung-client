import { PositionType, XYType } from './position';
import { WindowSizeType } from './window';

export const SendMessageEvent = {
  CHAT: 'CHAT',
  MOVE: 'MOVE',
  OPEN_TILES: 'OPEN-TILES',
  SET_FLAG: 'SET-FLAG',
  SET_WINDOW: 'SET-WINDOW',
} as const;
export type SendMessageEvent = (typeof SendMessageEvent)[keyof typeof SendMessageEvent];

export const ReceiveMessageEvent = {
  CHAT: 'CHAT',
  CURSORS_STATE: 'CURSORS-STATE',
  EXPLOSION: 'EXPLOSION',
  MY_CURSOR: 'MY-CURSOR',
  QUIT_CURSOR: 'QUIT-CURSOR',
  SCOREBOARD_STATE: 'SCOREBOARD-STATE',
  TILES_STATE: 'TILES-STATE',
} as const;
export type ReceiveMessageEvent = (typeof ReceiveMessageEvent)[keyof typeof ReceiveMessageEvent];

export type SendChatPayloadType = { message: string };
export type SendMovePayloadType = PositionType;
export type SendOpenTilesPayloadType = PositionType;
export type SendSetFlagPayloadType = PositionType;
export type SendSetWindowPayloadType = WindowSizeType;

/**
 * When Using
 * my cursor, quit cursor
 */
export type CursorIdType = { id: string };

export type GetChatPayloadType = SendChatPayloadType & CursorIdType;

// iso format string
export type CursorStateType = CursorIdType & PositionType & { active_at: string };
export type GetCursorStatePayloadType = { cursors: CursorStateType[] };
export type GetExplosionPayloadType = WindowSizeType;

// When getting & changing SCOREBOARD-STATE
export type GetScoreboardPayloadType = {
  scoreboard: { [key: number]: number };
};

export type GetTilesPayloadType = {
  data: string; // Same the previous version.
  range: {
    top_left: XYType;
    bottom_right: XYType;
  };
};

export type GetTilesStatePayloadType = {
  // When getting & changing TILES-STATE
  tiles_li: GetTilesPayloadType[];
};
