export const fillCtxAndPath = (ctx: CanvasRenderingContext2D, path: Path2D, color: string | CanvasGradient | CanvasPattern) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
  return;
};

export const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

export const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export const computeVisibleBounds = (
  totalRows: number,
  totalCols: number,
  padW: number,
  padH: number,
  viewW: number,
  viewH: number,
  size: number,
) => {
  const startCol = Math.max(0, Math.ceil(padW - 1));
  const endCol = Math.min(totalCols - 1, Math.floor(padW + (viewW + size) / (size || 1)));
  const startRow = Math.max(0, Math.ceil(padH - 1));
  const endRow = Math.min(totalRows - 1, Math.floor(padH + (viewH + size) / (size || 1)));
  return { startCol, endCol, startRow, endRow };
};

export const makeNumericKeys = (ri: number, ci: number, size: number) => {
  const tileKeyNum = ((ri * 131071 + ci) * 131 + (size | 0)) >>> 0;
  const typeKeyBase = (tileKeyNum * 10) >>> 0;
  return { tileKeyNum, typeKeyBase };
};

export const isClosedOrFlag = (c: string | number) => c === ('C' as unknown as number) || c === ('F' as unknown as number) || c === 'C' || c === 'F';

export const snapTileEdges = (ci: number, ri: number, padW: number, padH: number, size: number) => {
  const xFloat = (ci - padW) * size;
  const yFloat = (ri - padH) * size;
  const xNextFloat = (ci + 1 - padW) * size;
  const yNextFloat = (ri + 1 - padH) * size;
  const x0 = Math.round(xFloat);
  const y0 = Math.round(yFloat);
  const x1 = Math.round(xNextFloat);
  const y1 = Math.round(yNextFloat);
  const w = x1 - x0;
  const h = y1 - y0;
  return { xFloat, yFloat, x0, y0, x1, y1, w, h };
};
