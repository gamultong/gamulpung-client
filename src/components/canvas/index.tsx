'use client';
import S from './style.module.scss';
import React, { useRef, useEffect, useState, Dispatch, SetStateAction, useLayoutEffect } from 'react';
import Paths from '@/assets/paths.json';

import useScreenSize from '@/hooks/useScreenSize';
import useClickStore from '@/store/clickStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useWebSocketStore from '@/store/websocketStore';
import ChatComponent from '../chat';
import Tilemap from '../tilemap';

class TileNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: TileNode | null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.g = Infinity; // Cost from start node
    this.h = 0; // Heuristic (estimated cost to goal)
    this.f = Infinity; // Total cost f = g + h
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
  setCachingTiles: Dispatch<SetStateAction<string[][]>>;
}

interface Path {
  x: number;
  y: number;
}

interface VectorImages {
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

const CanvasRenderComponent: React.FC<CanvasRenderComponentProps> = ({
  paddingTiles,
  tiles,
  tileSize,
  cursorOriginX,
  cursorOriginY,
  startPoint,
  leftReviveTime,
  setCachingTiles,
}) => {
  /** constants */
  const MOVE_SPEED = 200; // ms
  const ZOOM_MIN = 0.4; // min zoom level
  const [relativeX, relativeY] = [cursorOriginX - startPoint.x, cursorOriginY - startPoint.y];
  const [tilePaddingWidth, tilePaddingHeight] = [((paddingTiles - 1) * relativeX) / paddingTiles, ((paddingTiles - 1) * relativeY) / paddingTiles];
  const { boomPaths, cursorPaths, flagPaths, stunPaths } = Paths;
  const directions = [
    [-1, 0], // left
    [0, -1], // up
    [0, 1], // down
    [1, 0], // right
    [-1, -1], // left-up
    [-1, 1], // left-down
    [1, -1], // right-up
    [1, 1], // right-down
  ];
  const cursorColors: { [key: string]: string } = {
    red: '#FF4D00',
    blue: '#0094FF',
    yellow: '#F0C800',
    purple: '#BC3FDC',
    '0': '#FF4D00',
    '1': '#F0C800',
    '2': '#0094FF',
    '3': '#BC3FDC',
  };
  const otherCursorColors: { [key: string]: string } = {
    red: '#FBCBB6',
    blue: '#A8DBFF',
    yellow: '#FFEE99',
    purple: '#E8BEF3',
    '0': '#FBCBB6',
    '1': '#A8DBFF',
    '2': '#FFEE99',
    '3': '#E8BEF3',
  };
  /** stores */
  const { windowHeight, windowWidth } = useScreenSize();
  const {
    x: cursorX,
    y: cursorY,
    godown,
    goleft,
    goright,
    goup,
    goDownLeft,
    goDownRight,
    goUpLeft,
    goUpRight,
    zoom,
    color,
    setPosition: setCusorPosition,
  } = useCursorStore();
  const { setPosition: setClickPosition, x: clickX, y: clickY, setMovecost } = useClickStore();
  const { cursors } = useOtherUserCursorsStore();
  const { sendMessage } = useWebSocketStore();

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
  const [paths, setPaths] = useState<Path[]>([]);
  const [leftPaths, setLeftPaths] = useState<Path>({ x: 0, y: 0 });
  const [forwardPath, setForwardPath] = useState<Path>();
  const [cachedVectorAssets, setCachedVectorAssets] = useState<VectorImages>();

  /** Cancel interval function for animation. */
  const cancelCurrentMovement = () => {
    if (!movementInterval.current) return;
    clearInterval(movementInterval.current);
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
  const checkTileHasOpened = (tile: string) => !['F', 'C'].some(c => tile.includes(c));

  /**
   * General Click Event Handler
   * @param relativeTileX x position of clicked tile
   * @param relativetileY y position of clicked tile
   * @returns void
   * */
  const moveCursor = (relativeTileX: number, relativetileY: number, clickedX: number, clickedY: number, type: 'GENERAL_CLICK' | 'SPECIAL_CLICK') => {
    if (movementInterval.current) return;
    let index = 0;
    const paths = findPathUsingAStar(relativeX, relativeY, relativeTileX, relativetileY);
    let currentPath = paths[index];
    if (currentPath?.x === undefined || currentPath?.y === undefined) return;
    let [innerCursorX, innerCursorY] = [cursorOriginX, cursorOriginY];
    setMovecost(paths.length - 1);
    setCusorPosition(relativeTileX + startPoint.x, relativetileY + startPoint.y);

    const animationOfMoving = (dx: number, dy: number) => {
      const { interactionCanvasRef: I_ref, otherCursorsRef: C_ref, otherPointerRef: P_ref } = canvasRefs;
      const tilemap = document.getElementById('Tilemap') as HTMLCanvasElement;
      const currentRefs = [I_ref.current, C_ref.current, P_ref.current, tilemap].filter(Boolean) as HTMLCanvasElement[];
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / MOVE_SPEED, 1);
        const translate = tileSize * (1 - progress);
        const [translateX, translateY] = [translate * dx, translate * dy];
        currentRefs.forEach(c => (c.style.transform = `translate(${translateX}px, ${translateY}px)`));
        if (progress < 1) requestAnimationFrame(animate);
        // Ensure the transform resets at the end
        else currentRefs.forEach(c => (c.style.transform = 'translate(0, 0)'));
      };
      requestAnimationFrame(animate);
    };

    movementInterval.current = setInterval(() => {
      if (++index >= paths.length) {
        clickEvent(clickedX, clickedY, type);
        setPaths([]);
        cancelCurrentMovement();
        return;
      }
      const path = paths[index];
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

      if (dx === 1 && dy === 1) goDownRight();
      if (dx === 1 && dy === -1) goUpRight();
      if (dx === 1 && dy === 0) goright();
      if (dx === -1 && dy === 1) goDownLeft();
      if (dx === -1 && dy === -1) goUpLeft();
      if (dx === -1 && dy === 0) goleft();
      if (dx === 0 && dy === 1) godown();
      if (dx === 0 && dy === -1) goup();

      [innerCursorX, innerCursorY] = [dx + innerCursorX, dy + innerCursorY];
      currentPath = path;
      setPaths(paths.slice(index));
      if (zoom < ZOOM_MIN) return;
      animationOfMoving(dx, dy);
    }, MOVE_SPEED);
  };

  const clickEvent = (x: number, y: number, click_type: 'GENERAL_CLICK' | 'SPECIAL_CLICK') => {
    const position = { x, y };
    const payload = { position, click_type };
    const body = JSON.stringify({ event: 'pointing', payload });
    sendMessage(body);
  };

  /** Click Event Handler */
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;
    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    // Transform canvas coordinate to relative and absolute coordinate
    const [tileArrayX, tileArrayY] = [Math.floor(clickX / tileSize + tilePaddingWidth), Math.floor(clickY / tileSize + tilePaddingHeight)];
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    // Getting content of clicked tile
    const clickedTileContent = tiles[tileArrayY]?.[tileArrayX] ?? 'Out of bounds';
    // Set click position
    setClickPosition(tileX, tileY, clickedTileContent);

    const clickType = event.buttons === 2 ? 'SPECIAL_CLICK' : 'GENERAL_CLICK';
    if (movementInterval.current) {
      cancelCurrentMovement();
      setCachingTiles(tiles);
    }
    clickEvent(tileX, tileY, clickType);

    if (clickType === 'SPECIAL_CLICK' && !clickedTileContent.includes('C')) return;
    let { x: targetTileX, y: targetTileY } = findOpenedNeighbors(tileArrayX, tileArrayY);
    if (isAlreadyCursorNeighbor(tileX, tileY)) [targetTileX, targetTileY] = [tileArrayX, tileArrayY];
    moveCursor(targetTileX, targetTileY, tileX, tileY, clickType);
  };

  /**
   * Check if the clicked tile is already a neighbor of the cursor,
   * which means the cursor should not move to the clicked tile.
   * @param x number
   * @param y number
   * @returns boolean
   */
  const isAlreadyCursorNeighbor = (x: number, y: number) => directions.some(([dx, dy]) => cursorOriginX + dx === x && cursorOriginY + dy === y);

  const findOpenedNeighbors = (x: number, y: number) => {
    const directionsWithCenter = [[0, 0], ...directions];
    for (const [dx, dy] of directionsWithCenter) {
      const [nx, ny] = [x + dx, y + dy];
      if (tiles[ny]?.[nx] && checkTileHasOpened(tiles[ny][nx])) return { x: nx, y: ny };
    }
    return { x: Infinity, y: Infinity };
  };

  /**
   * Draw cursor on canvas
   * @param ctx CanvasRenderingContext2D
   * @param x x position
   * @param y y position
   * @param color cursor color
   * @param revive_at revive time
   * @param rotate rotate of cursor
   * @param scale scale of cursor
   */
  const drawCursor = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    revive_at: number | null,
    rotate: number | null,
    scale: number = 1,
  ) => {
    ctx.save();
    const adjustedScale = (zoom / 3.5) * scale;
    ctx.fillStyle = color;
    // What if the cursor is rotating. Then the cursor will rotate.
    if (rotate !== null) {
      const [rotateX, rotateY] = [Math.cos(rotate - 1 / 4) * 2 * Math.PI, Math.sin(rotate - 1 / 4) * 2 * Math.PI];
      ctx.translate(x - (rotateX * tileSize) / 18 / scale + tileSize / 2, y - (rotateY * tileSize) / 18 / scale + tileSize / 2);
      ctx.rotate(rotate - (Math.PI / 24) * 8);
    } else ctx.translate(x + tileSize / 6 / scale, y + tileSize / 6 / scale);
    ctx.scale(adjustedScale, adjustedScale);
    ctx.fill(cachedVectorAssets?.cursor as Path2D);
    ctx.restore();
    if (revive_at && Date.now() < revive_at && cachedVectorAssets?.stun) {
      const stunScale = (zoom / 2) * scale;
      ctx.save();
      ctx.translate(x - tileSize / 2 / scale, y - tileSize / 2 / scale);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.scale(stunScale, stunScale);
      for (let i = 0; i < cachedVectorAssets?.stun.length; i++) {
        ctx.fill(cachedVectorAssets.stun[i]);
        ctx.stroke(cachedVectorAssets.stun[i]);
      }
    }
    ctx.restore();
  };

  const drawOtherUserCursors = () => {
    const otherCursorsCtx = canvasRefs.otherCursorsRef.current?.getContext('2d');
    if (!otherCursorsCtx) return;
    otherCursorsCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const [x, y] = [cursor.x - cursorOriginX + tilePaddingWidth / 2, cursor.y - cursorOriginY + tilePaddingHeight / 2];
      const [distanceX, distanceY] = [cursor.x - (cursor.pointer?.x ?? cursor.x), cursor.y - (cursor.pointer?.y ?? cursor.y)];
      let rotate = null;
      if (distanceX !== 0 || distanceY !== 0) rotate = Math.atan2(distanceY, distanceX);
      drawCursor(otherCursorsCtx, x * tileSize, y * tileSize, cursorColors[cursor.color], cursor.revive_at || null, rotate);
    });
  };

  const drawPointer = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, borderPixel: number) => {
    if (!ctx) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = borderPixel;
    ctx.strokeRect(x + borderPixel / 2, y + borderPixel / 2, tileSize - borderPixel, tileSize - borderPixel);
    ctx.closePath();
  };

  const drawOtherUserPointers = (borderPixel: number) => {
    const otherPointerCtx = canvasRefs.otherPointerRef.current?.getContext('2d');
    if (!otherPointerCtx) return;
    otherPointerCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const [x, y] = [cursor.pointer?.x - cursorOriginX + tilePaddingWidth / 2, cursor.pointer?.y - cursorOriginY + tilePaddingHeight / 2];
      drawPointer(otherPointerCtx, x * tileSize, y * tileSize, otherCursorColors[cursor.color], borderPixel);
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
    function getNeighbors(grid: (TileNode | null)[][], node: TileNode) {
      const neighbors = [];
      for (const [dx, dy] of directions) {
        const [x, y] = [node.x + dx, node.y + dy];
        // Make sure the neighbor is within bounds and not an obstacle
        if (y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== null && !checkIsOtherCursorOnTile(x, y))
          neighbors.push({ node: grid[y][x], isDiagonal: dx !== 0 && dy !== 0 });
      }
      return neighbors;
    }

    /** initialize tiles */
    const [start, target] = [new TileNode(startX, startY), new TileNode(targetX, targetY)];
    const grid = tiles.map((row, i) => row.map((tile, j) => (checkTileHasOpened(tile) ? new TileNode(j, i) : null))) as (TileNode | null)[][];

    /** initialize open and close list */
    let openNodeList = [start];
    const closedList = [];
    start.g = 0;
    start.f = start.g + start.h;

    while (openNodeList.length > 0) {
      const current = openNodeList.reduce((a, b) => (a.f < b.f ? a : b));
      if (current.x === target.x && current.y === target.y) {
        const path = [];
        let temp = current;
        /** calculate distance from target */
        const newLeftPaths = { x: temp.x - startX, y: temp.y - startY };
        setLeftPaths(newLeftPaths);
        while (temp) {
          path.unshift(temp);
          temp = temp.parent as TileNode;
        }
        return path;
      }
      openNodeList = openNodeList.filter(node => node !== current);
      closedList.push(current);

      /** Find neighbor nodes from current node. */
      const neighbors = getNeighbors(grid, current);
      for (const { node: neighbor, isDiagonal } of neighbors) {
        if (closedList.includes(neighbor)) continue;
        // Apply different cost for diagonal movement
        const tempG = current.g + (isDiagonal ? 1.5 : 1);
        if (tempG >= neighbor.g) continue;
        if (!openNodeList.includes(neighbor)) openNodeList.push(neighbor);
        neighbor.parent = current;
        neighbor.g = tempG;
        neighbor.h = Math.abs(neighbor.x - target.x) + Math.abs(neighbor.y - target.y);
        neighbor.f = neighbor.g + neighbor.h;
      }
    }
    return [];
  };

  const renderInteractionCanvas = () => {
    const {
      interactionCanvasRef: { current: interactionCanvas },
      myCursorRef: { current: myCursorCanvas },
      otherCursorsRef: { current: otherCursorsCanvas },
      otherPointerRef: { current: otherPointerCanvas },
    } = canvasRefs;
    if (!interactionCanvas || !myCursorCanvas || !otherCursorsCanvas || !otherPointerCanvas) return;

    const [interactionCtx, myCursorCtx] = [interactionCanvas.getContext('2d'), myCursorCanvas.getContext('2d')];
    if (!interactionCtx || !myCursorCtx) return;

    // intialize canvases
    myCursorCtx.clearRect(0, 0, windowWidth, windowHeight);
    interactionCtx.clearRect(0, 0, windowWidth, windowHeight);

    // setting cursor color
    const cursorColor = cursorColors[color];
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
      x: cursorX - cursorOriginX - tilePaddingWidth - leftPaths.x,
      y: cursorY - cursorOriginY - tilePaddingHeight - leftPaths.y,
    };

    // If both distanceX and distanceY are 0, the cursor will not rotate.
    const rotate = (cursorOriginX !== clickX || cursorOriginY !== clickY) && forwardPath ? Math.atan2(-forwardPath.y, -forwardPath.x) : null;
    // Draw my cursor
    drawCursor(myCursorCtx, cursorPosition.x, cursorPosition.y, cursorColor, null, rotate);
    // Describe my clicked tile border
    drawPointer(interactionCtx, clickCanvasPosition.x, clickCanvasPosition.y, cursorColor, borderPixel);
    // Draw other users' cursor
    drawOtherUserCursors();
    // Draw other users' clicked tile border
    drawOtherUserPointers(borderPixel);
    // Draw path
    if (paths.length > 0) {
      const [x, y] = [paths[0].x + compensation.x + 0.5, paths[0].y + compensation.y + 0.5];
      interactionCtx.beginPath();
      interactionCtx.strokeStyle = 'black';
      interactionCtx.lineWidth = tileSize / 6;
      interactionCtx.moveTo(x * tileSize, y * tileSize); // start point
      paths.forEach(vector => {
        const [vx, vy] = [vector.x + compensation.x + 0.5, vector.y + compensation.y + 0.5];
        interactionCtx.lineTo(vx * tileSize, vy * tileSize);
      });
      interactionCtx.stroke();
    }
  };

  /** Load and Render */
  useLayoutEffect(() => {
    if (!isInitializing && tiles.length > 0) return;
    const lotteriaChabFont = new FontFace(
      'LOTTERIACHAB',
      "url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIACHAB.woff2') format('woff2')",
    );
    Promise.all([lotteriaChabFont.load()]).then(() => {
      // Set vector images
      document.fonts.add(lotteriaChabFont);
      const cursor = new Path2D(cursorPaths);
      const stun = [new Path2D(stunPaths[0]), new Path2D(stunPaths[1]), new Path2D(stunPaths[2])];
      const flag = { flag: new Path2D(flagPaths[0]), pole: new Path2D(flagPaths[1]) };
      const boom = { inner: new Path2D(boomPaths[0]), outer: new Path2D(boomPaths[1]) };
      setCachedVectorAssets({ cursor, stun, flag, boom });
      setIsInitializing(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, isInitializing, tileSize, zoom]);

  // Render Intreraction Objects
  useEffect(() => {
    if (!isInitializing) renderInteractionCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorOriginX, cursorOriginY, startPoint, clickX, clickY, color, cursors]);

  return (
    <>
      {isInitializing ? (
        <div className={S.loading}>
          <h1>Assets Loading...</h1>
          <div className={`${tiles.length < 1 ? S.loadingBar : S.loadComplete}`} />
        </div>
      ) : (
        <div className={`${S.canvasContainer} ${leftReviveTime > 0 ? S.vibration : ''}`}>
          <ChatComponent />
          <Tilemap
            isMoving={paths.length > 0}
            tilePaddingHeight={tilePaddingHeight}
            tilePaddingWidth={tilePaddingWidth}
            tileSize={tileSize}
            tiles={tiles}
            className={S.canvas}
          />
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
