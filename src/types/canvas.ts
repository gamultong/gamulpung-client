export interface VectorImagesType {
  cursor: Path2D;
  stun: Path2D[];
  flag: {
    pole: Path2D;
    flag: Path2D;
  };
  boom: {
    inner: Path2D;
    outer: Path2D;
  };
}

export type CursorColor = 'red' | 'blue' | 'yellow' | 'purple';
