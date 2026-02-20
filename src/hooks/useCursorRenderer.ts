'use client';
import { useState, useCallback, useLayoutEffect, useEffect } from 'react';
import RenderPaths from '@/assets/renderPaths.json';
import { XYType, VectorImagesType } from '@/types';
import { TileGrid } from '@/utils/tileGrid';
import { OtherCursorState } from '@/store/cursorStore';
import { CURSOR_COLORS, OTHER_CURSOR_COLORS } from '@/constants';
import { makePath2d, makePath2dFromArray } from '@/utils';
import { CanvasRefs } from '@/hooks/useMovement';

interface UseCursorRendererOptions {
  canvasRefs: CanvasRefs;
  tiles: TileGrid;
  tileSize: number;
  zoom: number;
  windowWidth: number;
  windowHeight: number;
  cursors: OtherCursorState[];
  color: string;
  cursorOriginX: number;
  cursorOriginY: number;
  relativeX: number;
  relativeY: number;
  paddingTiles: number;
  clickX: number;
  clickY: number;
  tilePaddingWidth: number;
  tilePaddingHeight: number;
  startPoint: XYType;
  // Movement state
  movingPaths: XYType[];
  forwardPath: XYType | undefined;
  lastMovingPosition: XYType;
  leftMovingPaths: XYType;
}

/** Setup high-resolution canvas */
function setupHighResCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  if ('textRenderingOptimization' in ctx) ctx.textRenderingOptimization = 'optimizeQuality';
}

export default function useCursorRenderer({
  canvasRefs,
  tiles,
  tileSize,
  zoom,
  windowWidth,
  windowHeight,
  cursors,
  color,
  cursorOriginX,
  cursorOriginY,
  relativeX,
  relativeY,
  paddingTiles,
  clickX,
  clickY,
  tilePaddingWidth,
  tilePaddingHeight,
  startPoint,
  movingPaths,
  forwardPath,
  lastMovingPosition,
  leftMovingPaths,
}: UseCursorRendererOptions) {
  const BASE_OFFSET = tileSize >> 1;
  const otherCursorPadding = 1 / (paddingTiles - 1);
  const [otherCursorPaddingWidth, otherCursorPaddingHeight] = [tilePaddingWidth * otherCursorPadding, tilePaddingHeight * otherCursorPadding];
  const { boomPaths, cursorPaths, flagPaths, stunPaths } = RenderPaths;

  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [cachedVectorAssets, setCachedVectorAssets] = useState<VectorImagesType>();

  const drawCursor = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, cursorColor: string, reviveAt: number = 0, rotated: number = 0, scale: number = 1) => {
      const adjustedScale = zoom * scale;
      ctx.save();
      ctx.fillStyle = cursorColor;
      ctx.translate(x, y);
      if (scale === 1) {
        const angle = (Math.round((rotated + Math.PI) / (Math.PI / 4)) + 2) % 8;
        const centerOffset = BASE_OFFSET >> 2;

        if (angle === 0) ctx.translate(BASE_OFFSET, centerOffset);
        else if (angle === 1) ctx.translate(tileSize - centerOffset, centerOffset);
        else if (angle === 2) ctx.translate(tileSize - centerOffset, BASE_OFFSET);
        else if (angle === 3) ctx.translate(tileSize - centerOffset, tileSize - centerOffset);
        else if (angle === 4) ctx.translate(BASE_OFFSET, tileSize - centerOffset);
        else if (angle === 5) ctx.translate(centerOffset, tileSize - centerOffset);
        else if (angle === 6) ctx.translate(centerOffset, BASE_OFFSET);
        else if (angle === 7) ctx.translate(centerOffset, centerOffset);
      } else ctx.translate(BASE_OFFSET, BASE_OFFSET);

      ctx.rotate(rotated - Math.PI / 4);

      ctx.scale(adjustedScale, adjustedScale);
      ctx.fill(cachedVectorAssets!.cursor);
      ctx.restore();
      if (!(reviveAt > 0 && Date.now() < reviveAt && cachedVectorAssets?.stun)) return;
      const stunScale = zoom / 2;
      ctx.save();
      ctx.translate(x - BASE_OFFSET, y - BASE_OFFSET);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.scale(stunScale, stunScale);
      cachedVectorAssets.stun.forEach(stunPath => {
        ctx.fill(stunPath);
        ctx.stroke(stunPath);
      });
      ctx.restore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileSize, cachedVectorAssets],
  );

  const drawPointer = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, pointerColor: string, border: number) => {
      if (!ctx) return;
      ctx.beginPath();
      ctx.strokeStyle = pointerColor;
      ctx.lineWidth = border;
      ctx.strokeRect(x + border / 2, y + border / 2, tileSize - border, tileSize - border);
      ctx.closePath();
    },
    [tileSize],
  );

  const drawOtherUserCursors = useCallback(() => {
    const canvas = canvasRefs.otherCursorsRef.current;
    if (!canvas) return;
    const otherCursorsCtx = canvas.getContext('2d');
    if (!otherCursorsCtx) return;

    setupHighResCanvas(canvas, otherCursorsCtx);
    otherCursorsCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const { position, color: cColor, revive_at } = cursor;
      const { x: pointerX, y: pointerY } = cursor?.pointer ?? { x: Infinity, y: Infinity };
      const [drawX, drawY] = [position.x - cursorOriginX + otherCursorPaddingWidth, position.y - cursorOriginY + otherCursorPaddingHeight];
      const [distanceX, distanceY] = [position.x - pointerX, position.y - pointerY];
      const rotate = distanceX !== 0 || distanceY !== 0 ? Math.atan2(distanceY, distanceX) : 0;
      drawCursor(otherCursorsCtx, drawX * tileSize, drawY * tileSize, CURSOR_COLORS[cColor], revive_at, rotate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors, cursorOriginX, cursorOriginY, tilePaddingWidth, tilePaddingHeight, tileSize, windowWidth, windowHeight, canvasRefs.otherCursorsRef]);

  const drawOtherUserPointers = useCallback(
    (borderPixel: number) => {
      const canvas = canvasRefs.otherPointerRef.current;
      if (!canvas) return;
      const otherPointerCtx = canvas.getContext('2d');
      if (!otherPointerCtx) return;

      setupHighResCanvas(canvas, otherPointerCtx);
      otherPointerCtx.clearRect(0, 0, windowWidth, windowHeight);
      cursors.forEach(({ pointer, color: cColor }) => {
        const { x, y } = pointer ?? { x: 0, y: 0 };
        const [drawX, drawY] = [x - cursorOriginX + otherCursorPaddingWidth, y - cursorOriginY + otherCursorPaddingHeight];
        drawPointer(otherPointerCtx, drawX * tileSize, drawY * tileSize, OTHER_CURSOR_COLORS[cColor], borderPixel);
      });
    },
    [cursors, cursorOriginX, cursorOriginY, otherCursorPaddingWidth, otherCursorPaddingHeight, tileSize, windowWidth, windowHeight, drawPointer, canvasRefs.otherPointerRef],
  );

  const renderInteractionCanvas = useCallback(() => {
    const { interactionCanvasRef, myCursorRef, otherCursorsRef, otherPointerRef } = canvasRefs;
    const { current: interactionCanvas } = interactionCanvasRef;
    const { current: myCursorCanvas } = myCursorRef;
    const { current: otherCursorsCanvas } = otherCursorsRef;
    const { current: otherPointerCanvas } = otherPointerRef;

    if (!interactionCanvas || !myCursorCanvas || !otherCursorsCanvas || !otherPointerCanvas) return;
    const [interactionCtx, myCursorCtx] = [interactionCanvas.getContext('2d'), myCursorCanvas.getContext('2d')];
    if (!interactionCtx || !myCursorCtx) return;

    setupHighResCanvas(interactionCanvas, interactionCtx);
    setupHighResCanvas(myCursorCanvas, myCursorCtx);

    myCursorCtx.clearRect(0, 0, windowWidth, windowHeight);
    interactionCtx.clearRect(0, 0, windowWidth, windowHeight);

    const cursorColor = CURSOR_COLORS[color];
    const borderPixel = 5 * zoom;

    const cursorPos = {
      x: (relativeX / paddingTiles) * tileSize,
      y: (relativeY / paddingTiles) * tileSize,
    };
    const clickCanvasPosition = {
      x: cursorPos.x + (clickX - cursorOriginX) * tileSize,
      y: cursorPos.y + (clickY - cursorOriginY) * tileSize,
    };
    const compensation = {
      x: lastMovingPosition.x - cursorOriginX - leftMovingPaths.x - tilePaddingWidth + relativeX + 0.5,
      y: lastMovingPosition.y - cursorOriginY - leftMovingPaths.y - tilePaddingHeight + relativeY + 0.5,
    };

    const rotate = (cursorOriginX !== clickX || cursorOriginY !== clickY) && forwardPath ? Math.atan2(-forwardPath.y, -forwardPath.x) : 0;
    drawCursor(myCursorCtx, cursorPos.x, cursorPos.y, cursorColor, 0, rotate);
    drawPointer(interactionCtx, clickCanvasPosition.x, clickCanvasPosition.y, cursorColor, borderPixel);
    drawOtherUserCursors();
    drawOtherUserPointers(borderPixel);

    // Draw Cursor Movement path
    const scaledPoints = movingPaths?.map(vec => {
      const [vX, vY] = [vec.x + compensation.x, vec.y + compensation.y];
      return { x: vX * tileSize, y: vY * tileSize };
    });
    if (scaledPoints.length <= 1) return;

    const baseCornerRadius = tileSize * 0.15;
    interactionCtx.beginPath();
    interactionCtx.strokeStyle = cursorColor;
    interactionCtx.lineWidth = tileSize / 10;
    interactionCtx.lineJoin = interactionCtx.lineCap = 'round';
    interactionCtx.miterLimit = 2;
    interactionCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);

    for (let i = 1; i < scaledPoints.length - 1; i++) {
      const [prev, curr, next] = [...scaledPoints.slice(i - 1, i + 2)];
      const [prevVectorX, prevVectorY] = [curr.x - prev.x, curr.y - prev.y];
      const [nextVectorX, nextVectorY] = [next.x - curr.x, next.y - curr.y];
      const [len1, len2] = [Math.hypot(prevVectorX, prevVectorY), Math.hypot(nextVectorX, nextVectorY)];
      const cross = prevVectorX * nextVectorY - prevVectorY * nextVectorX;
      const dot = prevVectorX * nextVectorX + prevVectorY * nextVectorY;
      const cosTheta = dot / (len1 * len2);
      const isStraight = Math.abs(cross) < 1e-6 || cosTheta > 0.995;
      if (isStraight) interactionCtx.lineTo(curr.x, curr.y);
      else {
        const cornerRadius = Math.min(baseCornerRadius, 0.5 * Math.min(len1, len2));
        interactionCtx.arcTo(curr.x, curr.y, next.x, next.y, cornerRadius);
      }
    }
    const [beforeLast, last] = [...scaledPoints.slice(-2)];
    const [lastPointX, lastPointY] = [(last.x + beforeLast.x) / 2, (last.y + beforeLast.y) / 2];
    const pathRotate = Math.PI + Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x);
    interactionCtx.lineTo(lastPointX, lastPointY);
    drawCursor(interactionCtx, lastPointX - BASE_OFFSET, lastPointY - BASE_OFFSET, cursorColor, 0, pathRotate, 0.6);
    interactionCtx.stroke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasRefs,
    windowWidth,
    windowHeight,
    color,
    zoom,
    relativeX,
    relativeY,
    paddingTiles,
    tileSize,
    clickX,
    clickY,
    cursorOriginX,
    cursorOriginY,
    tilePaddingWidth,
    tilePaddingHeight,
    lastMovingPosition,
    leftMovingPaths,
    forwardPath,
    movingPaths,
    drawCursor,
    drawPointer,
    drawOtherUserCursors,
    drawOtherUserPointers,
    BASE_OFFSET,
  ]);

  /** Load Assets */
  useLayoutEffect(() => {
    if (!isInitializing && !tiles.isEmpty) return;

    const loadFontOptional = async () => {
      try {
        if (document.fonts.check('1em LOTTERIACHAB')) return;

        const lotteriaChabFont = new FontFace(
          'LOTTERIACHAB',
          "url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIACHAB.woff2') format('woff2')",
        );
        await lotteriaChabFont.load();
        document.fonts.add(lotteriaChabFont);
      } catch {
        console.warn('Font loading failed, using fallback font');
      }
    };

    const cursor = makePath2d(cursorPaths);
    const stun = makePath2dFromArray(stunPaths);
    const [flagPath, pole] = flagPaths.map(makePath2d);
    const [inner, outer] = boomPaths.map(makePath2d);
    const flag = { flag: flagPath, pole };
    const boom = { inner, outer };
    setCachedVectorAssets({ cursor, stun, flag, boom });

    setIsInitializing(false);
    loadFontOptional();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, isInitializing]);

  // Render Interaction Objects When Cursor is Moving, Clicking, or other cursor sets.
  useEffect(() => {
    if (!isInitializing) renderInteractionCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorOriginX, cursorOriginY, startPoint, clickX, clickY, color, cursors, leftMovingPaths]);

  /** Cleanup canvas contexts and resources */
  const cleanupCanvasResources = useCallback(() => {
    Object.values(canvasRefs).forEach(ref => {
      if (ref.current) {
        const ctx = ref.current.getContext('2d');
        ctx?.clearRect(0, 0, ref.current.width, ref.current.height);
      }
    });
    setCachedVectorAssets(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isInitializing, cleanupCanvasResources };
}
