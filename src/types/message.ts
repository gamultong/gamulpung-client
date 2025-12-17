/**
 * Please Check these API spec's documents.
 * https://github.com/gamultong/gamulpung-server-new/tree/develop/docs/API_spec/WebSocket
 */

import { PositionType, XYType } from './position';
import { WindowSizeType } from './window';

export const SendMessageEvent = {
  CHAT: 'CHAT',
  MOVE: 'MOVE',
  OPEN_TILES: 'OPEN-TILES',
  SET_FLAG: 'SET-FLAG',
  SET_WINDOW: 'SET-WINDOW',
  CREATE_CURSOR: 'CREATE-CURSOR',
} as const;
export type SendMessageEvent = (typeof SendMessageEvent)[keyof typeof SendMessageEvent];

export const GetMessageEvent = {
  CHAT: 'CHAT',
  CURSORS_STATE: 'CURSORS-STATE',
  EXPLOSION: 'EXPLOSION',
  MY_CURSOR: 'MY-CURSOR',
  QUIT_CURSOR: 'QUIT-CURSOR',
  SCOREBOARD_STATE: 'SCOREBOARD-STATE',
  TILES_STATE: 'TILES-STATE',
} as const;
export type GetMessageEvent = (typeof GetMessageEvent)[keyof typeof GetMessageEvent];

export type SendChatPayloadType = { message: string };
export type SendMovePayloadType = PositionType;
export type SendOpenTilesPayloadType = PositionType;
export type SendSetFlagPayloadType = PositionType;
export type SendSetWindowPayloadType = WindowSizeType;
export type SendCreateCursorPayloadType = WindowSizeType;

export type SendMessagePayloadType =
  | SendChatPayloadType
  | SendMovePayloadType
  | SendOpenTilesPayloadType
  | SendSetFlagPayloadType
  | SendSetWindowPayloadType
  | SendCreateCursorPayloadType;

export type SendMessageType = {
  header: { event: SendMessageEvent };
  payload: SendMessagePayloadType;
};

export type GetMessageType = {
  header: { event: GetMessageEvent };
  payload: GetPayloadType;
};

export type GetPayloadType =
  | GetChatPayloadType
  | GetCursorStatePayloadType
  | GetExplosionPayloadType
  | GetScoreboardPayloadType
  | GetTilesPayloadType
  | GetTilesStatePayloadType;

/**
 * When Using
 * my cursor, quit cursor
 */
export type CursorIdType = { id: string };
export type GetChatPayloadType = SendChatPayloadType & CursorIdType;

// iso format string
export type CursorStateType = CursorIdType & PositionType & { active_at: string; score: number };
export type GetCursorStatePayloadType = { cursors: CursorStateType[] };
export type GetExplosionPayloadType = PositionType;

// When getting & changing SCOREBOARD-STATE
export type GetScoreboardPayloadType = { scoreboard: { [key: number]: number } };

export type GetTilesPayloadType = {
  data: string; // Same the previous version.
  range: {
    top_left: XYType;
    bottom_right: XYType;
  };
};

// When getting & changing TILES-STATE
export type GetTilesStatePayloadType = { tiles_li: GetTilesPayloadType[] };
