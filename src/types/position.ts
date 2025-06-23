export type XYType = {
  x: number;
  y: number;
};

export const Direction = {
  RIGHT: 'R',
  LEFT: 'L',
  UP: 'U',
  DOWN: 'D',
  ALL: 'A',
} as const;
export type DirectionType = (typeof Direction)[keyof typeof Direction];
