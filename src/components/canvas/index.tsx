'use client';
import S from './style.module.scss';
import React, { useRef, useEffect, useState, Dispatch, SetStateAction } from 'react';
import Paths from '@/assets/paths.json';

import useScreenSize from '@/hooks/useScreenSize';
import useClickStore from '@/store/clickStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useWebSocketStore from '@/store/websocketStore';
import ChatComponent from '../chat';

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
  const movingSpeed = 200; // milliseconds
  const animationFrames = 30; // frames
  const [relativeX, relativeY] = [cursorOriginX - startPoint.x, cursorOriginY - startPoint.y];
  const [tilePaddingWidth, tilePaddingHeight] = [((paddingTiles - 1) * relativeX) / paddingTiles, ((paddingTiles - 1) * relativeY) / paddingTiles];
  const { boomPaths, cursorPaths, flagPaths, stunPaths, tileColors, countColors } = Paths;
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
    tileCanvasRef: useRef<HTMLCanvasElement>(null),
    interactionCanvasRef: useRef<HTMLCanvasElement>(null),
    otherCursorsRef: useRef<HTMLCanvasElement>(null),
    otherPointerRef: useRef<HTMLCanvasElement>(null),
  };

  /** States */
  const [loading, setLoading] = useState<boolean>(true);
  const [paths, setPaths] = useState<Path[]>([]);
  const [leftPaths, setLeftPaths] = useState<Path>({ x: 0, y: 0 });
  const [renderedTiles, setRenderedTiles] = useState<string[][]>([]);
  const [cachedVectorImages, setCachedVectorImages] = useState<VectorImages>();

  /** Cancel interval function for animation. */
  const cancelCurrentMovement = () => {
    if (movementInterval.current) {
      clearInterval(movementInterval.current);
      movementInterval.current = null;
    }
  };

  /** Prevent default right click event */
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', preventContextMenu);
    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
      cancelCurrentMovement();
    };
  }, []);

  /** Check if the tile has been opened */
  const checkTileHasOpened = (tile: string) => {
    return !['F', 'C'].some(c => tile.includes(c));
  };

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
    setMovecost(paths.length - 1);
    setCusorPosition(relativeTileX + startPoint.x, relativetileY + startPoint.y);

    const animationOfTileMoving = (dx: number, dy: number) => {
      let countFrame = 0;
      const animation = setInterval(() => {
        const { tileCanvasRef, interactionCanvasRef, otherCursorsRef } = canvasRefs;
        if (!tileCanvasRef.current || !interactionCanvasRef.current || !otherCursorsRef.current) return;
        const currentRefs = [tileCanvasRef.current, interactionCanvasRef.current, otherCursorsRef.current];
        if (countFrame >= 1) {
          for (const canvas of currentRefs) canvas.style.transform = '0'; // reset transform
          clearInterval(animation);
          return;
        }
        countFrame += 1 / animationFrames;
        const [translateX, translateY] = [dx * (tileSize - countFrame * tileSize), dy * (tileSize - countFrame * tileSize)];
        for (const canvas of currentRefs) canvas.style.transform = `translate(${translateX}px, ${translateY}px)`;
      }, movingSpeed / animationFrames);
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

      if (dx === 1 && dy === 1) goDownRight();
      else if (dx === 1 && dy === -1) goUpRight();
      else if (dx === 1 && dy === 0) goright();
      else if (dx === -1 && dy === 1) goDownLeft();
      else if (dx === -1 && dy === -1) goUpLeft();
      else if (dx === -1 && dy === 0) goleft();
      else if (dx === 0 && dy === 1) godown();
      else if (dx === 0 && dy === -1) goup();

      currentPath = path;
      animationOfTileMoving(dx, dy);
      setPaths(paths.slice(index));
    }, movingSpeed);
  };

  const clickEvent = (x: number, y: number, click_type: 'GENERAL_CLICK' | 'SPECIAL_CLICK') => {
    const body = JSON.stringify({
      event: 'pointing',
      payload: {
        position: {
          x: x,
          y: y,
        },
        click_type,
      },
    });
    sendMessage(body);
  };

  /** Click Event Handler */
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const tileCanvas = canvasRefs.tileCanvasRef.current;
    if (!tileCanvas) return;
    const { left: rectLeft, top: rectTop } = tileCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    // Transform canvas coordinate to relative coordinate
    const [tileArrayX, tileArrayY] = [Math.floor(clickX / tileSize + tilePaddingWidth), Math.floor(clickY / tileSize + tilePaddingHeight)];
    // Transform canvas coordinate to absolute coordinate
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    // Getting content of clicked tile
    const clickedTileContent = tiles[tileArrayY]?.[tileArrayX] ?? 'Out of bounds';
    // Set click position
    setClickPosition(tileX, tileY, clickedTileContent);

    const clickType = event.buttons === 2 ? 'SPECIAL_CLICK' : 'GENERAL_CLICK';
    clickEvent(tileX, tileY, clickType);
    if (movementInterval.current) {
      cancelCurrentMovement();
      setCachingTiles(tiles);
    }

    if (isAlreadyCursorNeighbor(tileX, tileY)) {
      moveCursor(tileArrayX, tileArrayY, tileX, tileY, clickType);
      return;
    }

    const { x, y } = findOpenedNeighbors(tileArrayX, tileArrayY);
    moveCursor(x, y, tileX, tileY, clickType);
    return;
  };

  /**
   * Check if the clicked tile is already a neighbor of the cursor, which means the cursor should not move to the clicked tile.
   * @param x number
   * @param y number
   * @returns boolean
   */
  const isAlreadyCursorNeighbor = (x: number, y: number) => {
    const directions = [
      [-1, 0], // left
      [0, -1], // up
      [0, 1], // down
      [1, 0], // right
      [-1, -1], // left-up
      [-1, 1], // left-down
      [1, -1], // right-up
      [1, 1], // right-down
    ]; // 8-directional neighbors
    for (const [dx, dy] of directions) {
      const [nx, ny] = [cursorOriginX + dx, cursorOriginY + dy];
      if (nx === x && ny === y) return true;
    }
    return false;
  };

  const findOpenedNeighbors = (x: number, y: number) => {
    const directions = [
      [0, 0], //center
      [-1, 0], // left
      [0, -1], // up
      [0, 1], // down
      [1, 0], // right
      [-1, -1], // left-up
      [-1, 1], // left-down
      [1, -1], // right-up
      [1, 1], // right-down
    ]; // 8-directional neighbors
    for (const [dx, dy] of directions) {
      const [nx, ny] = [x + dx, y + dy];
      if (ny >= 0 && ny < tiles.length && nx >= 0 && nx < tiles[ny].length) {
        const tile = tiles[ny][nx];
        if (checkTileHasOpened(tile)) return { x: nx, y: ny };
      }
    }
    return { x: Infinity, y: Infinity };
  };

  /**
   * Draw cursor
   * @param ctx CanvasRenderingContext2D
   * @param x x position
   * @param y y position
   * @param color cursor color
   * @param revive_at revive time
   * @param scale scale of cursor
   */
  const drawCursor = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, revive_at: number | null, scale: number = 1) => {
    const adjustedScale = (zoom / 3.5) * scale;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x + tileSize / 6 / scale, y + tileSize / 6 / scale);
    ctx.scale(adjustedScale, adjustedScale);
    ctx.fill(cachedVectorImages?.cursor as Path2D);
    ctx.restore();
    if (revive_at && Date.now() < revive_at && cachedVectorImages?.stun) {
      const stunScale = (zoom / 2) * scale;
      ctx.save();
      ctx.translate(x - tileSize / 2 / scale, y - tileSize / 2 / scale);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.scale(stunScale, stunScale);
      for (let i = 0; i < cachedVectorImages?.stun.length; i++) {
        ctx.fill(cachedVectorImages.stun[i]);
        ctx.stroke(cachedVectorImages.stun[i]);
      }
    }
    ctx.restore();
  };

  const drawOtherUserCursors = () => {
    const otherCursorsCtx = canvasRefs.otherCursorsRef.current?.getContext('2d');
    if (!otherCursorsCtx) return;
    otherCursorsCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const [x, y] = [cursor.x - cursorOriginX + tilePaddingWidth, cursor.y - cursorOriginY + tilePaddingHeight];
      drawCursor(otherCursorsCtx, x * tileSize, y * tileSize, cursorColors[cursor.color], cursor.revive_at || null);
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

  const drawOtherUserPointer = (borderPixel: number) => {
    const otherPointerCtx = canvasRefs.otherPointerRef.current?.getContext('2d');
    if (!otherPointerCtx) return;
    otherPointerCtx.clearRect(0, 0, windowWidth, windowHeight);
    cursors.forEach(cursor => {
      const [x, y] = [cursor.x - cursorOriginX + tilePaddingWidth, cursor.y - cursorOriginY + tilePaddingHeight];
      drawPointer(otherPointerCtx, x * tileSize, y * tileSize, otherCursorColors[cursor.color], borderPixel);
    });
  };

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
      const directions = [
        [-1, 0], // left
        [0, -1], // up
        [0, 1], // down
        [1, 0], // right
        [-1, -1], // left-up
        [-1, 1], // left-down
        [1, -1], // right-up
        [1, 1], // right-down
      ]; // 8-directional neighbors
      for (const [dx, dy] of directions) {
        const [x, y] = [node.x + dx, node.y + dy];
        // Make sure the neighbor is within bounds and not an obstacle
        if (y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== null) {
          neighbors.push({ node: grid[y][x], isDiagonal: dx !== 0 && dy !== 0 });
        }
      }
      return neighbors;
    }

    /** initialize tiles */
    const [start, target] = [new TileNode(startX, startY), new TileNode(targetX, targetY)];
    const grid = [...tiles.map(row => [...row.map(() => null)])] as (TileNode | null)[][];
    tiles.forEach((row, i) => {
      row.forEach((tile, j) => {
        if (checkTileHasOpened(tile)) grid[i][j] = new TileNode(j, i);
      });
    });

    /** initialize open and close list */
    let openList = [start];
    const closedList = [];
    start.g = 0;
    start.f = start.g + start.h;

    while (openList.length > 0) {
      const current = openList.reduce((a, b) => (a.f < b.f ? a : b));
      if (current.x === target.x && current.y === target.y) {
        const path = [];
        let temp = current;
        /** calculate distance from target */
        setLeftPaths({
          x: temp.x - startX,
          y: temp.y - startY,
        });
        while (temp) {
          path.unshift(temp);
          temp = temp.parent as TileNode;
        }
        return path;
      }
      openList = openList.filter(node => node !== current);
      closedList.push(current);

      /** Find neighbor nodes from current node. */
      const neighbors = getNeighbors(grid, current);
      for (const { node: neighbor, isDiagonal } of neighbors) {
        if (closedList.includes(neighbor)) continue;
        // Apply different cost for diagonal movement
        const tempG = current.g + (isDiagonal ? 1.5 : 1);
        if (tempG >= neighbor.g) continue;
        if (!openList.includes(neighbor)) openList.push(neighbor);
        neighbor.parent = current;
        neighbor.g = tempG;
        neighbor.h = Math.abs(neighbor.x - target.x) + Math.abs(neighbor.y - target.y);
        neighbor.f = neighbor.g + neighbor.h;
      }
    }
    return [];
  };

  /** start render */
  const renderTiles = () => {
    const tileCanvas = canvasRefs.tileCanvasRef.current;
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!tileCanvas || !interactionCanvas || tileSize === 0) return;

    const tileCtx = tileCanvas.getContext('2d');
    const interactionCtx = interactionCanvas.getContext('2d');
    if (!tileCtx || !interactionCtx) return;

    // initialize interaction canvas
    interactionCtx.clearRect(0, 0, windowWidth, windowHeight);
    const borderPixel = 5 * zoom;
    const cursorCanvasX = (relativeX / paddingTiles) * tileSize;
    const cursorCanvasY = (relativeY / paddingTiles) * tileSize;
    const clickCanvasX = cursorCanvasX + (clickX - cursorOriginX) * tileSize;
    const clickCanvasY = cursorCanvasY + (clickY - cursorOriginY) * tileSize;
    const tileEdgeVector = new Path2D(`
      M0 0
      L${tileSize} 0
      L${tileSize} ${tileSize}
      L0 ${tileSize}
      L0 0
      `);
    const tileVector = new Path2D(`
      M${borderPixel} ${borderPixel}
      L${tileSize - borderPixel} ${borderPixel}
      L${tileSize - borderPixel} ${tileSize - borderPixel}
      L${borderPixel} ${tileSize - borderPixel}
      L${borderPixel} ${borderPixel}
      `);

    // setting cursor color
    const cursorColor = cursorColors[color];
    const compenX = cursorX - cursorOriginX - tilePaddingWidth - leftPaths.x;
    const compenY = cursorY - cursorOriginY - tilePaddingHeight - leftPaths.y;

    const innerGradientValues: [number, number, number, number] = [borderPixel, borderPixel, tileSize - borderPixel * 2, tileSize - borderPixel * 2];
    const outerGradientValues: [number, number, number, number] = [0, 0, tileSize, tileSize];

    const gradientObject = {
      inner: [
        tileCtx.createLinearGradient(...innerGradientValues),
        tileCtx.createLinearGradient(...innerGradientValues),
        tileCtx.createLinearGradient(...innerGradientValues),
      ],
      outer: [
        tileCtx.createLinearGradient(...outerGradientValues),
        tileCtx.createLinearGradient(...outerGradientValues),
        tileCtx.createLinearGradient(...outerGradientValues),
      ],
      flag: tileCtx.createLinearGradient(36.5, 212.5, 36.5, 259),
    };
    gradientObject.flag.addColorStop(0, '#E8E8E8');
    gradientObject.flag.addColorStop(1, 'transparent');

    gradientObject.inner.forEach((gradient, index) => {
      gradient.addColorStop(0, tileColors.inner[index][0]);
      gradient.addColorStop(1, tileColors.inner[index][1]);
    });

    gradientObject.outer.forEach((gradient, index) => {
      gradient.addColorStop(0, tileColors.outer[index][0]);
      gradient.addColorStop(0.4, tileColors.outer[index][0]);
      gradient.addColorStop(0.6, tileColors.outer[index][1]);
      gradient.addColorStop(1, tileColors.outer[index][1]);
    });
    // draw tiles
    tiles?.forEach((row, rowIndex) => {
      row?.forEach((content, colIndex) => {
        if (renderedTiles[rowIndex]?.[colIndex] === content) return;
        const [x, y] = [(colIndex - tilePaddingWidth) * tileSize, (rowIndex - tilePaddingHeight) * tileSize];
        if (x < -tileSize || y < -tileSize || x > windowWidth + tileSize || y > windowHeight + tileSize) return;

        tileCtx.save();
        tileCtx.translate(x, y);
        switch (content) {
          /** Locked tiles */
          case 'C0':
          case 'C1':
          case 'F00': /** red */
          case 'F01':
          case 'FRED0':
          case 'FRED1':
          case 'F10': /** yellow */
          case 'F11':
          case 'FYELLOW0':
          case 'FYELLOW1':
          case 'F20': /** blue */
          case 'F21':
          case 'FBLUE0':
          case 'FBLUE1':
          case 'F30': /** purple */
          case 'F31':
          case 'FPURPLE0':
          case 'FPURPLE1': {
            const isEven = content.slice(-1) === '0' ? 0 : 1;
            tileCtx.fillStyle = gradientObject.outer[isEven];
            // draw outline only for special clickable tile
            if (
              Math.abs(rowIndex - relativeY) <= 1 &&
              Math.abs(colIndex - relativeX) <= 1 &&
              !(colIndex === relativeX && rowIndex === relativeY) &&
              content.includes('C')
            ) {
              drawCursor(interactionCtx, x, y, '#0000002f', null, 0.5);
              tileCtx.fillStyle = 'white';
            }
            tileCtx.fill(tileEdgeVector);
            // draw inner tile
            tileCtx.fillStyle = gradientObject.inner[isEven];
            tileCtx.fill(tileVector);
            if (!content.includes('F')) break;
            // draw flag when flag is on the tile
            tileCtx.restore();
            tileCtx.save();
            tileCtx.translate(x + tileSize / 6, y + tileSize / 6);
            tileCtx.scale(zoom / 4.5, zoom / 4.5);

            /** flag color follows cursor color. */
            tileCtx.fillStyle = cursorColors[content.slice(1, -1).toLowerCase() as keyof typeof cursorColors];
            tileCtx.fill(cachedVectorImages?.flag.flag as Path2D);

            // draw pole
            tileCtx.fillStyle = gradientObject.flag;
            tileCtx.fill(cachedVectorImages?.flag.pole as Path2D);
            break;
          }
          /** Tile has been opend. */
          case 'O':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case 'B': {
            tileCtx.fillStyle = gradientObject.outer[2]; // draw outline of tile
            tileCtx.fill(tileEdgeVector);
            tileCtx.fillStyle = gradientObject.inner[2]; // draw inner tile
            tileCtx.fill(tileVector);

            /** describe ash */
            if (content === 'B') {
              tileCtx.scale(zoom / 4, zoom / 4);
              tileCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              tileCtx.fill(cachedVectorImages?.boom.inner as Path2D); // draw inner path
              tileCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              tileCtx.fill(cachedVectorImages?.boom.outer as Path2D); // draw outer path
            }
            tileCtx.restore();

            /** describe number of neighbor bombs. */
            if (parseInt(content) > 0) {
              const index = parseInt(content) - 1;
              tileCtx.fillStyle = countColors[index];
              tileCtx.font = 50 * zoom + 'px LOTTERIACHAB';
              tileCtx.textAlign = 'center';
              tileCtx.textBaseline = 'middle';
              tileCtx.fillText(content, x + tileSize / 2, y + tileSize / 2);
            }
            break;
          }
          default:
            break;
        }
        tileCtx.restore();
      });
      /** Display the path in the middle to prevent it from appearing displaced */
      if (rowIndex === Math.floor((tiles.length * 3) / 10)) {
        // Draw my cursor
        drawCursor(interactionCtx, cursorCanvasX, cursorCanvasY, cursorColor, null);
        // Describe my clicked tile border
        drawPointer(interactionCtx, clickCanvasX, clickCanvasY, cursorColor, borderPixel);
        // Draw other users' cursor
        drawOtherUserCursors();
        // Draw other users' clicked tile border
        drawOtherUserPointer(borderPixel);
        // Draw path
        if (paths.length > 0) {
          const [x, y] = [paths[0].x + compenX + 0.5, paths[0].y + compenY + 0.5];
          interactionCtx.beginPath();
          interactionCtx.strokeStyle = 'black';
          interactionCtx.lineWidth = tileSize / 6;
          interactionCtx.moveTo(x * tileSize, y * tileSize); // start point
          paths.forEach(vector => {
            const [vectorX, vectorY] = [vector.x + compenX + 0.5, vector.y + compenY + 0.5];
            interactionCtx.lineTo(vectorX * tileSize, vectorY * tileSize);
          });
          interactionCtx.stroke();
        }
        setRenderedTiles(tiles);
      }
    });
  };

  /** Load and Render */
  useEffect(() => {
    if (!loading) {
      renderTiles();
      return;
    }
    const lotteriaChabFont = new FontFace(
      'LOTTERIACHAB',
      "url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIACHAB.woff2') format('woff2')",
    );
    Promise.all([lotteriaChabFont.load()]).then(() => {
      // Set vector images
      setCachedVectorImages({
        cursor: new Path2D(cursorPaths),
        stun: [new Path2D(stunPaths[0]), new Path2D(stunPaths[1]), new Path2D(stunPaths[2])],
        flag: {
          flag: new Path2D(flagPaths[0]),
          pole: new Path2D(flagPaths[1]),
        },
        boom: {
          inner: new Path2D(boomPaths[0]),
          outer: new Path2D(boomPaths[1]),
        },
      });
      setLoading(false);
      document.fonts.add(lotteriaChabFont);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, loading, tileSize, cursorOriginX, cursorOriginY, startPoint, clickX, clickY, color, zoom]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const borderPixel = 5 * zoom;
    drawOtherUserCursors();
    drawOtherUserPointer(borderPixel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors]);

  return (
    <>
      {loading ? (
        <div className={S.loading}>
          <h1>Loading...</h1>
          <div className={`${tiles.length < 1 ? S.loadingBar : S.loadComplete}`} />
        </div>
      ) : (
        <div className={`${S.canvasContainer} ${leftReviveTime > 0 ? S.vibration : ''}`}>
          <ChatComponent color={color} isClient={true} x={cursorOriginX} y={cursorOriginY} />
          <canvas className={S.canvas} id="TileCanvas" ref={canvasRefs.tileCanvasRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="OtherCursors" ref={canvasRefs.otherCursorsRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="OtherPointer" ref={canvasRefs.otherPointerRef} width={windowWidth} height={windowHeight} />
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
