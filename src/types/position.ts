export type XYType = {
  x: number;
  y: number;
};

export type PositionType = { position: XYType };

export const Direction = {
  RIGHT: 'R',
  LEFT: 'L',
  UP: 'U',
  DOWN: 'D',
  ALL: 'A',
  UP_RIGHT: 'UR',
  DOWN_RIGHT: 'DR',
  UP_LEFT: 'UL',
  DOWN_LEFT: 'DL',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
