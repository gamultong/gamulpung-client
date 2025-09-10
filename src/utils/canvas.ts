export const fillCtxAndPath = (ctx: CanvasRenderingContext2D, path: Path2D, color: string | CanvasGradient | CanvasPattern) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
  return;
};
