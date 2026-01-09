'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore } from '@/store/interactionStore';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoardComponent from '@/components/scoreboard';
import {
  CursorIdType,
  GetChatPayloadType,
  GetCursorStatePayloadType,
  GetMessageType,
  GetMessageEvent,
  SendMessageEvent,
  SendSetWindowPayloadType,
  XYType,
  GetTilesStatePayloadType,
  GetScoreboardPayloadType,
  SendCreateCursorPayloadType,
  GetExplosionPayloadType,
  Direction,
} from '@/types';
// WebGPU imports removed - using simple CPU processing only
import { VECTORIZED_TILE_LUT } from '@/utils/tiles';
import { useRankStore } from '@/store/rankingStore';
import useMessageProcess from '@/hooks/useMessageProcess';
import { OtherCursorState, useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import { useTileStore, useTiles } from '@/store/tileStore';

// hex -> byte conversion is inlined in the hot loop to avoid call overhead
const FILL_CHAR = '??';

export default function Play() {
  /** constants */
  const RENDER_RANGE = 1.5;
  const ORIGIN_TILE_SIZE = 80;
  const MAX_TILE_COUNT = 530;
  const WS_URL = `${process.env.NEXT_PUBLIC_WS_HOST}/session`;

  /** stores */
  const {} = useClickStore();
  const { setCursors, cursors: nowCursors } = useOtherUserCursorsStore();
  const { isOpen, sendMessage, connect, disconnect } = useWebSocketStore();
  // for states
  const { position: cursorPosition, zoom, originPosition: cursorOriginPosition } = useCursorStore();
  // for actions
  const { setPosition: setCursorPosition, setOringinPosition, setId, id: clientCursorId, setScore } = useCursorStore();
  // for movings
  const { zoomUp, zoomDown, setZoom } = useCursorStore();
  const { setRanking } = useRankStore();
  // tile store - use selectors for better performance
  const cachingTiles = useTiles();
  const {
    startPoint,
    endPoint,
    renderStartPoint,
    setTiles,
    setRenderTiles,
    setStartPoint,
    setEndPoint,
    setRenderStartPoint,
    setTileSize,
    padtiles,
    applyTileChanges,
    reset: resetTiles,
  } = useTileStore();

  /** hooks */
  const { windowWidth, windowHeight } = useScreenSize();

  /** states */
  const [leftReviveTime, setLeftReviveTime] = useState<number>(-1); // secs
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const reviveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectedRef = useRef<boolean>(false);

  const zoomHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['-', '='].includes(key)) e.preventDefault();
    switch (key) {
      case '-':
        zoomDown();
        break;
      case '=':
        zoomUp();
        break;
      // case 'w':
      //   e.preventDefault();
      //   moveUp();
      //   break;
      // case 's':
      //   e.preventDefault();
      //   moveDown();
      //   break;
      // case 'a':
      //   e.preventDefault();
      //   moveLeft();
      //   break;
      // case 'd':
      //   e.preventDefault();
      //   moveRight();
      //   break;
    }
  };

  /** Initialize Browser Events and Disconnect websocket when this Component is unmounted */
  useLayoutEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    setIsInitialized(false);
    setZoom(1);
    document.addEventListener('keydown', zoomHandler);
    return () => {
      document.documentElement.style.overflow = 'auto';
      document.removeEventListener('keydown', zoomHandler);

      // clear all timers
      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }

      // force disconnect
      disconnect();

      // reset states
      resetTiles();
      setIsInitialized(false);
      setLeftReviveTime(-1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Initialize
   * Re-connect websocket when websocket is closed state.
   * */
  useLayoutEffect(() => {
    if (isOpen || startPoint.x === endPoint.x || endPoint.y === startPoint.y) return;
    setLeftReviveTime(-1);
    // const [view_width, view_height] = [endPoint.x - startPoint.x + 1, endPoint.y - startPoint.y + 1];
    if (!connectedRef.current) {
      connect(WS_URL);
      connectedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint]);

  // applyTileChanges is now from zustand store

  /** Create worker promises for tile processing */
  const createWorkerPromises = (
    workerCount: number,
    tilesPerWorker: number,
    totalTiles: number,
    end_x: number,
    end_y: number,
    start_x: number,
    start_y: number,
    unsortedTiles: string,
    type: 'All' | 'PART',
  ) => {
    const lenObject = { length: workerCount };
    const currentStartPoint = startPoint;

    return Array.from(lenObject, (_, workerIndex) => {
      const workerStart = workerIndex * tilesPerWorker;
      const workerEnd = Math.min(workerStart + tilesPerWorker, totalTiles);
      return processTileData(end_x, end_y, start_x, start_y, unsortedTiles, type, currentStartPoint, workerStart, workerEnd);
    });
  };

  /** Common tile processing logic */
  const processTileData = (
    end_x: number,
    end_y: number,
    start_x: number,
    start_y: number,
    unsortedTiles: string,
    type: 'All' | 'PART',
    currentStartPoint: XYType,
    startIndex: number = 0,
    endIndex: number = -1,
  ) => {
    const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1;
    const tilesPerRow = rowlengthBytes >> 1;
    const columnlength = Math.abs(start_y - end_y + 1);

    // This is temporary fix for the issue of the tiles not being updated correctly when the window is zoomed in or out.
    const isAll = type === 'All';
    const yOffset = end_y - currentStartPoint.y;
    const xOffset = isAll ? 0 : start_x - currentStartPoint.x - 1;

    const actualEndIndex = endIndex === -1 ? columnlength * tilesPerRow : endIndex;
    const changes: Array<{ row: number; col: number; value: string }> = [];

    // Get current tiles from store
    const tiles = useTileStore.getState().tiles;

    for (let tileIndex = startIndex; tileIndex < actualEndIndex; tileIndex++) {
      // Calculate row and column indices
      const rowIndex = Math.floor(tileIndex / tilesPerRow);
      const colIndex = tileIndex % tilesPerRow;

      const reversedI = columnlength - 1 - rowIndex;
      const row = reversedI + yOffset;

      if (row < 0 || row >= tiles.length) continue;

      const existingRow = tiles[row] || [];
      const rowLen = existingRow.length;
      if (rowLen === 0) continue;

      const yAbs = end_y - reversedI;

      const tStart = Math.max(0, -xOffset);
      const tEnd = Math.min(tilesPerRow, rowLen - xOffset);
      if (colIndex < tStart || colIndex >= tEnd) continue;

      const byteOffset = rowIndex * rowlengthBytes + (colIndex << 1);
      const firstByte = unsortedTiles.charCodeAt(byteOffset);
      const secondByte = unsortedTiles.charCodeAt(byteOffset + 1);

      // 16bit combination vectorized LUT LookUp (O(1) operation)
      const lookupIndex = (firstByte << 8) | secondByte;
      const tileType = VECTORIZED_TILE_LUT[lookupIndex];

      if (tileType === 255) continue; // Check invalid hex

      const col = colIndex + xOffset;
      // Use absolute coordinates for checker calculation to match computedRenderTiles
      const checker = (col + yAbs + currentStartPoint.x) & 1;

      // Vectorized string conversion (O(1) LookUp)
      let value: string = FILL_CHAR; // default value for Exception handling
      if (tileType < 8) value = tileType === 0 ? 'O' : tileType.toString();
      // Bomb
      else if (tileType === 8) value = 'B';
      // CLosed
      else if (tileType === 24) value = `C${checker}`;
      // Flag tiles
      else if (tileType >= 16 && tileType < 24) {
        const flagColor = Math.floor((tileType - 16) / 2);
        value = `F${flagColor}${checker}`;
      }

      if (existingRow[col] !== value) changes.push({ row, col, value });
    }

    return changes;
  };

  /** Apply incoming hex tile data to the internal tile grid */
  const replaceTiles = async (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;
    console.log('replaceTiles', type, performance.now());

    // For full window updates, pre-shift the grid with dummy tiles
    if (type === 'All') padtiles(start_x, start_y, end_x, end_y, Direction.ALL);
    // Basic grid stats based on server-provided world coordinates
    const tilesPerRow = Math.abs(end_x - start_x + 1);
    const columnlength = Math.abs(start_y - end_y + 1);
    const totalTiles = columnlength * tilesPerRow;
    const cpuCores = navigator.hardwareConcurrency || 4;

    // Number of workers: at most one per CPU core, roughly one worker per 32 tiles
    const workerCount = Math.min(cpuCores, Math.ceil(totalTiles / 32));
    const tilesPerWorker = Math.ceil(totalTiles / workerCount);

    // Internal processing uses an inner window trimmed by 1 tile on each X side
    const innerStartX = start_x + 1;
    const innerEndX = end_x - 1;

    // Check if SharedArrayBuffer is supported (high-performance mode)
    const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined';

    let allChanges: Array<{ row: number; col: number; value: string }> = [];

    if (supportsSharedArrayBuffer) {
      // Parallel processing using SharedArrayBuffer + Atomics
      const sharedBuffer = new SharedArrayBuffer(totalTiles * 4); // 4 bytes per tile (row, col, value)
      const sharedArray = new Int32Array(sharedBuffer);
      const changeCountBuffer = new SharedArrayBuffer(4);
      const changeCountArray = new Int32Array(changeCountBuffer);

      // Initialize the counter safely using Atomics
      Atomics.store(changeCountArray, 0, 0);

      // Process tiles in parallel and accumulate into shared array
      const workerPromises = createWorkerPromises(
        workerCount,
        tilesPerWorker,
        totalTiles,
        innerEndX,
        end_y,
        innerStartX,
        start_y,
        unsortedTiles,
        type,
      );
      const workerResults = await Promise.all(workerPromises);

      workerResults.forEach(changes => {
        changes.forEach(({ row, col, value }) => {
          const changeIndex = Atomics.add(changeCountArray, 0, 1);
          if (changeIndex >= totalTiles) return;
          const sharedArrayIndex = changeIndex * 3;
          sharedArray[sharedArrayIndex] = row;
          sharedArray[sharedArrayIndex + 1] = col;
          sharedArray[sharedArrayIndex + 2] = value.charCodeAt(0); // Simple string encoding
        });
      });

      // Read back accumulated changes from the shared array
      const finalChangeCount = Atomics.load(changeCountArray, 0);
      for (let i = 0; i < finalChangeCount; i++) {
        const row = sharedArray[i * 3];
        const col = sharedArray[i * 3 + 1];
        const value = String.fromCharCode(sharedArray[i * 3 + 2]);
        allChanges.push({ row, col, value });
      }
    } else {
      // Fallback: standard Promise.all parallelism without SharedArrayBuffer
      try {
        const workerPromises = createWorkerPromises(
          workerCount,
          tilesPerWorker,
          totalTiles,
          innerEndX,
          end_y,
          innerStartX,
          start_y,
          unsortedTiles,
          type,
        );
        const workerResults = await Promise.all(workerPromises);
        allChanges = workerResults.flat();
      } catch (error) {
        // Final fallback: synchronous processing on main thread
        console.error('Ultra-Parallel Worker tile processing error:', error);
        allChanges = processTileData(innerEndX, end_y, innerStartX, start_y, unsortedTiles, type, startPoint);
      }
    }

    // Apply all changes to tiles
    applyTileChanges(allChanges);
    const updatedTiles = useTileStore.getState().tiles;
    console.log(updatedTiles.map(row => row.map(cell => cell[0]).join('')).join('\n'));
    console.log('replace', performance.now());
    // applyTileChanges already updates tiles, so we just need to trigger a re-render
    setTiles([...updatedTiles.map(row => [...row])]);
  };

  /** Message handler for tile processing */
  const handleWebSocketMessage = async (wsMessage: string) => {
    const { MY_CURSOR, CHAT, CURSORS_STATE, EXPLOSION, QUIT_CURSOR, SCOREBOARD_STATE, TILES_STATE } = GetMessageEvent;
    try {
      const { header, payload } = JSON.parse(wsMessage) as GetMessageType;
      const { event } = header;
      switch (event) {
        /** When receiving requested tiles */
        case TILES_STATE: {
          const { tiles_li } = payload as GetTilesStatePayloadType;
          // use replaceTiles
          const promises = [];
          for (const tiles of tiles_li) {
            const { data, range } = tiles;
            const { top_left, bottom_right } = range;
            const { width, height } = getCurrentTileWidthAndHeight();
            const [totalWidth, totalHeight] = [bottom_right.x - top_left.x + 1, top_left.y - bottom_right.y + 1];
            const [resWidth, resHeight] = [(totalWidth / 2) >>> 0, (totalHeight / 2) >>> 0];

            let isAll: 'PART' | 'All' = 'PART';
            if (resWidth === width && resHeight === height) isAll = 'All';
            promises.push(replaceTiles(top_left.x, bottom_right.y, bottom_right.x, top_left.y, data, isAll));
          }
          Promise.all(promises);
          break;
        }
        case EXPLOSION: {
          // The Explosion range is 1 tile including diagonal.
          const { position } = payload as GetExplosionPayloadType; // It should be changed tile content to 'B'
          const { x, y } = position;
          const { x: cursorX, y: cursorY } = cursorPosition;
          if (cursorX >= x - 1 && cursorX <= x + 1 && cursorY >= y - 1 && cursorY <= y + 1) {
            // set revive time
            setLeftReviveTime(10);
          }
          break;
        }
        case SCOREBOARD_STATE: {
          const { scoreboard } = payload as GetScoreboardPayloadType;
          setRanking(Object.entries(scoreboard).map(([ranking, score]) => ({ ranking: +ranking, score })));
          const windowSize: SendCreateCursorPayloadType = getCurrentTileWidthAndHeight();
          if (!clientCursorId) sendMessage(SendMessageEvent.CREATE_CURSOR, windowSize);
          break;
        }
        case CURSORS_STATE: {
          const { cursors } = payload as GetCursorStatePayloadType;
          const newCursors: OtherCursorState[] = cursors.map(cursor => ({
            color: 'red',
            id: cursor.id,
            position: cursor.position,
            message: '',
            messageTime: 0,
            pointer: { x: Infinity, y: Infinity },
            score: cursor.score,
            revive_at: new Date(cursor.active_at).getTime(),
          }));
          // find client cursor
          const getCursors = newCursors.filter(cursor => cursor.id !== clientCursorId);
          // 변화가 일어날 때만 오는 데, 이미 있는 커서는 위치만 변하고, 새로 온 커서는 새로 추가됩니다.
          const addCursors = getCursors.filter(cursor => !nowCursors.some(c => c.id === cursor.id));
          const updatedCursors = nowCursors.map(cursor => {
            const getCursor = getCursors.find(c => c.id === cursor.id);
            return getCursor ? getCursor : cursor;
          });
          setCursors([...addCursors, ...updatedCursors]);
          const myCursor = newCursors.find(cursor => cursor.id === clientCursorId)!;
          if (myCursor) {
            const { position } = myCursor;
            setScore(myCursor.score);
            if (!(position.x === cursorPosition.x && position.y === cursorPosition.y)) {
              setCursorPosition(position);
              setOringinPosition(position);
            }
          }
          break;
        }
        /** Fetches own information only once when connected. */
        case MY_CURSOR: {
          const { id } = payload as CursorIdType;
          setId(id);
          setTimeout(() => setIsInitialized(true), 0);
          break;
        }
        case QUIT_CURSOR: {
          const { id } = payload as CursorIdType;
          setCursors(nowCursors.filter(cursor => cursor.id !== id));
          break;
        }
        case CHAT: {
          const { id, message } = payload as GetChatPayloadType;
          const newCursors = nowCursors.map(cursor => {
            if (cursor.id !== id) return cursor;
            return { ...cursor, message, messageTime: Date.now() + 1000 * 8 };
          });
          setCursors(newCursors);
          break;
        }
        default: {
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };
  useMessageProcess(handleWebSocketMessage);

  /** STABLE & FAST: Reliable tile computation without GPU bugs */
  const computedRenderTiles = useMemo(() => {
    const cachingLength = cachingTiles.length;
    if (cachingLength === 0) return [];

    const offsetX = cursorOriginPosition.x - cursorPosition.x;
    const offsetY = cursorOriginPosition.y - cursorPosition.y;
    // INSTANT: Perfect alignment - no processing needed
    if (offsetX === 0 && offsetY === 0) return cachingTiles; // O(1) return!

    // STABLE CPU processing - no disappearing tiles
    return processWithStableCPU();

    function processWithStableCPU(): string[][] {
      // Ultra-stable rendering - guaranteed no missing tiles
      return cachingTiles.map((cachingRow, row) => {
        const sourceRowIndex = row + offsetY;

        // Bounds check for source row
        if (sourceRowIndex < 0 || sourceRowIndex >= cachingLength) return new Array(cachingRow.length).fill(FILL_CHAR);

        const sourceRow = cachingTiles[sourceRowIndex];
        if (!sourceRow) return new Array(cachingRow.length).fill(FILL_CHAR);

        // Process each column safely
        return cachingRow.map((_, col) => {
          const sourceColIndex = col + offsetX;

          // Bounds check for source column
          if (sourceColIndex < 0 || sourceColIndex >= sourceRow.length) return FILL_CHAR;

          const sourceTile = sourceRow[sourceColIndex];
          if (!sourceTile || sourceTile === FILL_CHAR) return FILL_CHAR;

          const tileType = sourceTile[0];

          // Fast path for most tiles - no transformation needed
          if (!['C', 'F'].includes(tileType)) return sourceTile;

          // Use absolute coordinates for checkerboard calculation (matches processTileData)
          const absX = renderStartPoint.x + col;
          const absY = renderStartPoint.y + row;
          const checkerBit = (absX + absY) & 1;

          // Safe tile type handling
          if (tileType === 'C') return `C${checkerBit}`;
          if (tileType === 'F') {
            const flagColor = sourceTile[1] || '0';
            return `F${flagColor}${checkerBit}`;
          }

          // Fallback for unexpected tile types
          return sourceTile;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingTiles, cursorOriginPosition, renderStartPoint]);

  const getCurrentTileWidthAndHeight = () => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    // Use the exact same calculation as tilePaddingWidth / tilePaddingHeight
    const width = ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0;
    const height = ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0;
    return { width, height };
  };

  /** Apply computed tiles */
  useLayoutEffect(() => {
    setRenderTiles(computedRenderTiles);
  }, [computedRenderTiles, setRenderTiles]);

  /** Reset screen range when cursor position or screen size changes */
  useLayoutEffect(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const [tilePaddingWidth, tilePaddingHeight] = [
      ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0,
      ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0,
    ];

    if (tilePaddingHeight < 1 || tilePaddingWidth < 1) return;
    setStartPoint({
      x: cursorPosition.x - tilePaddingWidth,
      y: cursorPosition.y - tilePaddingHeight,
    });
    setEndPoint({
      x: cursorPosition.x + tilePaddingWidth,
      y: cursorPosition.y + tilePaddingHeight,
    });

    setRenderStartPoint({
      x: cursorOriginPosition.x - tilePaddingWidth,
      y: cursorOriginPosition.y - tilePaddingHeight,
    });
    setTileSize(newTileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, cursorOriginPosition, cursorPosition, isInitialized]);

  /** Handling zoom event, same as the initial request */
  useLayoutEffect(() => {
    if (!isInitialized) return;
    const payload: SendSetWindowPayloadType = getCurrentTileWidthAndHeight();
    sendMessage(SendMessageEvent.SET_WINDOW, payload);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, isInitialized]);

  useEffect(() => {
    if (leftReviveTime > 0) {
      reviveTimerRef.current = setTimeout(() => setLeftReviveTime(e => (e > 0 ? e - 1 : e)), 1000);
    }
    return () => {
      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftReviveTime]);

  return (
    <div className={S.page}>
      {leftReviveTime > 0 && <Inactive time={leftReviveTime} />}
      <TutorialStep />
      <ScoreBoardComponent />
      <CanvasDashboard renderRange={RENDER_RANGE} maxTileCount={MAX_TILE_COUNT} />
      <CanvasRenderComponent
        leftReviveTime={leftReviveTime}
        paddingTiles={RENDER_RANGE}
        cursorOriginX={cursorOriginPosition.x}
        cursorOriginY={cursorOriginPosition.y}
      />
    </div>
  );
}
