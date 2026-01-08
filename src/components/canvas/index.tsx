'use client';
import S from './style.module.scss';
import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import RenderPaths from '@/assets/renderPaths.json';

import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore, useAnimationStore } from '@/store/interactionStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useWebSocketStore from '@/store/websocketStore';
import { useRenderTiles, useRenderStartPoint, useTileSize } from '@/store/tileStore';
import ChatComponent from '@/components/chat';
import Tilemap from '@/components/tilemap';
import { XYType, VectorImagesType, TileContent, SendMessageEvent, PositionType } from '@/types';
import { CURSOR_COLORS, CURSOR_DIRECTIONS, OTHER_CURSOR_COLORS } from '@/constants';
import { makePath2d, makePath2dFromArray } from '@/utils';

class TileNode {
  x: number;
  y: number;
  gScore: number;
  heuristic: number;
  fTotal: number;
  parent: TileNode | null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.gScore = Infinity; // Cost from start node
    this.heuristic = 0; // Heuristic (estimated cost to goal)
    this.fTotal = Infinity; // Total cost f = g + h
    this.parent = null; // For path reconstruction
  }
}

/** 타입 정의 */
interface CanvasRenderComponentProps {
  cursorOriginX: number;
  cursorOriginY: number;
  paddingTiles: number;
  leftReviveTime: number;
}

const CanvasRenderComponent: React.FC<CanvasRenderComponentProps> = ({ paddingTiles, cursorOriginX, cursorOriginY, leftReviveTime }) => {
  // Get tiles and related data from zustand store
  const tiles = useRenderTiles();
  const tileSize = useTileSize();
  const startPoint = useRenderStartPoint();
  /** constants */
  const MOVE_SPEED = 200; // ms
  const BASE_OFFSET = tileSize >> 1; // tileSize / 2
  const [relativeX, relativeY] = [cursorOriginX - startPoint.x, cursorOriginY - startPoint.y];
  const otherCursorPadding = 1 / (paddingTiles - 1); // padding for other cursors
  const [tilePaddingWidth, tilePaddingHeight] = [((paddingTiles - 1) * relativeX) / paddingTiles, ((paddingTiles - 1) * relativeY) / paddingTiles];
  const [otherCursorPaddingWidth, otherCursorPaddingHeight] = [tilePaddingWidth * otherCursorPadding, tilePaddingHeight * otherCursorPadding];
  const { boomPaths, cursorPaths, flagPaths, stunPaths } = RenderPaths;

  /** stores */
  const { windowHeight, windowWidth } = useScreenSize();
  const { setPosition: setClickPosition, x: clickX, y: clickY, setMovecost } = useClickStore();
  const { position: cursorPosition, zoom, color, setPosition: setCursorPosition } = useCursorStore();
  const { cursors } = useOtherUserCursorsStore();
  const { sendMessage } = useWebSocketStore();
  const { useAnimation } = useAnimationStore();

  /** References */
  const movementInterval = useRef<NodeJS.Timeout | null>(null);
  const canvasRefs = {
    interactionCanvasRef: useRef<HTMLCanvasElement>(null),
    otherCursorsRef: useRef<HTMLCanvasElement>(null),
    otherPointerRef: useRef<HTMLCanvasElement>(null),
    myCursorRef: useRef<HTMLCanvasElement>(null),
  };

  /** States */
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [movingPaths, setMovingPaths] = useState<XYType[]>([]);
  const [leftMovingPaths, setLeftMovingPaths] = useState<XYType>({ x: 0, y: 0 });
  const [forwardPath, setForwardPath] = useState<XYType>();
  const [cachedVectorAssets, setCachedVectorAssets] = useState<VectorImagesType>();

  /** Cancel interval function for animation. */
  const cancelCurrentMovement = () => {
    if (!movementInterval.current) return;
    clearInterval(movementInterval.current);
    movementInterval.current = null;
  };

  /** Cleanup canvas contexts and resources */
  const cleanupCanvasResources = () => {
    Object.values(canvasRefs).forEach(ref => {
      if (ref.current) {
        const ctx = ref.current.getContext('2d');
        ctx?.clearRect(0, 0, ref.current.width, ref.current.height);
      }
    });

    setCachedVectorAssets(undefined);
  };

  /** 🚀 HIGH QUALITY: Setup high-resolution canvas */
  const setupHighResCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('textRenderingOptimization' in ctx) ctx.textRenderingOptimization = 'optimizeQuality';
  };

  /** Prevent default right click event */
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', preventContextMenu);
    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
      cancelCurrentMovement();
    };
  }, []);

  /** Check if the tile has been opened */
  const checkTileHasOpened = (tile: string) => {
    const type = tile[0];
    return type !== TileContent.CLOSED && type !== TileContent.FLAGGED;
  };

  /**
   * General Click Event Handler
   * @param relativeTileX x position of clicked tile
   * @param relativetileY y position of clicked tile
   * @returns void
   * */
  const moveCursor = (
    relativeTileX: number,
    relativetileY: number,
    clickedX: number,
    clickedY: number,
    onComplete?: (x: number, y: number) => void,
  ) => {
    if (movementInterval.current) return;
    let index = 0;
    const foundPaths = findPathUsingAStar(relativeX, relativeY, relativeTileX, relativetileY);
    let currentPath = foundPaths[index];
    if (currentPath?.x === undefined || currentPath?.y === undefined) return;
    let [innerCursorX, innerCursorY] = [cursorPosition.x, cursorPosition.y];
    setMovecost(foundPaths.length - 1);

    const moveAnimation = (dx: number, dy: number) => {
      const { interactionCanvasRef: I_canvas, otherCursorsRef: C_canvas, otherPointerRef: P_canvas } = canvasRefs;
      const tilemap = document.getElementById('Tilemap');
      const currentRefs = [I_canvas.current, C_canvas.current, P_canvas.current, tilemap];
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
      if (++index >= foundPaths.length) {
        // 최종 위치로 확실히 업데이트
        setCursorPosition({ x: relativeTileX + startPoint.x, y: relativetileY + startPoint.y });
        setMovingPaths([]);
        cancelCurrentMovement();

        // Execute callback after movement completes
        onComplete?.(clickedX, clickedY);
        return;
      }
      const path = foundPaths[index];
      if (!path) return;
      const [dx, dy] = [Math.sign(path.x - currentPath.x), Math.sign(path.y - currentPath.y)];
      setForwardPath({ x: dx, y: dy });

      // if the other cursor is on the tile, find another path
      // if (checkIsOtherCursorOnTile(dx + innerCursorX, dy + innerCursorY)) {
      //   cancelCurrentMovement();
      //   setZoom(zoom - 0.0001);
      //   moveCursor(relativeTileX, relativetileY, clickedX, clickedY, type);
      //   return;
      // }
      [innerCursorX, innerCursorY] = [dx + innerCursorX, dy + innerCursorY];
      sendMessage(SendMessageEvent.MOVE, { position: { x: innerCursorX, y: innerCursorY } });

      currentPath = path;
      setMovingPaths(foundPaths.slice(index));
      if (useAnimation) moveAnimation(dx, dy);
      console.log('animation', performance.now());
    }, MOVE_SPEED);
  };

  // Only Move, Open-tiles, Set-flag
  const clickEvent = (x: number, y: number, clickType: SendMessageEvent) => {
    const { MOVE, OPEN_TILES, SET_FLAG } = SendMessageEvent;
    if ([MOVE, OPEN_TILES, SET_FLAG].some(event => event === clickType)) {
      const payload: PositionType = { position: { x, y } };
      sendMessage(clickType, payload);
    }
  };

  // Map click type to corresponding action event
  const CLICK_TYPE_TO_EVENT: Record<string, SendMessageEvent> = {
    special: SendMessageEvent.SET_FLAG,
    general: SendMessageEvent.OPEN_TILES,
  };

  /** Click Event Handler */
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;
    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    // Transform canvas coordinate to relative and absolute coordinate
    const [tileArrayX, tileArrayY] = [(clickX / tileSize + tilePaddingWidth) >>> 0, (clickY / tileSize + tilePaddingHeight) >>> 0];
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    // Setting content of clicked tile
    const clickedTileContent = tiles[tileArrayY]?.[tileArrayX] ?? 'Out of bounds';
    setClickPosition(tileX, tileY, clickedTileContent);

    const isClosed = clickedTileContent.includes(TileContent.CLOSED);
    const isFlagged = clickedTileContent.includes(TileContent.FLAGGED);
    const [rangeX, rangeY] = [tileX - cursorOriginX, tileY - cursorOriginY];
    const isInRange = rangeX >= -1 && rangeX <= 1 && rangeY >= -1 && rangeY <= 1;
    const clickType = event.buttons !== 2 ? 'general' : 'special'; // 1 move, open-tiles, 2 set-flag

    // Handle in-range actions immediately (only for closed/flagged tiles)
    if (isInRange) {
      if ((isClosed || isFlagged) && clickType === 'special') {
        clickEvent(tileX, tileY, SendMessageEvent.SET_FLAG);
      } else if (isClosed && clickType === 'general') {
        clickEvent(tileX, tileY, SendMessageEvent.OPEN_TILES);
      }
      // Open tiles should continue to default movement logic
      if (isClosed || isFlagged) return;
    }

    // Handle out-of-range clicks: move to nearest opened tile, then perform action
    if (!isInRange && (isClosed || isFlagged)) {
      const { x: targetX, y: targetY } = findOpenedNeighborsAroundTarget(tileX, tileY);
      if (targetX === Infinity || targetY === Infinity || movingPaths.length > 0) return;

      const actionEvent = CLICK_TYPE_TO_EVENT[clickType];
      if (!actionEvent) return;

      moveCursor(targetX, targetY, tileX, tileY, (x, y) => clickEvent(x, y, actionEvent));
      return;
    }

    // Default movement for opened tiles (general click only)
    if (clickType === 'special' && movingPaths.length > 0) return;
    let { x: targetTileX, y: targetTileY } = findOpenedNeighbors(tileArrayX, tileArrayY);
    if (isAlreadyCursorNeighbor(tileX, tileY)) [targetTileX, targetTileY] = [tileArrayX, tileArrayY];
    moveCursor(targetTileX, targetTileY, tileX, tileY);
  };

  /** Check if the clicked tile is already a neighbor of the cursor */
  const isAlreadyCursorNeighbor = (x: number, y: number) =>
    CURSOR_DIRECTIONS.some(([dx, dy]) => cursorOriginX + dx === x && cursorOriginY + dy === y);

  const findOpenedNeighbors = (currentX: number, currentY: number) => {
    let result = { x: Infinity, y: Infinity };
    [[0, 0], ...CURSOR_DIRECTIONS].some(([dx, dy]) => {
      const [x, y] = [currentX + dx, currentY + dy];
      if (!tiles[y] || !tiles[y][x]) return false;
      if (!checkTileHasOpened(tiles[y][x])) return false;
      result = { x, y };
      return true;
    });
    return result;
  };

  /** Find opened neighbors around a target absolute tile position */
  const findOpenedNeighborsAroundTarget = (targetX: number, targetY: number) => {
    let result = { x: Infinity, y: Infinity };
    // Check 8 directions + self position around the target
    [[0, 0], ...CURSOR_DIRECTIONS].some(([dx, dy]) => {
      const absX = targetX + dx;
      const absY = targetY + dy;
      // Convert to relative coordinates
      const relativeX = absX - startPoint.x;
      const relativeY = absY - startPoint.y;

      if (relativeY < 0 || relativeY >= tiles.length || relativeX < 0 || relativeX >= tiles[relativeY]?.length) {
        return false;
      }

      const tileContent = tiles[relativeY][relativeX];
      if (!checkTileHasOpened(tileContent)) return false;

      result = { x: relativeX, y: relativeY };
      return true;
    });
    return result;
  };

  /**
   * Draw Cursor
   * @param ctx - CanvasRenderingContext2D
   * @param x - x position of cursor
   * @param y - y position of cursor
   * @param color - color of cursor
   * @param reviveAt - revive time of cursor
   * @param rotated - rotated angle of cursor
   * @param scale - scale of cursor for not player's cursor
   */
  const drawCursor = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, reviveAt: number = 0, rotated: number = 0, scale: number = 1) => {
      const adjustedScale = zoom * scale;
      ctx.save();
      ctx.fillStyle = color;
      ctx.translate(x, y);
      if (scale === 1) {
        // up 0, rightup 1, right 2, rightdown 3, down 4, leftdown 5, left 6, leftup 7
        const angle = (Math.round((rotated + Math.PI) / (Math.PI / 4)) + 2) % 8;

        const centerOffset = BASE_OFFSET >> 2; // tileSize / 8

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

  const drawOtherUserCursors = useCallback(() => {
    const canvas = canvasRefs.otherCursorsRef.current;
    if (!canvas) return;
    const otherCursorsCtx = canvas.getContext('2d');
    if (!otherCursorsCtx) return;

    // 🚀 HIGH QUALITY: Setup high-resolution rendering
    setupHighResCanvas(canvas, otherCursorsCtx);
    otherCursorsCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const { position, color, revive_at } = cursor;
      const { x: pointerX, y: pointerY } = cursor?.pointer ?? { x: Infinity, y: Infinity };
      const [drawX, drawY] = [position.x - cursorOriginX + otherCursorPaddingWidth, position.y - cursorOriginY + otherCursorPaddingHeight];
      const [distanceX, distanceY] = [position.x - pointerX, position.y - pointerY];
      const rotate = distanceX !== 0 || distanceY !== 0 ? Math.atan2(distanceY, distanceX) : 0;
      drawCursor(otherCursorsCtx, drawX * tileSize, drawY * tileSize, CURSOR_COLORS[color], revive_at, rotate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors, cursorOriginX, cursorOriginY, tilePaddingWidth, tilePaddingHeight, tileSize, windowWidth, windowHeight, canvasRefs.otherCursorsRef]);

  const drawPointer = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, border: number) => {
      if (!ctx) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = border;
      ctx.strokeRect(x + border / 2, y + border / 2, tileSize - border, tileSize - border);
      ctx.closePath();
    },
    [tileSize],
  );

  const drawOtherUserPointers = (borderPixel: number) => {
    const canvas = canvasRefs.otherPointerRef.current;
    if (!canvas) return;
    const otherPointerCtx = canvas.getContext('2d');
    if (!otherPointerCtx) return;

    setupHighResCanvas(canvas, otherPointerCtx);
    otherPointerCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(({ pointer, color }) => {
      const { x, y } = pointer ?? { x: 0, y: 0 };
      const [drawX, drawY] = [x - cursorOriginX + otherCursorPaddingWidth, y - cursorOriginY + otherCursorPaddingHeight];
      drawPointer(otherPointerCtx, drawX * tileSize, drawY * tileSize, OTHER_CURSOR_COLORS[color], borderPixel);
    });
  };

  // Check if the other cursor is on the tile
  const checkIsOtherCursorOnTile = (tileX: number, tileY: number) =>
    cursors.some(c => c.position.x === tileX + startPoint.x && c.position.y === tileY + startPoint.y);

  /**
   * Find path using A* algorithm avoiding flags and move cursor in 8 directions
   * @param startX x position of start point
   * @param startY y position of start point
   * @param targetX x position of target point
   * @param targetY y position of target point
   * */
  const findPathUsingAStar = (startX: number, startY: number, targetX: number, targetY: number) => {
    // Function to get neighbors of a node
    const getNeighbors = (grid: (TileNode | null)[][], node: TileNode) => {
      const neighbors = [];
      for (const [dx, dy] of CURSOR_DIRECTIONS) {
        // Check if the neighbor is within bounds and not a flag or other cursor
        const [x, y] = [node.x + dx, node.y + dy];
        // Check if the neighbor is within bounds
        if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) continue;
        // Check if the tile is opened and not occupied by another cursor
        if (grid[y][x] === null || checkIsOtherCursorOnTile(x, y)) continue;
        // Add the neighbor node
        neighbors.push({ node: grid[y][x], isDiagonal: dx !== 0 && dy !== 0 });
      }
      return neighbors;
    };

    /** calculate distance from target */
    const getLeftPaths = (temp: TileNode, x: number, y: number): XYType => ({ x: temp.x - x, y: temp.y - y });

    /** initialize tiles */
    const [start, target] = [new TileNode(startX, startY), new TileNode(targetX, targetY)];

    const grid = tiles.map((row, i) => row.map((tile, j) => (checkTileHasOpened(tile) ? new TileNode(j, i) : null)));

    /** initialize open and close list */
    let openNodeList = [start];
    const closedList = [];
    start.gScore = 0;
    start.fTotal = start.gScore + start.heuristic;

    while (openNodeList.length > 0) {
      const nowNode = openNodeList.reduce((a, b) => (a.fTotal < b.fTotal ? a : b));
      const leftPaths = getLeftPaths(nowNode, startX, startY);
      setLeftMovingPaths(leftPaths);
      if (nowNode.x === target.x && nowNode.y === target.y) {
        const path = [];
        for (let temp = nowNode; temp; temp = temp.parent!) path.unshift({ x: temp.x - startX, y: temp.y - startY });
        return path;
      }
      openNodeList = openNodeList.filter(node => node !== nowNode);
      closedList.push(nowNode);

      /** Find neighbor nodes from current node. */
      const neighbors = getNeighbors(grid, nowNode);
      for (const { node, isDiagonal } of neighbors) {
        if (closedList.includes(node)) continue;
        // Apply different cost for diagonal movement
        const tempG = nowNode.gScore + (isDiagonal ? 14 : 10);
        if (tempG >= node.gScore) continue;
        if (!openNodeList.includes(node)) openNodeList.push(node);
        node.parent = nowNode;
        node.gScore = tempG;
        node.heuristic = Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
        node.fTotal = node.gScore + node.heuristic;
      }
    }
    return [];
  };

  const renderInteractionCanvas = () => {
    const { interactionCanvasRef, myCursorRef, otherCursorsRef, otherPointerRef } = canvasRefs;
    const { current: interactionCanvas } = interactionCanvasRef;
    const { current: myCursorCanvas } = myCursorRef;
    const { current: otherCursorsCanvas } = otherCursorsRef;
    const { current: otherPointerCanvas } = otherPointerRef;

    if (!interactionCanvas || !myCursorCanvas || !otherCursorsCanvas || !otherPointerCanvas) return;
    const [interactionCtx, myCursorCtx] = [interactionCanvas.getContext('2d'), myCursorCanvas.getContext('2d')];
    if (!interactionCtx || !myCursorCtx) return;

    // 🚀 HIGH QUALITY: Setup high-resolution rendering for all canvases
    setupHighResCanvas(interactionCanvas, interactionCtx);
    setupHighResCanvas(myCursorCanvas, myCursorCtx);

    // intialize canvases
    myCursorCtx.clearRect(0, 0, windowWidth, windowHeight);
    interactionCtx.clearRect(0, 0, windowWidth, windowHeight);

    // setting cursor color
    const cursorColor = CURSOR_COLORS[color];
    const borderPixel = 5 * zoom;

    // for rendering cursor position
    const cursorPosition = {
      x: (relativeX / paddingTiles) * tileSize,
      y: (relativeY / paddingTiles) * tileSize,
    };
    const clickCanvasPosition = {
      x: cursorPosition.x + (clickX - cursorOriginX) * tileSize,
      y: cursorPosition.y + (clickY - cursorOriginY) * tileSize,
    };
    // Setting compensation value for cursor positions
    const compensation = {
      x: clickX - cursorOriginX - leftMovingPaths.x - tilePaddingWidth + relativeX + 0.5,
      y: clickY - cursorOriginY - leftMovingPaths.y - tilePaddingHeight + relativeY + 0.5,
    };

    // If both distanceX and distanceY are 0, the cursor will not rotate.
    const rotate = (cursorOriginX !== clickX || cursorOriginY !== clickY) && forwardPath ? Math.atan2(-forwardPath.y, -forwardPath.x) : 0;
    drawCursor(myCursorCtx, cursorPosition.x, cursorPosition.y, cursorColor, 0, rotate);
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
    // Initializing moving path
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
      // If angle is almost straight, do not round
      const cosTheta = dot / (len1 * len2);
      const isStraight = Math.abs(cross) < 1e-6 || cosTheta > 0.995;
      if (isStraight) interactionCtx.lineTo(curr.x, curr.y);
      else {
        // Clamp radius to local segment lengths to avoid overshooting
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
  };

  /** Load Assets and Render (optimized) */
  useLayoutEffect(() => {
    if (!isInitializing && tiles.length > 0) return;

    // 폰트를 비동기로 로드하되, 실패해도 계속 진행
    const loadFontOptional = async () => {
      try {
        // 폰트가 이미 로드되었는지 확인
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

  // Render Intreraction Objects When Cursor is Moving, Clicking, or other cursor sets.
  useEffect(() => {
    if (!isInitializing) renderInteractionCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorOriginX, cursorOriginY, startPoint, clickX, clickY, color, cursors, leftMovingPaths]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelCurrentMovement();
      cleanupCanvasResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {isInitializing && (
        <div className={S.loading}>
          <h1>Assets Loading...</h1>
          <div className={`${tiles.length < 1 ? S.loadingBar : S.loadComplete}`} />
        </div>
      )}
      {!isInitializing && (
        <div className={`${S.canvasContainer} ${leftReviveTime > 0 ? S.vibration : ''}`}>
          <ChatComponent />
          <Tilemap className={S.canvas} tilePadHeight={tilePaddingHeight} tilePadWidth={tilePaddingWidth} />
          <canvas className={S.canvas} id="OtherCursors" ref={canvasRefs.otherCursorsRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="OtherPointer" ref={canvasRefs.otherPointerRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="MyCursor" ref={canvasRefs.myCursorRef} width={windowWidth} height={windowHeight} />
          <canvas
            className={S.canvas}
            id="InteractionCanvas"
            ref={canvasRefs.interactionCanvasRef}
            width={windowWidth}
            height={windowHeight}
            onPointerDown={handleClick}
          />
        </div>
      )}
    </>
  );
};

export default CanvasRenderComponent;
