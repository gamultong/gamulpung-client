'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState, useMemo } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { OtherUserSingleCursorState, useCursorStore, useOtherUserCursorsStore } from '../../store/cursorStore';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import useClickStore from '@/store/clickStore';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoard from '@/components/scoreboard';
import { Direction, ReceiveMessageEvent, SendMessageEvent, XYType } from '@/types';

// Fast string lookups to avoid repeated concatenations
const F_LOOKUP = [
  ['F00', 'F01'],
  ['F10', 'F11'],
  ['F20', 'F21'],
  ['F30', 'F31'],
] as const;
const NUM_OPEN_LOOKUP = ['O', '1', '2', '3', '4', '5', '6', '7'] as const;

// Byte → string LUTs to minimize per-tile branching
const OPEN_LUT: (string | null)[] = new Array(256);
const CLOSED0_LUT: string[] = new Array(256);
const CLOSED1_LUT: string[] = new Array(256);

// initialize LUTs
(() => {
  for (let b = 0; b < 256; b++) {
    const isOpened = (b & 0b10000000) !== 0;
    const isMine = (b & 0b01000000) !== 0;
    const isFlag = (b & 0b00100000) !== 0;
    const color = (b & 0b00011000) >> 3;
    const number = b & 0b00000111;

    if (isOpened) {
      OPEN_LUT[b] = isMine ? 'B' : NUM_OPEN_LOOKUP[number];
      CLOSED0_LUT[b] = 'C0';
      CLOSED1_LUT[b] = 'C1';
    } else if (isFlag) {
      OPEN_LUT[b] = null;
      const pair = F_LOOKUP[color];
      CLOSED0_LUT[b] = pair[0];
      CLOSED1_LUT[b] = pair[1];
    } else {
      OPEN_LUT[b] = null;
      CLOSED0_LUT[b] = 'C0';
      CLOSED1_LUT[b] = 'C1';
    }
  }
})();

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
  const { setColor, setPosition: setCursorPosition, setOringinPosition, setId, zoomUp, zoomDown, setZoom } = useCursorStore();

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

  // Inline Worker: parse tiles off main thread for large payloads
  const workerRef: { current: Worker | null } = ((globalThis as unknown as Record<string, unknown>)._tileWorkerRef as { current: Worker | null }) || {
    current: null,
  };
  const workerInitRef: { current: boolean } = ((globalThis as unknown as Record<string, unknown>)._tileWorkerInit as { current: boolean }) || {
    current: false,
  };
  const generationRef: { current: number } = ((globalThis as unknown as Record<string, unknown>)._tileWorkerGen as { current: number }) || {
    current: 0,
  };
  (globalThis as unknown as Record<string, unknown>)._tileWorkerRef = workerRef;
  (globalThis as unknown as Record<string, unknown>)._tileWorkerInit = workerInitRef;
  (globalThis as unknown as Record<string, unknown>)._tileWorkerGen = generationRef;

  function ensureWorker(): Worker | null {
    if (typeof window === 'undefined') return null;
    if (workerRef.current) return workerRef.current;
    try {
      const workerCode = `
        // LUTs will be injected from the main thread to avoid recomputation
        let OPEN_LUT = null;      // (string|null)[]
        let CLOSED0_LUT = null;   // string[]
        let CLOSED1_LUT = null;   // string[]

        // Optional fallback precompute if INIT not received
        function ensureLocalLUTs() {
          if (OPEN_LUT && CLOSED0_LUT && CLOSED1_LUT) return;
          const FLAG_LOOKUP = [['F00','F01'],['F10','F11'],['F20','F21'],['F30','F31']];
          const OPEN_NUM_LOOKUP = ['O','1','2','3','4','5','6','7'];
          OPEN_LUT = new Array(256);
          CLOSED0_LUT = new Array(256);
          CLOSED1_LUT = new Array(256);
          for (let byteValue = 0; byteValue < 256; byteValue++) {
            const isOpened = (byteValue & 0x80) !== 0;
            const isMine = (byteValue & 0x40) !== 0;
            const isFlag = (byteValue & 0x20) !== 0;
            const color = (byteValue & 0x18) >> 3;
            const number = byteValue & 0x07;
            if (isOpened) {
              OPEN_LUT[byteValue] = isMine ? 'B' : OPEN_NUM_LOOKUP[number];
              CLOSED0_LUT[byteValue] = 'C0';
              CLOSED1_LUT[byteValue] = 'C1';
            } else if (isFlag) {
              OPEN_LUT[byteValue] = null;
              const flagPair = FLAG_LOOKUP[color];
              CLOSED0_LUT[byteValue] = flagPair[0];
              CLOSED1_LUT[byteValue] = flagPair[1];
            } else {
              OPEN_LUT[byteValue] = null;
              CLOSED0_LUT[byteValue] = 'C0';
              CLOSED1_LUT[byteValue] = 'C1';
            }
          }
        }

        // Worker message handler
        onmessage = (e) => {
          const msg = e.data && e.data.msg;
          if (msg === 'INIT') {
            OPEN_LUT = e.data.OPEN;
            CLOSED0_LUT = e.data.CL0;
            CLOSED1_LUT = e.data.CL1;
            return;
          }

          const { id, hex, start_x, end_y, xOffset, yOffset, rowlengthBytes, tilesPerRow, columnlength, widthHint } = e.data;
          ensureLocalLUTs();
          const rows = [];
          for (let i = 0; i < columnlength; i++) {
            const reversedI = columnlength - 1 - i;
            const rowIndex = reversedI + yOffset;
            const yAbs = end_y - reversedI;
            const rowParityBase = (start_x + yAbs) & 1;

            // Horizontal clipping with hint
            let tStart = 0;
            if (xOffset < 0) tStart = -xOffset;
            let tEnd = tilesPerRow;
            const maxVisible = widthHint - xOffset; // widthHint may be row length
            if (tEnd > maxVisible) tEnd = maxVisible;
            if (tStart >= tEnd) continue;

            let p = i * rowlengthBytes + (tStart << 1);
            let checker = rowParityBase ^ (tStart & 1);
            const values = new Array(tEnd - tStart);
            let idx = 0;
            let t = tStart;

            while (t < tEnd) {
              // Tile A
              let c0 = hex.charCodeAt(p), c1 = hex.charCodeAt(p + 1);
              let n0 = c0 <= 57 ? c0 - 48 : c0 <= 70 ? c0 - 55 : c0 - 87;
              let n1 = c1 <= 57 ? c1 - 48 : c1 <= 70 ? c1 - 55 : c1 - 87;
              let byteValue = (n0 << 4) | n1; p += 2;
              let opened = OPEN_LUT[byteValue];
              values[idx++] = opened !== null ? opened : (checker === 0 ? CLOSED0_LUT[byteValue] : CLOSED1_LUT[byteValue]);
              checker ^= 1; t++;
              if (t >= tEnd) break;

              // Tile B (unrolled)
              c0 = hex.charCodeAt(p); c1 = hex.charCodeAt(p + 1);
              n0 = c0 <= 57 ? c0 - 48 : c0 <= 70 ? c0 - 55 : c0 - 87;
              n1 = c1 <= 57 ? c1 - 48 : c1 <= 70 ? c1 - 55 : c1 - 87;
              byteValue = (n0 << 4) | n1; p += 2;
              opened = OPEN_LUT[byteValue];
              values[idx++] = opened !== null ? opened : (checker === 0 ? CLOSED0_LUT[byteValue] : CLOSED1_LUT[byteValue]);
              checker ^= 1; t++;
            }
            rows.push({ rowIndex, tStart, values, xOffset });
          }
          postMessage({ id, rows });
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      workerRef.current = new Worker(url);
      // Initialize LUTs in worker once
      try {
        if (!workerInitRef.current) {
          workerRef.current.postMessage({
            msg: 'INIT',
            OPEN: OPEN_LUT,
            CL0: CLOSED0_LUT,
            CL1: CLOSED1_LUT,
          });
          workerInitRef.current = true;
        }
      } catch {}
      return workerRef.current;
    } catch {
      return null;
    }
  }

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
    if (e.key === '-') {
      e.preventDefault();
      zoomDown();
    }
    if (e.key === '=') {
      e.preventDefault();
      zoomUp();
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
      disconnect();
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

  /** Parse Hex using direct byte operations (optimized)
   * @param hex {string} - Hex string
   * @param x {number} - Optional X coordinate for checkerboard pattern
   * @param y {number} - Optional Y coordinate for checkerboard pattern
   */
  const parseHex = (hex: string, x: number, y: number) => {
    if (hex.length < 2) return '';

    // Direct hex to integer conversion (much faster than string operations)
    const byte = parseInt(hex.slice(0, 2), 16);

    // Bit operations instead of string manipulation
    const isTileOpened = (byte & 0b10000000) !== 0; // bit 7 (MSB)
    const isMine = (byte & 0b01000000) !== 0; // bit 6
    const isFlag = (byte & 0b00100000) !== 0; // bit 5
    const color = (byte & 0b00011000) >> 3; // bits 4-3
    const number = byte & 0b00000111; // bits 2-0

    // Calculate checkerboard pattern for position-based coloring
    const getPattern = (posX: number, posY: number) => (posX + posY) % 2;

    if (isTileOpened) return isMine ? 'B' : number === 0 ? 'O' : `${number}`;
    if (isFlag) return 'F' + color + getPattern(x, y);
    return 'C' + getPattern(x, y);
  };

  // Deprecated: parsing into 2D array created extra allocations.
  // Direct streaming parse is used in replaceTiles.

  const replaceTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;
    const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1; // 2 hex chars per tile
    const tilesPerRow = rowlengthBytes >> 1;
    const columnlength = Math.abs(start_y - end_y + 1);
    /** Replace dummy data according to coordinates */
    let newTiles = cachingTiles as string[][];
    let outerCloned = false;
    const yOffset = type === 'All' ? (cursorY < end_y ? endPoint.y - startPoint.y - columnlength + 1 : 0) : end_y - startPoint.y;
    const xOffset = start_x - startPoint.x;

    // Try worker for large payloads
    const worker = ensureWorker();
    const approxCells = columnlength * tilesPerRow;
    const useWorker = worker && approxCells > 20000; // threshold
    if (useWorker) {
      const widthHint = newTiles[0]?.length || tilesPerRow;
      const id = ++generationRef.current;
      const payload = {
        id,
        hex: unsortedTiles,
        start_x,
        end_y,
        startPointY: startPoint.y,
        endPointY: endPoint.y,
        xOffset,
        yOffset,
        rowlengthBytes,
        tilesPerRow,
        columnlength,
        widthHint,
      };
      worker!.postMessage(payload);
      worker!.onmessage = (e: MessageEvent) => {
        const { id: respId, rows } = e.data as { id: number; rows: Array<{ rowIndex: number; tStart: number; values: string[]; xOffset: number }> };
        if (respId !== generationRef.current) return; // stale
        let tiles = cachingTiles as string[][];
        let anyChanged = false;
        let outerDone = false;
        for (const r of rows) {
          const existingRow = tiles[r.rowIndex] || [];
          let row = existingRow;
          let rowCloned = false;
          const startCol = r.tStart + xOffset;
          const endCol = startCol + r.values.length;
          if (startCol < 0 || endCol <= 0) continue;
          // ensure bounds
          const needLen = endCol;
          if (!outerDone) {
            tiles = [...tiles];
            outerDone = true;
          }
          if (row.length < needLen) {
            row = existingRow.slice();
            row.length = needLen;
            rowCloned = true;
            tiles[r.rowIndex] = row;
          }
          let col = startCol;
          for (let k = 0; k < r.values.length; k++, col++) {
            const v = r.values[k];
            if (row[col] !== v) {
              if (!rowCloned) {
                row = existingRow.slice();
                tiles[r.rowIndex] = row;
                rowCloned = true;
              }
              row[col] = v;
              anyChanged = true;
            }
          }
        }
        if (outerDone && anyChanged) setCachingTiles(tiles);
      };
      return;
    }

    // Existing optimized CPU path
    const OPEN = OPEN_LUT;
    const CL0 = CLOSED0_LUT;
    const CL1 = CLOSED1_LUT;
    let anyChanged = false;
    for (let i = 0; i < columnlength; i++) {
      const reversedI = columnlength - 1 - i;
      const rowIndex = reversedI + yOffset;
      // Vertical clipping: skip parsing whole row if offscreen
      if (rowIndex < 0 || rowIndex >= newTiles.length) {
        continue;
      }

      const existingRow = newTiles[rowIndex] || [];
      let row = existingRow;
      let rowCloned = false;
      const rowLen = existingRow.length;
      if (rowLen === 0) continue;

      const yAbs = end_y - reversedI; // match previous reversed indexing
      const rowParityBase = (start_x + yAbs) & 1;

      // Clip horizontal range to the visible row bounds
      let tStart = 0;
      if (xOffset < 0) tStart = -xOffset;
      let tEnd = tilesPerRow;
      const maxVisible = rowLen - xOffset;
      if (tEnd > maxVisible) tEnd = maxVisible;
      if (tStart >= tEnd) continue;

      let p = i * rowlengthBytes + (tStart << 1); // pointer in hex string (input is top->bottom)
      let checker = rowParityBase ^ (tStart & 1);
      let t = tStart;
      while (t < tEnd) {
        // First tile
        let c0 = unsortedTiles.charCodeAt(p);
        let c1 = unsortedTiles.charCodeAt(p + 1);
        let n0 = c0 <= 57 ? c0 - 48 : c0 <= 70 ? c0 - 55 : c0 - 87;
        let n1 = c1 <= 57 ? c1 - 48 : c1 <= 70 ? c1 - 55 : c1 - 87;
        let byte = (n0 << 4) | n1;
        p += 2;
        let colIndex = t + xOffset;
        let opened = OPEN[byte];
        let nextValue = opened !== null ? opened : checker === 0 ? CL0[byte] : CL1[byte];
        if (!outerCloned) {
          newTiles = [...newTiles];
          outerCloned = true;
        }
        if (!rowCloned) {
          row = existingRow.slice();
          newTiles[rowIndex] = row;
          rowCloned = true;
        }
        if (row[colIndex] !== nextValue) {
          row[colIndex] = nextValue;
          anyChanged = true;
        }
        checker ^= 1;
        t++;
        if (t >= tEnd) break;

        // Second tile (unrolled)
        c0 = unsortedTiles.charCodeAt(p);
        c1 = unsortedTiles.charCodeAt(p + 1);
        n0 = c0 <= 57 ? c0 - 48 : c0 <= 70 ? c0 - 55 : c0 - 87;
        n1 = c1 <= 57 ? c1 - 48 : c1 <= 70 ? c1 - 55 : c1 - 87;
        byte = (n0 << 4) | n1;
        p += 2;
        colIndex = t + xOffset;
        opened = OPEN[byte];
        nextValue = opened !== null ? opened : checker === 0 ? CL0[byte] : CL1[byte];
        if (row[colIndex] !== nextValue) {
          row[colIndex] = nextValue;
          anyChanged = true;
        }
        checker ^= 1;
        t++;
      }
    }
    if (outerCloned && anyChanged) setCachingTiles(newTiles);
  };

  /** Handling Websocket Message */
  useLayoutEffect(() => {
    if (!message) return;
    // me
    const { MY_CURSOR, YOU_DIED, MOVED, ERROR } = ReceiveMessageEvent;
    // others
    const { POINTER_SET, CURSORS, CURSORS_DIED, CURSOR_QUIT, CHAT } = ReceiveMessageEvent;
    // all
    const { TILES, FLAG_SET, SINGLE_TILE_OPENED, TILES_OPENED } = ReceiveMessageEvent;
    try {
      const { event, payload } = JSON.parse(message);
      switch (event) {
        /** When receiving requested tiles */
        case TILES: {
          const { tiles, start_p, end_p } = payload;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'All');
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
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'PART');
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
          const leftTime = Math.floor((new Date(revive_at)?.getTime() - Date.now()) / 1000);
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
          if (tileType !== 'C' && tileType !== 'F') return sourceTile;

          // Safe checkerboard calculation
          const renderX = renderBaseX + col;
          const renderY = renderBaseY + row;
          const checkerBit = (renderX + renderY) & 1;

          // Safe tile type handling
          if (tileType === 'C') return checkerBit ? 'C1' : 'C0';

          if (tileType === 'F') {
            const flagColor = sourceTile[1] || '0';
            return checkerBit ? `F${flagColor}1` : `F${flagColor}0`;
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
      Math.floor((windowWidth * RENDER_RANGE) / newTileSize / 2),
      Math.floor((windowHeight * RENDER_RANGE) / newTileSize / 2),
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
    const tileVisibleWidth = Math.floor((windowWidth * RENDER_RANGE) / newTileSize);
    const tileVisibleHeight = Math.floor((windowHeight * RENDER_RANGE) / newTileSize);
    const [tilePaddingWidth, tilePaddingHeight] = [Math.floor(tileVisibleWidth / 2), Math.floor(tileVisibleHeight / 2)];
    let [heightReductionLength, widthReductionLength] = [0, 0];

    /** For Extending */
    if (tileVisibleWidth > endPoint.x - startPoint.x + 1 || tileVisibleHeight > endPoint.y - startPoint.y + 1) {
      heightReductionLength = Math.floor(tilePaddingHeight - (endPoint.y - startPoint.y) / 2);
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
    const width = Math.floor((windowWidth * RENDER_RANGE) / newTileSize);
    const height = Math.floor((windowHeight * RENDER_RANGE) / newTileSize);
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
    setTimeout(() => setLeftReviveTime(e => (e > 0 ? e - 1 : e)), 1000);
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
