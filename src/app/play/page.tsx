'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState } from 'react';
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
import { ReceiveMessageEvent, SendMessageEvent } from '@/types';

interface Point {
  x: number;
  y: number;
}

export default function Play() {
  /** constants */
  const RENDER_RANGE = 1.5;
  const ORIGIN_TILE_SIZE = 80;
  const MAX_TILE_COUNT = 530;
  const WS_URL = `${process.env.NEXT_PUBLIC_WS_HOST}/session`;

  /** stores */
  const { isOpen, message, sendMessage, connect, disconnect } = useWebSocketStore();
  const {
    x: cursorX,
    y: cursorY,
    setColor,
    setPosition: setCursorPosition,
    zoom,
    setZoom,
    originX: cursorOriginX,
    originY: cursorOriginY,
    setOringinPosition,
    setId,
  } = useCursorStore();
  const { setCursors, addCursors, cursors } = useOtherUserCursorsStore();
  const { setPosition: setClickPosition } = useClickStore();

  /** hooks */
  const { windowWidth, windowHeight } = useScreenSize();

  /** states */
  const [tileSize, setTileSize] = useState<number>(0); //px
  const [startPoint, setStartPoint] = useState<Point>({ x: 0, y: 0 });
  const [endPoint, setEndPoint] = useState<Point>({ x: 0, y: 0 });
  const [renderStartPoint, setRenderStartPoint] = useState<Point>({ x: 0, y: 0 });
  const [cachingTiles, setCachingTiles] = useState<string[][]>([]);
  const [renderTiles, setRenderTiles] = useState<string[][]>([...cachingTiles.map(row => [...row])]);
  const [leftReviveTime, setLeftReviveTime] = useState<number>(-1);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  /**
   * Request Tiles
   * Please send start y and end y coordinates are reversed because the y-axis is reversed.
   * @param start_x {number} - start x position
   * @param start_y {number} - start y position
   * @param end_x {number} - end x position
   * @param end_y {number} - end y position
   * @param type {string} - Request type (R: Right tiles, L: Left tiles, U: Up tiles, D: Down tiles, A: All tiles)
   *  */
  const requestTiles = (start_x: number, start_y: number, end_x: number, end_y: number, type: 'R' | 'L' | 'U' | 'D' | 'A') => {
    if (!isOpen || !isInitialized) return;
    /** add Dummy data to originTiles */
    const [rowlength, columnlength] = [Math.abs(end_x - start_x) + 1, Math.abs(start_y - end_y) + 1];

    setCachingTiles(tiles => {
      let newTiles = [...tiles];
      switch (type) {
        case 'U': // Upper tiles
          newTiles = [...Array.from({ length: columnlength }, () => Array(rowlength).fill('??')), ...newTiles.slice(0, -columnlength)];
          break;
        case 'D': // Down tiles
          newTiles = [...newTiles.slice(columnlength), ...Array.from({ length: columnlength }, () => Array(rowlength).fill('??'))];
          break;
        case 'L': // Left tiles
          for (let i = 0; i < columnlength; i++)
            newTiles[i] = [...Array(rowlength).fill('??'), ...newTiles[i].slice(0, newTiles[0].length - rowlength)];
          break;
        case 'R': // Right tiles
          for (let i = 0; i < columnlength; i++) newTiles[i] = [...newTiles[i].slice(rowlength), ...Array(rowlength).fill('??')];
          break;
        case 'A': // All tiles
          newTiles = Array.from({ length: columnlength }, () => Array.from({ length: rowlength }, () => '??'));
      }
      return newTiles;
    });
    const payload = { start_p: { x: start_x, y: start_y }, end_p: { x: end_x, y: end_y } };
    const body = JSON.stringify({ event: SendMessageEvent.FETCH_TILES, payload });
    sendMessage(body);
    return;
  };

  /** Disconnect websocket when Component has been unmounted */
  useLayoutEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    setIsInitialized(false);
    setZoom(1);
    return () => {
      document.documentElement.style.overflow = 'auto';
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Initialize
   * Re-connect websocket when websocket is closed state.
   * */
  useEffect(() => {
    if (!isOpen && startPoint.x !== endPoint.x && endPoint.y !== startPoint.y) {
      setLeftReviveTime(-1);
      const [view_width, view_height] = [endPoint.x - startPoint.x + 1, endPoint.y - startPoint.y + 1];
      connect(WS_URL + `?view_width=${view_width}&view_height=${view_height}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint, endPoint]);

  /** Parse Hex using two charactors
   * @param hex {string} - Hex string
   */
  const parseHex = (hex: string) => {
    const hexArray = hex.match(/.{1,2}/g);
    if (!hexArray) return '';
    const byte = hexArray.map(hex => parseInt(hex, 16).toString(2).padStart(8, '0')).join('');
    // byte 0 - IsOpen, 1 - IsMine, 2 - IsFlag, 3 ~ 4 color, 5 ~ 7 number of mines
    const isTileOpened = byte[0] === '1';
    const isMine = byte[1] === '1';
    const isFlag = byte[2] === '1';
    const color = parseInt(byte.slice(3, 5), 2); /** 00 red, 01 yellow, 10 blue, 11 purple */
    const number = parseInt(byte.slice(5), 2);
    if (isTileOpened) return isMine ? 'B' : number === 0 ? 'O' : number.toString();
    if (isFlag) return 'F' + color;
    return 'C';
  };

  const sortTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string) => {
    const [rowlength, columnlength] = [Math.abs(end_x - start_x + 1) * 2, Math.abs(start_y - end_y + 1)];
    const sortedTiles: string[][] = [];
    for (let i = 0; i < columnlength; i++) {
      const newRow = new Array(rowlength / 2);
      const rowOffset = i * rowlength;
      for (let j = 0; j < rowlength; j += 2) newRow[j / 2] = parseHex(unsortedTiles.slice(rowOffset + j, rowOffset + j + 2));
      sortedTiles[i] = newRow;
    }
    /** The y-axis is reversed.*/
    sortedTiles.reverse();
    return { rowlength, columnlength, sortedTiles };
  };

  const replaceTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;
    const { rowlength, columnlength, sortedTiles } = sortTiles(end_x, end_y, start_x, start_y, unsortedTiles);
    /** Replace dummy data according to coordinates */
    const newTiles = [...cachingTiles];
    const yOffset = type === 'All' ? (cursorY < end_y ? endPoint.y - startPoint.y - columnlength + 1 : 0) : end_y - startPoint.y;
    const xOffset = start_x - startPoint.x;

    for (let i = 0; i < columnlength; i++) {
      const rowIndex = i + yOffset;
      const row = newTiles[rowIndex] || (newTiles[rowIndex] = []);
      const sortedRow = sortedTiles[i];
      const baseOffset = i - end_y - start_x;

      for (let j = 0; j < rowlength; j++) {
        const tile = sortedRow[j];
        if (!tile) continue;
        const colIndex = j + xOffset;
        const isAlternatingPosition = (baseOffset + j) % 2 === 1;
        if (tile[0] === 'C' || tile[0] === 'F') row[colIndex] = `${tile}${isAlternatingPosition ? '1' : '0'}`;
        else row[colIndex] = tile;
      }
    }
    setCachingTiles(newTiles);
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
          const colorMap: Record<string, string> = {
            RED: '0',
            YELLOW: '1',
            BLUE: '2',
            PURPLE: '3',
          };
          newTiles[y - startPoint.y][x - startPoint.x] = (is_set ? 'F' + (colorMap[color] ?? color) : 'C') + ((x + y) % 2 === 0 ? '0' : '1');
          setCachingTiles(newTiles);
          break;
        }
        case POINTER_SET: {
          const { id, pointer } = payload;
          const newCursors = cursors.map(cursor => (id === cursor.id ? { ...cursor, pointer } : cursor));
          setCursors(newCursors);
        }
        case SINGLE_TILE_OPENED: {
          const { position, tile } = payload;
          if (!position || !tile) return;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          newTiles[y - startPoint.y][x - startPoint.x] = parseHex(tile);
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
            position: { x: number; y: number };
            id: string;
            color: string;
            pointer: { x: number; y: number };
          };
          const newCursors = cursors.map(({ position: { x, y }, color, id, pointer }: newCursorType) => ({
            id,
            pointer,
            x,
            y,
            color: color.toLowerCase(),
          }));
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
            if (cursor.id === cursor_id) return { ...cursor, message, messageTime: Date.now() + 1000 * 8 };
            return cursor;
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

  /** Detect changes in cached tile content and position */
  useLayoutEffect(() => {
    const newTiles = [...cachingTiles.map(row => [...row.map(() => '??')])];
    const [offsetX, offsetY] = [cursorOriginX - cursorX, cursorOriginY - cursorY];
    for (let row = 0; row < cachingTiles.length; row++) {
      if (row + offsetY >= 0 && row + offsetY < cachingTiles.length)
        for (let col = 0; col < cachingTiles[row].length; col++) {
          const targetCol = col + offsetX;
          if (targetCol >= 0 && targetCol < cachingTiles[row + offsetY].length) newTiles[row][col] = cachingTiles[row + offsetY][targetCol] || '??';
        }
    }
    setRenderTiles(newTiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingTiles, cursorOriginX, cursorOriginY]);

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
      'A',
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
      requestTiles(rightfrom, downfrom, rightto, upto, 'R');
      requestTiles(leftfrom, downfrom, rightto, downto, 'D');
    } else if (isLeft && isDown) {
      requestTiles(leftfrom, downfrom, leftto, upto, 'L');
      requestTiles(leftfrom, downfrom, rightto, downto, 'D');
    } else if (isRight && isUp) {
      requestTiles(rightfrom, downfrom, rightto, upto, 'R');
      requestTiles(leftfrom, upfrom, rightto, upto, 'U');
    } else if (isLeft && isUp) {
      requestTiles(leftfrom, downfrom, leftto, upto, 'L');
      requestTiles(leftfrom, upfrom, rightto, upto, 'U');
    } else if (isRight) requestTiles(rightfrom, endPoint.y, rightto, startPoint.y, 'R');
    else if (isLeft) requestTiles(leftfrom, endPoint.y, leftto, startPoint.y, 'L');
    else if (isDown) requestTiles(startPoint.x, downfrom, endPoint.x, downto, 'D');
    else if (isUp) requestTiles(startPoint.x, upfrom, endPoint.x, upto, 'U');
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
    setTimeout(() => setLeftReviveTime(e => (e > 0 ? --e : e)), 1000);
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
        setCachingTiles={setCachingTiles}
        tileSize={tileSize}
        startPoint={renderStartPoint}
        cursorOriginX={cursorOriginX}
        cursorOriginY={cursorOriginY}
      />
    </div>
  );
}
