'use client';
import { useState, useRef, useCallback, RefObject } from 'react';
import { XYType, SendMessageEvent, PositionType, Direction } from '@/types';
import { TileGrid, isTileOpened } from '@/utils/tileGrid';
import { findPathUsingAStar } from '@/utils/aStar';
import { OtherCursorState } from '@/store/cursorStore';
import { CURSOR_DIRECTIONS } from '@/constants';

export interface CanvasRefs {
  interactionCanvasRef: RefObject<HTMLCanvasElement | null>;
  otherCursorsRef: RefObject<HTMLCanvasElement | null>;
  otherPointerRef: RefObject<HTMLCanvasElement | null>;
  myCursorRef: RefObject<HTMLCanvasElement | null>;
}

interface UseMovementOptions {
  tiles: TileGrid;
  tileSize: number;
  startPoint: XYType;
  viewStart: XYType;
  viewEnd: XYType;
  cursorOriginX: number;
  cursorOriginY: number;
  cursorPosition: XYType;
  relativeX: number;
  relativeY: number;
  padtiles: (sx: number, sy: number, ex: number, ey: number, dir: Direction) => void;
  sendMessage: (event: SendMessageEvent, payload: PositionType) => void;
  setCursorPosition: (pos: XYType) => void;
  setOriginPosition: (pos: XYType) => void;
  setMovecost: (cost: number) => void;
  MOVE_SPEED: number;
  useAnimation: boolean;
  canvasRefs: CanvasRefs;
  shockwaveCanvasRef: RefObject<HTMLCanvasElement | null>;
  cursors: OtherCursorState[];
}

export default function useMovement({
  tiles,
  tileSize,
  startPoint,
  viewStart,
  viewEnd,
  cursorOriginX,
  cursorOriginY,
  cursorPosition,
  relativeX,
  relativeY,
  padtiles,
  sendMessage,
  setCursorPosition,
  setOriginPosition,
  setMovecost,
  MOVE_SPEED,
  useAnimation,
  canvasRefs,
  shockwaveCanvasRef,
  cursors,
}: UseMovementOptions) {
  const movementInterval = useRef<NodeJS.Timeout | null>(null);
  const [movingPaths, setMovingPaths] = useState<XYType[]>([]);
  const [leftMovingPaths, setLeftMovingPaths] = useState<XYType>({ x: Infinity, y: Infinity });
  const [forwardPath, setForwardPath] = useState<XYType>();
  const [lastMovingPosition, setLastMovingPosition] = useState<XYType>({ x: Infinity, y: Infinity });

  /** Cancel interval function for animation. */
  const cancelCurrentMovement = useCallback(() => {
    if (!movementInterval.current) return;
    clearInterval(movementInterval.current);
    movementInterval.current = null;
  }, []);

  /** Check if the other cursor is on the tile */
  const checkIsOtherCursorOnTile = useCallback(
    (tileX: number, tileY: number) => cursors.some(c => c.position.x === tileX + startPoint.x && c.position.y === tileY + startPoint.y),
    [cursors, startPoint],
  );

  /** Check if the clicked tile is already a neighbor of the cursor */
  const isAlreadyCursorNeighbor = useCallback(
    (x: number, y: number) => CURSOR_DIRECTIONS.some(([dx, dy]) => cursorOriginX + dx === x && cursorOriginY + dy === y),
    [cursorOriginX, cursorOriginY],
  );

  const findOpenedNeighbors = useCallback(
    (currentX: number, currentY: number) => {
      let result = { x: Infinity, y: Infinity };
      [[0, 0], ...CURSOR_DIRECTIONS].some(([dx, dy]) => {
        const [x, y] = [currentX + dx, currentY + dy];
        if (y < 0 || y >= tiles.height || x < 0 || x >= tiles.width) return false;
        if (!isTileOpened(tiles.get(y, x))) return false;
        result = { x, y };
        return true;
      });
      return result;
    },
    [tiles],
  );

  /** Find opened neighbors around a target absolute tile position */
  const findOpenedNeighborsAroundTarget = useCallback(
    (targetX: number, targetY: number) => {
      let result = { x: Infinity, y: Infinity };
      const currentRelativeX = cursorOriginX - startPoint.x;
      const currentRelativeY = cursorOriginY - startPoint.y;

      // First, check if current position is a valid neighbor of target
      const currentIsNeighbor =
        CURSOR_DIRECTIONS.some(([dx, dy]) => cursorOriginX === targetX + dx && cursorOriginY === targetY + dy) ||
        (cursorOriginX === targetX && cursorOriginY === targetY);

      if (currentIsNeighbor) {
        if (
          currentRelativeY >= 0 &&
          currentRelativeY < tiles.height &&
          currentRelativeX >= 0 &&
          currentRelativeX < tiles.width &&
          isTileOpened(tiles.get(currentRelativeY, currentRelativeX))
        ) {
          return { x: currentRelativeX, y: currentRelativeY };
        }
      }

      // Find the closest opened neighbor
      let minDistance = Infinity;
      [[0, 0], ...CURSOR_DIRECTIONS].forEach(([dx, dy]) => {
        const absX = targetX + dx;
        const absY = targetY + dy;
        const rX = absX - startPoint.x;
        const rY = absY - startPoint.y;

        if (rY < 0 || rY >= tiles.height || rX < 0 || rX >= tiles.width) return;

        const tileContent = tiles.get(rY, rX);
        if (!isTileOpened(tileContent)) return;

        const distance = Math.abs(rX - currentRelativeX) + Math.abs(rY - currentRelativeY);
        if (distance < minDistance) {
          minDistance = distance;
          result = { x: rX, y: rY };
        }
      });
      return result;
    },
    [tiles, cursorOriginX, cursorOriginY, startPoint],
  );

  // Only Move, Open-tiles, Set-flag
  const clickEvent = useCallback(
    (x: number, y: number, clickType: SendMessageEvent) => {
      const { MOVE, OPEN_TILES, SET_FLAG, DISMANTLE_MINE, INSTALL_BOMB } = SendMessageEvent;
      if (![MOVE, OPEN_TILES, SET_FLAG, DISMANTLE_MINE, INSTALL_BOMB].some(event => event === clickType)) return;
      const payload: PositionType = { position: { x, y } };
      sendMessage(clickType, payload);
    },
    [sendMessage],
  );

  /**
   * General Click Event Handler — move cursor along A* path
   */
  const moveCursor = (
    relativeTileX: number,
    relativetileY: number,
    clickedX: number,
    clickedY: number,
    onComplete?: (x: number, y: number) => void,
  ) => {
    if (movementInterval.current) return;
    let index = 0;
    const foundPaths = findPathUsingAStar(
      tiles,
      relativeX,
      relativeY,
      relativeTileX,
      relativetileY,
      (x, y) => checkIsOtherCursorOnTile(x, y),
      leftPaths => setLeftMovingPaths(leftPaths),
    );
    let currentPath = foundPaths[index];
    if (currentPath?.x === undefined || currentPath?.y === undefined) return;

    // Optimize path: remove unnecessary last step if already at target
    const optimizedPaths = [...foundPaths];
    if (optimizedPaths.length > 2) {
      const secondLastPath = optimizedPaths[optimizedPaths.length - 2];
      const secondLastAbsoluteX = relativeX + secondLastPath.x;
      const secondLastAbsoluteY = relativeY + secondLastPath.y;

      if (secondLastAbsoluteX === relativeTileX && secondLastAbsoluteY === relativetileY) {
        optimizedPaths.pop();
      }

      const lastPath = optimizedPaths[optimizedPaths.length - 1];
      if (lastPath)
        setLastMovingPosition({
          x: cursorPosition.x + lastPath.x,
          y: cursorPosition.y + lastPath.y,
        });
    }

    let [innerCursorX, innerCursorY] = [cursorPosition.x, cursorPosition.y];
    setMovecost(optimizedPaths.length - 1);

    const moveAnimation = (dx: number, dy: number) => {
      const { interactionCanvasRef: I_canvas, otherCursorsRef: C_canvas, otherPointerRef: P_canvas } = canvasRefs;
      const tilemap = document.getElementById('Tilemap');
      const currentRefs = [I_canvas.current, C_canvas.current, P_canvas.current, shockwaveCanvasRef.current, tilemap];
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / MOVE_SPEED, 1);
        const translate = tileSize * (1 - progress);
        const [translateX, translateY] = [translate * dx, translate * dy];
        currentRefs.forEach(c => (c!.style.transform = `translate(${translateX}px, ${translateY}px)`));
        if (progress < 1) requestAnimationFrame(animate);
        else currentRefs.forEach(c => (c!.style.transform = 'translate(0, 0)'));
      };
      requestAnimationFrame(animate);
    };

    movementInterval.current = setInterval(() => {
      if (++index >= optimizedPaths.length) {
        setCursorPosition({ x: relativeTileX + startPoint.x, y: relativetileY + startPoint.y });
        setMovingPaths([]);
        setLastMovingPosition({ x: Infinity, y: Infinity });
        cancelCurrentMovement();

        onComplete?.(clickedX, clickedY);
        return;
      }
      const path = optimizedPaths[index];
      if (!path) return;
      const [dx, dy] = [Math.sign(path.x - currentPath.x), Math.sign(path.y - currentPath.y)];
      setForwardPath({ x: dx, y: dy });

      // Determine direction for padding before animation
      let direction = '';
      if (dy === 1) direction += Direction.DOWN;
      if (dy === -1) direction += Direction.UP;
      if (dx === 1) direction += Direction.RIGHT;
      if (dx === -1) direction += Direction.LEFT;

      [innerCursorX, innerCursorY] = [dx + innerCursorX, dy + innerCursorY];
      const position: XYType = { x: innerCursorX, y: innerCursorY };
      sendMessage(SendMessageEvent.MOVE, { position } as PositionType);

      setOriginPosition(position);
      setCursorPosition(position);

      currentPath = path;
      setMovingPaths(optimizedPaths.slice(index));

      // Apply padding before animation starts
      if (direction && viewStart && viewEnd) padtiles(viewStart.x, viewEnd.y, viewEnd.x, viewStart.y, direction as Direction);

      // Animation Effect
      if (useAnimation) moveAnimation(dx, dy);
      console.log('animation', performance.now());
    }, MOVE_SPEED);
  };

  return {
    movingPaths,
    forwardPath,
    lastMovingPosition,
    leftMovingPaths,
    moveCursor,
    cancelCurrentMovement,
    clickEvent,
    isAlreadyCursorNeighbor,
    findOpenedNeighbors,
    findOpenedNeighborsAroundTarget,
  };
}
