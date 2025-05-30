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
