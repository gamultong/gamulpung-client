﻿'use client';
import S from './style.module.scss';
import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import RenderPaths from '@/assets/renderPaths.json';

import useScreenSize from '@/hooks/useScreenSize';
import useClickStore from '@/store/clickStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useWebSocketStore from '@/store/websocketStore';
import ChatComponent from '@/components/chat';
import Tilemap from '@/components/tilemap';
import { XYType, VectorImagesType, TileContent, SendMessageEvent } from '@/types';
import { Click, ClickType, CursorColors, CursorDirections, OtherCursorColors } from '@/constants';
import { getCtx, makePath2d as makePath2D, makePath2dFromArray } from '@/utils';

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
  tiles: string[][];
  tileSize: number;
  cursorOriginX: number;
  cursorOriginY: number;
  paddingTiles: number;
  startPoint: { x: number; y: number };
  leftReviveTime: number;
}

const CanvasRenderComponent: React.FC<CanvasRenderComponentProps> = ({
  paddingTiles,
  tiles,
  tileSize,
  cursorOriginX,
  cursorOriginY,
  startPoint,
  leftReviveTime,
}) => {
  /** constants */
  const MOVE_SPEED = 200; // ms
  const ANIMATABLE_ZOOM_MIN = 0.2; // min zoom level
  const [relativeX, relativeY] = [cursorOriginX - startPoint.x, cursorOriginY - startPoint.y];
  const otherCursorPadding = 1 / (paddingTiles - 1); // padding for other cursors
  const [tilePaddingWidth, tilePaddingHeight] = [((paddingTiles - 1) * relativeX) / paddingTiles, ((paddingTiles - 1) * relativeY) / paddingTiles];
  const [otherCursorPaddingWidth, otherCursorPaddingHeight] = [tilePaddingWidth * otherCursorPadding, tilePaddingHeight * otherCursorPadding];
  const { boomPaths, cursorPaths, flagPaths, stunPaths } = RenderPaths;
  const halfTile = tileSize >> 1; // tileSize / 2

  /** stores */
  const { windowHeight, windowWidth } = useScreenSize();
  const { setPosition: setClickPosition, x: clickX, y: clickY, setMovecost } = useClickStore();
  const { x: cursorX, y: cursorY, zoom, color, setPosition: setCursorPosition, goOriginTo } = useCursorStore();
  const { cursors } = useOtherUserCursorsStore();
  const { sendMessage } = useWebSocketStore();

  /** References */
  const movementInterval = useRef<NodeJS.Timeout | null>(null);
  const canvasRefs = {
    myCursorRef: useRef<HTMLCanvasElement>(null),
    otherCursorsRef: useRef<HTMLCanvasElement>(null),
    otherPointerRef: useRef<HTMLCanvasElement>(null),
    interactionCanvasRef: useRef<HTMLCanvasElement>(null),
  };

  /** States */
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [paths, setPaths] = useState<XYType[]>([]);
  const [leftPaths, setLeftPaths] = useState<XYType>({ x: 0, y: 0 });
  const [forwardPath, setForwardPath] = useState<XYType>();
  const [cachedVectorAssets, setCachedVectorAssets] = useState<VectorImagesType>();

  /** Cancel interval function for animation. */
  const cancelCurrentMovement = () => {
    clearInterval(movementInterval.current!);
    movementInterval.current = null;
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
  const isOpened = (tile: string) => {
    const { CLOSED, FLAGGED } = TileContent;
    return ![CLOSED, FLAGGED].some(c => tile[0] === c);
  };

  /**
   * General Click Event Handler
   * @param relativeTileX x position of clicked tile
   * @param relativetileY y position of clicked tile
   * @returns void
   * */
  const moveCursor = (relativeTileX: number, relativetileY: number, clickedX: number, clickedY: number, type: ClickType) => {
    if (movementInterval.current) return;
    const foundPaths = findPathUsingAStar(relativeX, relativeY, relativeTileX, relativetileY);
    let currentPath = foundPaths[0];
    if (!currentPath) return;

    // start moving
    setMovecost(foundPaths.length - 1);
    setCursorPosition(relativeTileX + startPoint.x, relativetileY + startPoint.y);
    let index = 0;
    let [innerCursorX, innerCursorY] = [cursorOriginX, cursorOriginY];

    const moveAnimation = (dx: number, dy: number) => {
      const { interactionCanvasRef: I_canvas, otherCursorsRef: C_canvas, otherPointerRef: P_canvas } = canvasRefs;
      const tilemap = document.getElementById('Tilemap');
      const currentRefs = [I_canvas.current, C_canvas.current, P_canvas.current, tilemap];
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / MOVE_SPEED, 1);
        const trans = tileSize * (1 - progress);
        const [transX, transY] = [trans * dx, trans * dy];
        currentRefs.forEach(c => (c!.style.transform = `translate(${transX}px, ${transY}px)`));
        if (progress < 1) requestAnimationFrame(animate);
        else currentRefs.forEach(c => (c!.style.transform = 'translate(0px, 0px)'));
      };
      requestAnimationFrame(animate);
    };

    movementInterval.current = setInterval(() => {
      // Done Move Cursor
      if (++index >= foundPaths.length) {
        clickEvent(clickedX, clickedY, type); // Send last click point.
        setPaths([]);
        cancelCurrentMovement();
        return;
      }
      const path = foundPaths[index];
      if (!path) return;
      const [dx, dy] = [Math.sign(path.x - currentPath.x), Math.sign(path.y - currentPath.y)];
      setForwardPath({ x: dx, y: dy }); // Set forward path for cursor rotation.

      // if the other cursor is on the tile, find another path
      // if (checkIsOtherCursorOnTile(dx + innerCursorX, dy + innerCursorY)) {
      //   cancelCurrentMovement();
      //   setZoom(zoom - 0.0001);
      //   moveCursor(relativeTileX, relativetileY, clickedX, clickedY, type);
      //   return;
      // }
      goOriginTo(dx, dy);

      [innerCursorX, innerCursorY] = [dx + innerCursorX, dy + innerCursorY];
      currentPath = path;
      setPaths(foundPaths.slice(index));
      if (zoom < ANIMATABLE_ZOOM_MIN) return;
      moveAnimation(dx, dy);
    }, MOVE_SPEED);
  };

  const clickEvent = (x: number, y: number, click_type: ClickType) => {
    const payload = { position: { x, y }, click_type };
    const body = JSON.stringify({ event: SendMessageEvent.POINTING, payload });
    sendMessage(body);
  };

  /** Click Event Handler */
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;
    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    // Transform canvas float coordinate to integer coordinate
    const [tileArrayX, tileArrayY] = [(clickX / tileSize + tilePaddingWidth) >>> 0, (clickY / tileSize + tilePaddingHeight) >>> 0];
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    // Setting content of clicked tile's content
    const clickedTileContent = tiles[tileArrayY]?.[tileArrayX] ?? null;
    setClickPosition(tileX, tileY, clickedTileContent);

    // Send Click Event
    const clickType: ClickType = event.buttons & 0b10 ? Click.SPECIAL_CLICK : Click.GENERAL_CLICK;
    clickEvent(tileX, tileY, clickType);

    // Prevent double click if moving.
    if (movementInterval.current) return;

    // Processing in Local.
    switch (clickType) {
      case Click.SPECIAL_CLICK:
        if (clickedTileContent.includes(TileContent.CLOSED)) return;
        break;
      case Click.GENERAL_CLICK:
        let { x: targetTileX, y: targetTileY } = findOpenedNeighbors(tileArrayX, tileArrayY);
        if (isAlreadyCursorNeighbor(tileX, tileY)) [targetTileX, targetTileY] = [tileArrayX, tileArrayY];
        moveCursor(targetTileX, targetTileY, tileX, tileY, clickType);
        break;
    }
  };

  /** Check if the clicked tile is already a neighbor of the cursor */
  const isAlreadyCursorNeighbor = (x: number, y: number) => CursorDirections.some(([dx, dy]) => cursorOriginX + dx === x && cursorOriginY + dy === y);

  const findOpenedNeighbors = (currentX: number, currentY: number) => {
    let result = { x: Infinity, y: Infinity };
    [[0, 0], ...CursorDirections].some(([dx, dy]) => {
      const [x, y] = [currentX + dx, currentY + dy];
      const tileContent = tiles[y]?.[x];
      if (!tileContent || !isOpened(tileContent)) return false;
      result = { x, y };
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
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      const adjustedScale = zoom * scale;
      const centerOffset = halfTile >> 2;

      // if the cursor is player's cursor.
      if (scale === 1) {
        // 8방향 커서 오프셋 계산 (원래 로직 유지하면서 최적화)
        // up 0, rightup 1, right 2, rightdown 3, down 4, leftdown 5, left 6, leftup 7
        const angle = (Math.round((rotated + Math.PI) / (Math.PI / 4)) + 2) % 8;
        switch (angle) {
          case 0: // up
            ctx.translate(halfTile, centerOffset);
            break;
          case 1: // rightup
            ctx.translate(tileSize - centerOffset, centerOffset);
            break;
          case 2: // right
            ctx.translate(tileSize - centerOffset, halfTile);
            break;
          case 3: // rightdown
            ctx.translate(tileSize - centerOffset, tileSize - centerOffset);
            break;
          case 4: // down
            ctx.translate(halfTile, tileSize - centerOffset);
            break;
          case 5: // leftdown
            ctx.translate(centerOffset, tileSize - centerOffset);
            break;
          case 6: // left
            ctx.translate(centerOffset, halfTile);
            break;
          case 7: // leftup
            ctx.translate(centerOffset, centerOffset);
            break;
        }
      } else ctx.translate(halfTile, halfTile);

      ctx.rotate(rotated - Math.PI / 4);

      ctx.scale(adjustedScale, adjustedScale);
      ctx.fill(cachedVectorAssets!.cursor);
      ctx.restore();
      if (!(reviveAt > 0 && Date.now() < reviveAt && cachedVectorAssets?.stun)) return;
      const stunScale = zoom >> 1;
      ctx.save();
      ctx.translate(x - halfTile, y - halfTile);
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
    const otherCursorsCtx = getCtx(canvas);
    if (!otherCursorsCtx) return;

    otherCursorsCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const { x, y, color, revive_at } = cursor;
      const { x: pointerX, y: pointerY } = cursor?.pointer ?? { x, y };
      const [drawX, drawY] = [x - cursorOriginX + otherCursorPaddingWidth, y - cursorOriginY + otherCursorPaddingHeight];
      const rotate = Math.atan2(x - pointerX, y - pointerY);
      drawCursor(otherCursorsCtx, drawX * tileSize, drawY * tileSize, CursorColors[color], revive_at, rotate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors, cursorOriginX, cursorOriginY, tilePaddingWidth, tilePaddingHeight, tileSize, windowWidth, windowHeight, canvasRefs.otherCursorsRef]);

  const drawPointer = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, border: number) => {
      if (!ctx) return;
      const half = border >> 1;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = border;
      ctx.strokeRect(x + half, y + half, tileSize - border, tileSize - border);
      ctx.closePath();
    },
    [tileSize],
  );

  const drawOtherUserPointers = (borderPixel: number) => {
    const canvas = canvasRefs.otherPointerRef.current!;
    const otherPointerCtx = getCtx(canvas);
    if (!otherPointerCtx) return;

    otherPointerCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(({ pointer, color }) => {
      const { x, y } = pointer ?? { x: 0, y: 0 };
      const [drawX, drawY] = [x - cursorOriginX + otherCursorPaddingWidth, y - cursorOriginY + otherCursorPaddingHeight];
      drawPointer(otherPointerCtx, drawX * tileSize, drawY * tileSize, OtherCursorColors[color], borderPixel);
    });
  };

  // Check if the other cursor is on the tile
  const checkIsOtherCursorOnTile = (tileX: number, tileY: number) => cursors.some(c => c.x === tileX + startPoint.x && c.y === tileY + startPoint.y);

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
      for (const [dx, dy] of CursorDirections) {
        // Check if the neighbor is within range of grid and not a flag or other cursor
        const [x, y] = [node.x + dx, node.y + dy];
        // Check if the neighbor is within range of grid
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
    // Get range of grid
    const grid = tiles.map((row, i) => row.map((tile, j) => (isOpened(tile) ? new TileNode(j, i) : null)));

    /** initialize open and close list */
    let openNodes = [start];
    const closedNodes = [];
    start.gScore = 0;
    start.fTotal = start.gScore + start.heuristic;

    while (openNodes.length > 0) {
      const nowNode = openNodes.reduce((a, b) => (a.fTotal < b.fTotal ? a : b));
      if (nowNode.x === target.x && nowNode.y === target.y) {
        setLeftPaths(getLeftPaths(nowNode, startX, startY));
        const path = [];
        for (let temp = nowNode; temp; temp = temp.parent!) path.unshift({ x: temp.x - startX, y: temp.y - startY });
        return path;
      }

      openNodes = openNodes.filter(node => node !== nowNode);
      closedNodes.push(nowNode);

      /** Find neighbor nodes from current node. */
      const neighbors = getNeighbors(grid, nowNode);
      for (const { node, isDiagonal } of neighbors) {
        if (closedNodes.includes(node)) continue;
        // Apply different cost for diagonal movement
        const tempG = nowNode.gScore + (isDiagonal ? 3 : 2);
        if (tempG >= node.gScore) continue;
        if (!openNodes.includes(node)) openNodes.push(node);
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
    const { current: myCursorCanvas } = myCursorRef;
    const { current: otherCursorsCanvas } = otherCursorsRef;
    const { current: otherPointerCanvas } = otherPointerRef;
    const { current: interactionCanvas } = interactionCanvasRef;

    if (!interactionCanvas || !myCursorCanvas || !otherCursorsCanvas || !otherPointerCanvas) return;
    const [interactionCtx, myCursorCtx] = [getCtx(interactionCanvas), getCtx(myCursorCanvas)];
    if (!interactionCtx || !myCursorCtx) return;

    // intialize canvases
    myCursorCtx.clearRect(0, 0, windowWidth, windowHeight);
    interactionCtx.clearRect(0, 0, windowWidth, windowHeight);

    // setting cursor color
    const cursorColor = CursorColors[color];
    const borderPixel = 5 * zoom;

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
      x: cursorX - cursorOriginX - tilePaddingWidth - leftPaths.x + relativeX + 0.5,
      y: cursorY - cursorOriginY - tilePaddingHeight - leftPaths.y + relativeY + 0.5,
    };

    // If both distanceX and distanceY are 0, the cursor will not rotate.
    const rotate = (cursorOriginX !== clickX || cursorOriginY !== clickY) && forwardPath ? Math.atan2(-forwardPath.y, -forwardPath.x) : 0;
    drawCursor(myCursorCtx, cursorPosition.x, cursorPosition.y, cursorColor, 0, rotate);
    drawPointer(interactionCtx, clickCanvasPosition.x, clickCanvasPosition.y, cursorColor, borderPixel);
    drawOtherUserCursors();
    drawOtherUserPointers(borderPixel);

    // Draw Cursor Movement path
    const scaledPoints = paths.map(vec => {
      const [vX, vY] = [vec.x + compensation.x, vec.y + compensation.y];
      return { x: vX * tileSize, y: vY * tileSize };
    });
    if (scaledPoints.length <= 1) return;

    interactionCtx.beginPath();
    interactionCtx.strokeStyle = cursorColor;
    interactionCtx.lineWidth = tileSize / 10;
    interactionCtx.lineJoin = interactionCtx.lineCap = 'round';
    interactionCtx.miterLimit = 2;

    const baseRadius = tileSize * 0.15;
    interactionCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length - 1; i++) {
      const [ex, now, next] = [...scaledPoints.slice(i - 1, i + 2)];
      const [exVectorX, exVectorY] = [now.x - ex.x, now.y - ex.y];
      const [nextVectorX, nextVectorY] = [next.x - now.x, next.y - now.y];
      const [len1, len2] = [Math.hypot(exVectorX, exVectorY), Math.hypot(nextVectorX, nextVectorY)];
      const dot = exVectorX * nextVectorX + exVectorY * nextVectorY;
      const cross = exVectorX * nextVectorY - exVectorY * nextVectorX;
      // If angle is almost straight, do not round
      const cosTheta = dot / (len1 * len2);
      const isStraight = Math.abs(cross) < 1e-6 || cosTheta > 0.995;
      if (isStraight) interactionCtx.lineTo(now.x, now.y);
      else {
        // Clamp radius to local segment lengths to avoid overshooting
        const cornerRadius = Math.min(baseRadius, 0.5 * Math.min(len1, len2));
        interactionCtx.arcTo(now.x, now.y, next.x, next.y, cornerRadius);
      }
    }
    const [beforeLast, last] = [...scaledPoints.slice(-2)];
    const [lastPointX, lastPointY] = [(last.x + beforeLast.x) >> 1, (last.y + beforeLast.y) >> 1];
    const pathRotate = Math.PI + Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x);
    interactionCtx.lineTo(lastPointX, lastPointY);
    drawCursor(interactionCtx, lastPointX - halfTile, lastPointY - halfTile, cursorColor, 0, pathRotate, 0.6);
    interactionCtx.stroke();
  };

  /** Load Assets and Render (optimized) */
  useLayoutEffect(() => {
    if (!isInitializing && tiles.length > 0) return;

    // 폰트를 비동기로 로드하되, 실패해도 계속 진행
    const loadFontOptional = async () => {
      try {
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

    // 벡터 에셋은 즉시 생성 (폰트 로딩과 병렬)
    const cursor = makePath2D(cursorPaths);
    const stun = makePath2dFromArray(stunPaths);
    const flag = { flag: makePath2D(flagPaths[0]), pole: makePath2D(flagPaths[1]) };
    const boom = { inner: makePath2D(boomPaths[0]), outer: makePath2D(boomPaths[1]) };
    setCachedVectorAssets({ cursor, stun, flag, boom });

    // 폰트 로딩과 관계없이 초기화 완료
    setIsInitializing(false);

    // 폰트는 백그라운드에서 로드
    loadFontOptional();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, isInitializing]);

  // Render Intreraction Objects
  useEffect(() => {
    if (!isInitializing) renderInteractionCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorOriginX, cursorOriginY, startPoint, clickX, clickY, color, cursors]);

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
          <Tilemap className={S.canvas + ' z-10'} {...{ tilePadHeight: tilePaddingHeight, tilePadWidth: tilePaddingWidth, tileSize, tiles }} />
          <canvas className={S.canvas + ' z-20'} id="OtherCursors" ref={canvasRefs.otherCursorsRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas + ' z-30'} id="OtherPointer" ref={canvasRefs.otherPointerRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas + ' z-40'} id="MyCursor" ref={canvasRefs.myCursorRef} width={windowWidth} height={windowHeight} />
          <canvas
            className={S.canvas + ' z-50'}
            id="InteractionCanvas"
            ref={canvasRefs.interactionCanvasRef}
            {...{ width: windowWidth, height: windowHeight, onPointerDown: handleClick }}
          />
        </div>
      )}
    </>
  );
};

export default CanvasRenderComponent;
