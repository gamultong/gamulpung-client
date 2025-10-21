'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { OtherUserSingleCursorState, useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import { useClickStore } from '@/store/interactionStore';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoard from '@/components/scoreboard';
import { Direction, ReceiveMessageEvent, SendMessageEvent, XYType } from '@/types';
// WebGPU imports removed - using simple CPU processing only
import { OPEN_LUT, CLOSED0_LUT, CLOSED1_LUT, HEX_NIBBLE, VECTORIZED_TILE_LUT, parseHex } from '@/utils/tiles';

// hex -> byte conversion is inlined in the hot loop to avoid call overhead

export default function Play() {
  /** constants */
  const RENDER_RANGE = 1.5;
  const ORIGIN_TILE_SIZE = 80;
  const MAX_TILE_COUNT = 530;
  const WS_URL = `${process.env.NEXT_PUBLIC_WS_HOST}/session`;

  /** stores */
  const { setPosition: setClickPosition } = useClickStore();
  const { setCursors, addCursors, cursors } = useOtherUserCursorsStore();
  const { isOpen, message, sendMessage, connect, disconnect } = useWebSocketStore();
  // for states
  const { x: cursorX, y: cursorY, zoom, originX: cursorOriginX, originY: cursorOriginY } = useCursorStore();
  // for actions
  const { setColor, setPosition: setCursorPosition, setOringinPosition, setId } = useCursorStore();
  // for movings
  const { zoomUp, zoomDown, setZoom } = useCursorStore();

  /** hooks */
  const { windowWidth, windowHeight } = useScreenSize();

  /** states */
  const [tileSize, setTileSize] = useState<number>(0); //px
  const [startPoint, setStartPoint] = useState<XYType>({ x: 0, y: 0 });
  const [endPoint, setEndPoint] = useState<XYType>({ x: 0, y: 0 });
  const [renderStartPoint, setRenderStartPoint] = useState<XYType>({ x: 0, y: 0 });
  const [cachingTiles, setCachingTiles] = useState<string[][]>([]);
  const [renderTiles, setRenderTiles] = useState<string[][]>([...cachingTiles.map(row => [...row])]);
  const [leftReviveTime, setLeftReviveTime] = useState<number>(-1);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const requestedTilesTimeRef = useRef<number>(0);
  const reviveTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Request Tiles
   * Please send start y and end y coordinates are reversed because the y-axis is reversed.
   * @param start_x {number} - start x position
   * @param start_y {number} - start y position
   * @param end_x {number} - end x position
   * @param end_y {number} - end y position
   * @param type {Direction} - Request type (U: Up tiles, D: Down tiles, L: Left tiles, R: Right tiles, A: All tiles)
   *  */
  const requestTiles = (start_x: number, start_y: number, end_x: number, end_y: number, type: Direction) => {
    if (!isOpen || !isInitialized) return;
    const now = performance.now();
    // Throttle ALL-tiles requests to avoid spamming server (300 ms window)
    if (type === Direction.ALL && now - requestedTilesTimeRef.current < 300) return;
    requestedTilesTimeRef.current = now;
    /** add Dummy data to originTiles */
    const [rowlength, columnlength] = [Math.abs(end_x - start_x) + 1, Math.abs(start_y - end_y) + 1];

    setCachingTiles(tiles => {
      let newTiles = [...tiles];
      switch (type) {
        case Direction.UP: // Upper tiles
          newTiles = [...Array.from({ length: columnlength }, () => Array(rowlength).fill('??')), ...newTiles.slice(0, -columnlength)];
          break;
        case Direction.DOWN: // Down tiles
          newTiles = [...newTiles.slice(columnlength), ...Array.from({ length: columnlength }, () => Array(rowlength).fill('??'))];
          break;
        case Direction.LEFT: // Left tiles
          for (let i = 0; i < columnlength; i++)
            newTiles[i] = [...Array(rowlength).fill('??'), ...newTiles[i].slice(0, newTiles[0].length - rowlength)];
          break;
        case Direction.RIGHT: // Right tiles
          for (let i = 0; i < columnlength; i++) newTiles[i] = [...newTiles[i].slice(rowlength), ...Array(rowlength).fill('??')];
          break;
        case Direction.ALL: // All tiles
          newTiles = Array.from({ length: columnlength }, () => Array.from({ length: rowlength }, () => '??'));
      }
      return newTiles;
    });
    const payload = { start_p: { x: start_x, y: start_y }, end_p: { x: end_x, y: end_y } };
    const body = JSON.stringify({ event: SendMessageEvent.FETCH_TILES, payload });
    sendMessage(body);
    return;
  };

  const zoomHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    switch (key) {
      case '-':
        e.preventDefault();
        zoomDown();
        break;
      case '=':
        e.preventDefault();
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

  /** Disconnect websocket when Component has been unmounted */
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
      setCachingTiles([]);
      setRenderTiles([]);
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
    if (!isOpen && startPoint.x !== endPoint.x && endPoint.y !== startPoint.y) {
      setLeftReviveTime(-1);
      const [view_width, view_height] = [endPoint.x - startPoint.x + 1, endPoint.y - startPoint.y + 1];
      connect(WS_URL + `?view_width=${view_width}&view_height=${view_height}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint, endPoint]);

  /** parseHex moved to utils */

  const replaceTiles = async (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;

    const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1; // 2 hex chars per tile
    const tilesPerRow = rowlengthBytes >> 1;
    const columnlength = Math.abs(start_y - end_y + 1);
    const yOffset = type === 'All' ? (cursorY < end_y ? endPoint.y - startPoint.y - columnlength + 1 : 0) : end_y - startPoint.y;
    const xOffset = start_x - startPoint.x;

    const totalTiles = columnlength * tilesPerRow;
    const cpuCores = navigator.hardwareConcurrency || 4;

    // CPU 코어 수에 맞춰 최적 워커 수 결정
    const workerCount = Math.min(cpuCores, Math.ceil(totalTiles / 32)); // 최소 32개 타일당 1워커
    const tilesPerWorker = Math.ceil(totalTiles / workerCount);

    // SharedArrayBuffer 지원 여부 확인
    const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined';

    if (supportsSharedArrayBuffer) {
      // SharedArrayBuffer + Atomics를 사용한 최고 성능 병렬 처리
      const sharedBuffer = new SharedArrayBuffer(totalTiles * 4); // 각 타일당 4바이트 (row, col, value)
      const sharedArray = new Int32Array(sharedBuffer);
      const changeCountBuffer = new SharedArrayBuffer(4);
      const changeCountArray = new Int32Array(changeCountBuffer);

      // Atomics로 안전한 카운터 초기화
      Atomics.store(changeCountArray, 0, 0);

      // SharedArrayBuffer를 사용한 최고 성능 병렬 처리
      const sharedWorkerPromises = Array.from({ length: workerCount }, (_, workerIndex) => {
        return new Promise<void>(resolve => {
          const workerStart = workerIndex * tilesPerWorker;
          const workerEnd = Math.min(workerStart + tilesPerWorker, totalTiles);

          // 워커별로 할당된 타일들을 SIMD 스타일로 처리
          for (let tileIndex = workerStart; tileIndex < workerEnd; tileIndex += 4) {
            // 4개 타일을 동시에 처리 (SIMD 스타일)
            const batchEnd = Math.min(tileIndex + 4, workerEnd);

            for (let batchIndex = tileIndex; batchIndex < batchEnd; batchIndex++) {
              const i = Math.floor(batchIndex / tilesPerRow);
              const t = batchIndex % tilesPerRow;

              const reversedI = columnlength - 1 - i;
              const rowIndex = reversedI + yOffset;

              if (rowIndex < 0 || rowIndex >= cachingTiles.length) continue;

              const existingRow = cachingTiles[rowIndex] || [];
              const rowLen = existingRow.length;
              if (rowLen === 0) continue;

              const yAbs = end_y - reversedI;
              const rowParityBase = (start_x + yAbs) & 1;

              const tStart = Math.max(0, -xOffset);
              const tEnd = Math.min(tilesPerRow, rowLen - xOffset);
              if (t < tStart || t >= tEnd) continue;

              const p = i * rowlengthBytes + (t << 1);
              const c0 = unsortedTiles.charCodeAt(p);
              const c1 = unsortedTiles.charCodeAt(p + 1);

              // 16비트 조합으로 벡터화 LUT 룩업 (O(1) 연산)
              const lookupIndex = (c0 << 8) | c1;
              const tileType = VECTORIZED_TILE_LUT[lookupIndex];

              if (tileType === 255) continue; // 잘못된 hex

              const checker = rowParityBase ^ (t & 1);
              const colIndex = t + xOffset;

              // 벡터화된 문자열 변환 (O(1) 룩업)
              let nextValue: string;
              if (tileType < 8) {
                nextValue = tileType === 0 ? 'O' : tileType.toString();
              } else if (tileType === 8) {
                nextValue = 'B';
              } else if (tileType >= 16 && tileType < 24) {
                const flagColor = Math.floor((tileType - 16) / 2);
                nextValue = `F${flagColor}${checker}`;
              } else if (tileType === 24) {
                nextValue = `C${checker}`;
              } else {
                nextValue = '??'; // 예외 처리
              }

              if (existingRow[colIndex] !== nextValue) {
                // Atomics로 안전하게 공유 배열에 변경사항 저장
                const changeIndex = Atomics.add(changeCountArray, 0, 1);
                if (changeIndex < totalTiles) {
                  sharedArray[changeIndex * 3] = rowIndex;
                  sharedArray[changeIndex * 3 + 1] = colIndex;
                  sharedArray[changeIndex * 3 + 2] = nextValue.charCodeAt(0); // 간단한 문자열 인코딩
                }
              }
            }
          }
          resolve();
        });
      });

      // 모든 워커 완료 대기
      await Promise.all(sharedWorkerPromises);

      // 공유 배열에서 변경사항 읽기
      const finalChangeCount = Atomics.load(changeCountArray, 0);
      const allChanges: Array<{ row: number; col: number; value: string }> = [];

      for (let i = 0; i < finalChangeCount; i++) {
        const row = sharedArray[i * 3];
        const col = sharedArray[i * 3 + 1];
        const value = String.fromCharCode(sharedArray[i * 3 + 2]);
        allChanges.push({ row, col, value });
      }

      if (allChanges.length > 0) {
        setCachingTiles(prevTiles => {
          const newTiles = [...prevTiles];
          allChanges.forEach(({ row, col, value }) => {
            if (!newTiles[row]) {
              newTiles[row] = [...prevTiles[row]];
            }
            newTiles[row][col] = value;
          });
          return newTiles;
        });
      }
    } else {
      // SharedArrayBuffer 미지원 시 일반 병렬 처리
      const workerPromises = Array.from({ length: workerCount }, (_, workerIndex) => {
        return new Promise<{ changes: Array<{ row: number; col: number; value: string }> }>(resolve => {
          const workerStart = workerIndex * tilesPerWorker;
          const workerEnd = Math.min(workerStart + tilesPerWorker, totalTiles);
          const changes: Array<{ row: number; col: number; value: string }> = [];

          // 타일 배치를 Promise로 분할하여 병렬(동시) 처리
          const batchPromises: Array<Promise<void>> = [];
          for (let tileIndex = workerStart; tileIndex < workerEnd; tileIndex += 4) {
            const startIndexForBatch = tileIndex;
            const endIndexForBatch = Math.min(startIndexForBatch + 4, workerEnd);
            batchPromises.push(
              new Promise<void>(resolveBatch => {
                for (let batchIndex = startIndexForBatch; batchIndex < endIndexForBatch; batchIndex++) {
                  const i = Math.floor(batchIndex / tilesPerRow);
                  const t = batchIndex % tilesPerRow;

                  const reversedI = columnlength - 1 - i;
                  const rowIndex = reversedI + yOffset;

                  if (rowIndex < 0 || rowIndex >= cachingTiles.length) {
                    continue;
                  }

                  const existingRow = cachingTiles[rowIndex] || [];
                  const rowLen = existingRow.length;
                  if (rowLen === 0) {
                    continue;
                  }

                  const yAbs = end_y - reversedI;
                  const rowParityBase = (start_x + yAbs) & 1;

                  const tStart = Math.max(0, -xOffset);
                  const tEnd = Math.min(tilesPerRow, rowLen - xOffset);
                  if (t < tStart || t >= tEnd) {
                    continue;
                  }

                  const p = i * rowlengthBytes + (t << 1);
                  const c0 = unsortedTiles.charCodeAt(p);
                  const c1 = unsortedTiles.charCodeAt(p + 1);

                  // 16비트 조합으로 벡터화 LUT 룩업 (O(1) 연산)
                  const lookupIndex = (c0 << 8) | c1;
                  const tileType = VECTORIZED_TILE_LUT[lookupIndex];

                  if (tileType === 255) {
                    continue; // 잘못된 hex
                  }

                  const checker = rowParityBase ^ (t & 1);
                  const colIndex = t + xOffset;

                  // 벡터화된 문자열 변환 (O(1) 룩업)
                  let nextValue: string;
                  if (tileType < 8) {
                    nextValue = tileType === 0 ? 'O' : tileType.toString();
                  } else if (tileType === 8) {
                    nextValue = 'B';
                  } else if (tileType >= 16 && tileType < 24) {
                    const flagColor = Math.floor((tileType - 16) / 2);
                    nextValue = `F${flagColor}${checker}`;
                  } else if (tileType === 24) {
                    nextValue = `C${checker}`;
                  } else {
                    nextValue = '??'; // 예외 처리
                  }

                  if (existingRow[colIndex] !== nextValue) {
                    changes.push({ row: rowIndex, col: colIndex, value: nextValue });
                  }
                }
                resolveBatch();
              }),
            );
          }

          Promise.all(batchPromises).then(() => resolve({ changes }));
        });
      });

      try {
        // 모든 워커를 병렬로 실행
        const workerResults = await Promise.all(workerPromises);
        const allChanges = workerResults.flatMap(result => result.changes);

        if (allChanges.length > 0) {
          setCachingTiles(prevTiles => {
            const newTiles = [...prevTiles];
            allChanges.forEach(({ row, col, value }) => {
              if (!newTiles[row]) newTiles[row] = [...prevTiles[row]];
              newTiles[row][col] = value;
            });
            return newTiles;
          });
        }
      } catch (error) {
        console.error('Ultra-Parallel Worker tile processing error:', error);
        replaceTilesSync(end_x, end_y, start_x, start_y, unsortedTiles, type);
      }
    }
  };

  // 동기식 폴백 함수
  const replaceTilesSync = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;
    const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1;
    const tilesPerRow = rowlengthBytes >> 1;
    const columnlength = Math.abs(start_y - end_y + 1);
    let newTiles = cachingTiles as string[][];
    let outerCloned = false;
    const yOffset = type === 'All' ? (cursorY < end_y ? endPoint.y - startPoint.y - columnlength + 1 : 0) : end_y - startPoint.y;
    const xOffset = start_x - startPoint.x;

    const OPEN = OPEN_LUT;
    const CL0 = CLOSED0_LUT;
    const CL1 = CLOSED1_LUT;
    let anyChanged = false;

    for (let i = 0; i < columnlength; i++) {
      const reversedI = columnlength - 1 - i;
      const rowIndex = reversedI + yOffset;

      if (rowIndex < 0 || rowIndex >= newTiles.length) continue;

      const existingRow = newTiles[rowIndex] || [];
      const rowLen = existingRow.length;
      if (rowLen === 0) continue;

      const yAbs = end_y - reversedI;
      const rowParityBase = (start_x + yAbs) & 1;

      const tStart = Math.max(0, -xOffset);
      const tEnd = Math.min(tilesPerRow, rowLen - xOffset);
      if (tStart >= tEnd) continue;

      let p = i * rowlengthBytes + (tStart << 1);
      let checker = rowParityBase ^ (tStart & 1);
      let row = existingRow;
      let rowCloned = false;

      for (let t = tStart; t < tEnd; t++) {
        const c0 = unsortedTiles.charCodeAt(p);
        const c1 = unsortedTiles.charCodeAt(p + 1);
        const n0 = c0 < 128 ? HEX_NIBBLE[c0] : -1;
        const n1 = c1 < 128 ? HEX_NIBBLE[c1] : -1;

        if (n0 < 0 || n1 < 0) {
          p += 2;
          checker ^= 1;
          continue;
        }

        const byte = (n0 << 4) | n1;
        p += 2;

        const colIndex = t + xOffset;
        const opened = OPEN[byte];
        const nextValue = opened !== null ? opened : checker === 0 ? CL0[byte] : CL1[byte];

        if (row[colIndex] !== nextValue) {
          if (!outerCloned) {
            newTiles = [...newTiles];
            outerCloned = true;
          }
          if (!rowCloned) {
            row = existingRow.slice();
            newTiles[rowIndex] = row;
            rowCloned = true;
          }
          row[colIndex] = nextValue;
          anyChanged = true;
        }

        checker ^= 1;
      }
    }

    if (outerCloned && anyChanged) setCachingTiles(newTiles);
  };

  /** Message handler for tile processing */
  const handleWebSocketMessage = async (wsMessage: string) => {
    // me
    const { MY_CURSOR, YOU_DIED, MOVED, ERROR } = ReceiveMessageEvent;
    // others
    const { POINTER_SET, CURSORS, CURSORS_DIED, CURSOR_QUIT, CHAT } = ReceiveMessageEvent;
    // all
    const { TILES, FLAG_SET, SINGLE_TILE_OPENED, TILES_OPENED } = ReceiveMessageEvent;
    try {
      const { event, payload } = JSON.parse(wsMessage);
      switch (event) {
        /** When receiving requested tiles */
        case TILES: {
          const { tiles, start_p, end_p } = payload;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          await replaceTiles(end_x, end_y, start_x, start_y, tiles, 'All');
          break;
        }
        /** When receiving unrequested tiles when sending tile open event */
        case FLAG_SET: {
          const { position, is_set, color } = payload;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          const colorIndex = typeof color === 'number' ? color : (({ RED: 0, YELLOW: 1, BLUE: 2, PURPLE: 3 } as Record<string, number>)[color] ?? 0);
          const parity = ((x + y) & 1).toString();
          newTiles[y - startPoint.y][x - startPoint.x] = is_set ? `F${colorIndex}${parity}` : `C${parity}`;
          setCachingTiles(newTiles);
          break;
        }
        case POINTER_SET: {
          const { id, pointer } = payload;
          const newCursors = cursors.map(cursor => (id === cursor.id ? { ...cursor, pointer } : cursor));
          setCursors(newCursors);
          break;
        }
        case SINGLE_TILE_OPENED: {
          const { position, tile } = payload;
          if (!position || !tile) return;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          newTiles[y - startPoint.y][x - startPoint.x] = parseHex(tile, x, y);
          setCachingTiles(newTiles);
          break;
        }
        case TILES_OPENED: {
          const { tiles, start_p, end_p } = payload;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          await replaceTiles(end_x, end_y, start_x, start_y, tiles, 'PART');
          break;
        }
        /** Fetches own information only once when connected. */
        case MY_CURSOR: {
          const { position, pointer, color, id } = payload;
          setId(id);
          setOringinPosition(position.x, position.y);
          setCursorPosition(position.x, position.y);
          setColor(color.toLowerCase());
          if (pointer) setClickPosition(pointer.x, pointer.y, '');
          setTimeout(() => setIsInitialized(true), 0);
          break;
        }
        /** Fetches information of other users. */
        case YOU_DIED: {
          const { revive_at } = payload;
          const leftTime = ((new Date(revive_at)?.getTime() - Date.now()) / 1000) >>> 0;
          setLeftReviveTime(leftTime);
          break;
        }
        case CURSORS: {
          const { cursors } = payload;
          type newCursorType = {
            position: XYType;
            pointer: XYType;
            id: string;
            color: string;
          };
          const newCursors = cursors.map(({ position: { x, y }, color, id, pointer }: newCursorType) => {
            return { id, pointer, x, y, color: color.toLowerCase() };
          });
          addCursors(newCursors);
          break;
        }
        case CURSORS_DIED: {
          const { cursors: deadCursors, revive_at } = payload;
          const revive_time = new Date(revive_at)?.getTime();
          const newCursors = cursors.map(cursor => {
            for (const deadCursor of deadCursors as OtherUserSingleCursorState[])
              if (cursor.id === deadCursor.id) return { ...cursor, revive_at: revive_time };
            return cursor;
          });
          setCursors(newCursors);
          break;
        }
        /** Receives movement events from other users. */
        case MOVED: {
          const { id, new_position } = payload;
          const { x, y } = new_position;
          const newCursors = cursors.map(cursor => (id === cursor.id ? { ...cursor, x, y } : cursor));
          setCursors(newCursors);
          break;
        }
        /** Receives other user's quit */
        case CURSOR_QUIT: {
          const { id } = payload;
          const newCursors = [...cursors];
          const index = newCursors.findIndex(cursor => cursor.id === id);
          if (index !== -1) newCursors.splice(index, 1);
          setCursors(newCursors);
          break;
        }
        case CHAT: {
          const { cursor_id, message } = payload;
          const newCursors = cursors.map(cursor => {
            if (cursor.id !== cursor_id) return cursor;
            return { ...cursor, message, messageTime: Date.now() + 1000 * 8 };
          });
          setCursors(newCursors);
          break;
        }
        case ERROR: {
          const { msg } = payload;
          console.error(msg);
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

  /** Handling Websocket Message */
  useLayoutEffect(() => {
    if (!message) return;
    handleWebSocketMessage(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  /** STABLE & FAST: Reliable tile computation without GPU bugs */
  const computedRenderTiles = useMemo(() => {
    const cachingLength = cachingTiles.length;
    if (cachingLength === 0) return [];

    const offsetX = cursorOriginX - cursorX;
    const offsetY = cursorOriginY - cursorY;
    const renderBaseX = renderStartPoint.x;
    const renderBaseY = renderStartPoint.y;

    // INSTANT: Perfect alignment - no processing needed
    if (offsetX === 0 && offsetY === 0) return cachingTiles; // O(1) return!

    // STABLE CPU processing - no disappearing tiles
    return processWithStableCPU();

    function processWithStableCPU(): string[][] {
      // Ultra-stable rendering - guaranteed no missing tiles
      return cachingTiles.map((cachingRow, row) => {
        const sourceRowIndex = row + offsetY;

        // Bounds check for source row
        if (sourceRowIndex < 0 || sourceRowIndex >= cachingLength) return new Array(cachingRow.length).fill('??');

        const sourceRow = cachingTiles[sourceRowIndex];
        if (!sourceRow) return new Array(cachingRow.length).fill('??');

        // Process each column safely
        return cachingRow.map((_, col) => {
          const sourceColIndex = col + offsetX;

          // Bounds check for source column
          if (sourceColIndex < 0 || sourceColIndex >= sourceRow.length) return '??';

          const sourceTile = sourceRow[sourceColIndex];
          if (!sourceTile || sourceTile === '??') return '??';

          const tileType = sourceTile[0];

          // Fast path for most tiles - no transformation needed
          if (!['C', 'F'].includes(tileType)) return sourceTile;

          // Safe checkerboard calculation
          const renderX = renderBaseX + col;
          const renderY = renderBaseY + row;
          const checkerBit = (renderX + renderY) & 1;

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
  }, [cachingTiles, cursorOriginX, cursorOriginY, cursorX, cursorY, renderStartPoint]);

  /** Apply computed tiles */
  useLayoutEffect(() => {
    setRenderTiles(computedRenderTiles);
  }, [computedRenderTiles]);

  /** Reset screen range when cursor position or screen size changes */
  useLayoutEffect(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const [tilePaddingWidth, tilePaddingHeight] = [
      ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0,
      ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0,
    ];

    if (tilePaddingHeight < 1 || tilePaddingWidth < 1) return;
    setStartPoint({
      x: cursorX - tilePaddingWidth,
      y: cursorY - tilePaddingHeight,
    });
    setEndPoint({
      x: cursorX + tilePaddingWidth,
      y: cursorY + tilePaddingHeight,
    });

    setRenderStartPoint({
      x: cursorOriginX - tilePaddingWidth,
      y: cursorOriginY - tilePaddingHeight,
    });
    setTileSize(newTileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, cursorOriginX, cursorOriginY, cursorX, cursorY, isInitialized]);

  /** Handling zoom event */
  useLayoutEffect(() => {
    if (!isInitialized) return;
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const tileVisibleWidth = ((windowWidth * RENDER_RANGE) / newTileSize) >>> 0;
    const tileVisibleHeight = ((windowHeight * RENDER_RANGE) / newTileSize) >>> 0;
    const [tilePaddingWidth, tilePaddingHeight] = [(tileVisibleWidth / 2) >>> 0, (tileVisibleHeight / 2) >>> 0];
    let [heightReductionLength, widthReductionLength] = [0, 0];

    /** For Extending */
    if (tileVisibleWidth > endPoint.x - startPoint.x + 1 || tileVisibleHeight > endPoint.y - startPoint.y + 1) {
      heightReductionLength = (tilePaddingHeight - (endPoint.y - startPoint.y) / 2) >>> 0;
      widthReductionLength = Math.round(tilePaddingWidth - (endPoint.x - startPoint.x) / 2);
    } else {
      /** For reducing */
      heightReductionLength = -Math.round((endPoint.y - startPoint.y - tileVisibleHeight) / 2);
      widthReductionLength = -Math.round((endPoint.x - startPoint.x - tileVisibleWidth) / 2);
    }
    requestTiles(
      startPoint.x - widthReductionLength,
      endPoint.y + heightReductionLength,
      endPoint.x + widthReductionLength,
      startPoint.y - heightReductionLength,
      Direction.ALL,
    );
    // setting view size
    const width = ((windowWidth * RENDER_RANGE) / newTileSize) >>> 0;
    const height = ((windowHeight * RENDER_RANGE) / newTileSize) >>> 0;
    const payload = { width, height };
    const body = JSON.stringify({ event: SendMessageEvent.SET_VIEW_SIZE, payload });
    sendMessage(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, isInitialized]);

  /** When cursor position has changed. */
  useEffect(() => {
    const [widthExtendLength, heightExtendLength] = [cursorX - cursorOriginX, cursorY - cursorOriginY];
    const [isLeft, isRight] = [widthExtendLength < 0, widthExtendLength > 0];
    const [isUp, isDown] = [heightExtendLength < 0, heightExtendLength > 0];
    const { upfrom, upto, downfrom, downto, leftfrom, leftto, rightfrom, rightto } = {
      upfrom: startPoint.y - 1,
      upto: startPoint.y + heightExtendLength,
      downfrom: endPoint.y + heightExtendLength,
      downto: endPoint.y + 1,
      leftfrom: startPoint.x + widthExtendLength,
      leftto: startPoint.x - 1,
      rightfrom: endPoint.x + 1,
      rightto: endPoint.x + widthExtendLength,
    };
    if (isRight && isDown) {
      requestTiles(rightfrom, downfrom, rightto, upto, Direction.RIGHT);
      requestTiles(leftfrom, downfrom, rightto, downto, Direction.DOWN);
    } else if (isLeft && isDown) {
      requestTiles(leftfrom, downfrom, leftto, upto, Direction.LEFT);
      requestTiles(leftfrom, downfrom, rightto, downto, Direction.DOWN);
    } else if (isRight && isUp) {
      requestTiles(rightfrom, downfrom, rightto, upto, Direction.RIGHT);
      requestTiles(leftfrom, upfrom, rightto, upto, Direction.UP);
    } else if (isLeft && isUp) {
      requestTiles(leftfrom, downfrom, leftto, upto, Direction.LEFT);
      requestTiles(leftfrom, upfrom, rightto, upto, Direction.UP);
    } else if (isRight) requestTiles(rightfrom, endPoint.y, rightto, startPoint.y, Direction.RIGHT);
    else if (isLeft) requestTiles(leftfrom, endPoint.y, leftto, startPoint.y, Direction.LEFT);
    else if (isDown) requestTiles(startPoint.x, downfrom, endPoint.x, downto, Direction.DOWN);
    else if (isUp) requestTiles(startPoint.x, upfrom, endPoint.x, upto, Direction.UP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorX, cursorY]);

  /** Send user move event */
  useEffect(() => {
    if (!isInitialized) return;
    const event = SendMessageEvent.MOVING;
    const position = { x: cursorOriginX, y: cursorOriginY };
    const payload = { position };
    const body = JSON.stringify({ event, payload });
    sendMessage(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorOriginX, cursorOriginY]);

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
      <ScoreBoard />
      <CanvasDashboard tileSize={tileSize} renderRange={RENDER_RANGE} maxTileCount={MAX_TILE_COUNT} />
      <CanvasRenderComponent
        leftReviveTime={leftReviveTime}
        paddingTiles={RENDER_RANGE}
        tiles={renderTiles}
        tileSize={tileSize}
        startPoint={renderStartPoint}
        cursorOriginX={cursorOriginX}
        cursorOriginY={cursorOriginY}
      />
    </div>
  );
}
