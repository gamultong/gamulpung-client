'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { OtherUserSingleCursorState, useCursorStore, useOtherUserCursorsStore } from '../../store/cursorStore';

/** stores */
import useClickStore from '@/store/clickStore';
import useWebSocketStore from '@/store/websocketStore';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoard from '@/components/scoreboard';
import {
  Direction,
  DirectionType,
  FlagSetMessageType,
  GetMyCusorMessageType,
  PointerSetMessageType,
  ReviveTimeMessageType,
  SingleTileOpenedMessageType,
  TileMessageType,
  TilesOpenedMessageType,
  XYType,
} from '@/types';
import { CursorColor } from '@/types/canvas';

export default function Play() {
  /** constants */
  const RENDER_RANGE = 3;
  const ORIGIN_TILE_SIZE = 80;
  const MAX_TILE_COUNT = 530;
  const MESSAGE_REMAIN_TIME = 1000 * 8; // 8 seconds
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
  const [tileSize, setTileSize] = useState<number>(0); // px
  const [startPoint, setStartPoint] = useState<XYType>({ x: 0, y: 0 });
  const [endPoint, setEndPoint] = useState<XYType>({ x: 0, y: 0 });
  const [renderStartPoint, setRenderStartPoint] = useState<XYType>({ x: 0, y: 0 });
  const [cachingTiles, setCachingTiles] = useState<string[][]>([]);
  const [renderTiles, setRenderTiles] = useState<string[][]>([...cachingTiles.map(r => [...r])]);
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
  const requestTiles = (start_x: number, start_y: number, end_x: number, end_y: number, type: DirectionType) => {
    if (!isOpen || !isInitialized) return;
    const [rl, cl] = [Math.abs(end_x - start_x) + 1, Math.abs(start_y - end_y) + 1]; // row length, column length

    /** add Dummy data to originTiles */
    setCachingTiles(tiles => {
      let newTiles = [...tiles];
      if (type === Direction.UP) newTiles = [...Array.from({ length: cl }, () => Array(rl).fill('??')), ...tiles.slice(0, -cl)];
      if (type === Direction.DOWN) newTiles = [...tiles.slice(cl), ...Array.from({ length: cl }, () => Array(rl).fill('??'))];
      if (type === Direction.LEFT) for (let i = 0; i < cl; i++) newTiles[i] = [...Array(rl).fill('??'), ...tiles[i].slice(0, tiles[0].length - rl)];
      if (type === Direction.RIGHT) for (let i = 0; i < cl; i++) newTiles[i] = [...tiles[i].slice(rl), ...Array(rl).fill('??')];
      if (type === Direction.ALL) newTiles = Array.from({ length: cl }, () => Array(rl).fill('??'));
      return newTiles;
    });
    const payload = { start_p: { x: start_x, y: start_y }, end_p: { x: end_x, y: end_y } };
    const body = JSON.stringify({ event: 'fetch-tiles', payload });
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

  // initialization
  const play = () => {
    if (!(!isOpen && startPoint.x !== endPoint.x && endPoint.y !== startPoint.y)) return;
    setLeftReviveTime(-1);
    setCachingTiles([]);
    setRenderTiles([]);
    setIsInitialized(false);
    setCursorPosition(cursorOriginX, cursorOriginY);
    setClickPosition(cursorOriginX, cursorOriginY, '');
    setCursors([]);
    setRenderStartPoint({ x: 0, y: 0 });
    setStartPoint({ x: cursorX, y: cursorY });
    setEndPoint({ x: cursorX, y: cursorY });
    setTileSize(ORIGIN_TILE_SIZE * zoom);
    setColor('blue');
    setOringinPosition(cursorX, cursorY);
    setZoom(1);
    const [view_width, view_height] = [endPoint.x - startPoint.x + 1, endPoint.y - startPoint.y + 1];
    connect(WS_URL + `?view_width=${view_width}&view_height=${view_height}`);
  };

  useLayoutEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint, endPoint]);

  /** Parse Hex using two charactors
   * @param hex {string} - Hex string
   * byte: 0 = IsOpen, 1 = IsMine, 2 = IsFlag, 3 ~ 4 = color, 5 ~ 7 = count of mines
   */
  const parseHex = (hex: string) => {
    const hexArray = hex.match(/.{1,2}/g);
    if (!hexArray) return '';
    const byte = hexArray.map(hex => parseInt(hex, 16).toString(2).padStart(8, '0')).join('');
    const isTileOpened = byte[0] === '1';
    const isMine = byte[1] === '1';
    const isFlag = byte[2] === '1';
    const color = parseInt(byte.slice(3, 5), 2); /** 00 red, 01 yellow, 10 blue, 11 purple */
    const count = parseInt(byte.slice(5), 2);
    if (isTileOpened) return isMine ? 'B' : count === 0 ? 'O' : count.toString();
    if (isFlag) return 'F' + color;
    return 'C';
  };

  /**
   * @param end_x
   * @param end_y
   * @param start_x
   * @param start_y
   * @param unsortedTiles
   * @returns {rowlength, columnlength, sortedTiles}
   */
  const sortTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string) => {
    const [rowlen, colLen] = [Math.abs(end_x - start_x + 1) * 2, Math.abs(start_y - end_y + 1)];
    const sortedTiles: string[][] = [];
    for (let i = 0; i < colLen; i++) {
      const newRow = new Array(rowlen / 2);
      for (let j = 0, k = 0; j < rowlen; j += 2, k++) newRow[k] = parseHex(unsortedTiles.substring(i * rowlen + j, i * rowlen + j + 2));
      sortedTiles.unshift(newRow);
    }
    return { rowlen, colLen, sortedTiles };
  };

  const replaceTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, replaceType: 'All' | 'PART') => {
    if (unsortedTiles.length === 0) return;
    const { rowlen, colLen, sortedTiles } = sortTiles(end_x, end_y, start_x, start_y, unsortedTiles);
    /** Replace dummy data according to coordinates */
    const newTiles = [...cachingTiles];
    const yOffset = replaceType === 'All' ? (cursorY < end_y ? endPoint.y - startPoint.y - colLen + 1 : 0) : end_y - startPoint.y;
    const xOffset = start_x - startPoint.x;

    for (let i = 0; i < colLen; i++) {
      const row = newTiles[i + yOffset];
      for (let j = 0; j < rowlen; j++) {
        const tile = sortedTiles[i][j];
        if (!tile) continue;
        const colIndex = j + xOffset;
        const isAlternatingPosition = (i - end_y - start_x + j) % 2 === 1 ? '1' : '0';
        if (tile[0] !== 'C' && tile[0] !== 'F') row[colIndex] = tile;
        else row[colIndex] = `${tile}${isAlternatingPosition}`;
      }
    }
    setCachingTiles(newTiles);
  };

  /** Handling Websocket Message */
  useLayoutEffect(() => {
    if (!message) return;
    try {
      const { event, payload } = JSON.parse(message);
      switch (event) {
        /** When receiving requested tiles */
        case 'tiles': {
          const { tiles, start_p, end_p } = payload as TileMessageType;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'All');
          break;
        }
        /** When receiving unrequested tiles when sending tile open event */
        case 'flag-set': {
          const { position, is_set, color } = payload as FlagSetMessageType;
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
        case 'pointer-set': {
          const { id, pointer } = payload as PointerSetMessageType;
          const newCursors = cursors.map((cursor: OtherUserSingleCursorState) => (id === cursor.id ? { ...cursor, pointer } : cursor));
          setCursors(newCursors);
        }
        case 'single-tile-opened': {
          const { position, tile } = payload as SingleTileOpenedMessageType;
          if (!position || !tile) return;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          newTiles[y - startPoint.y][x - startPoint.x] = parseHex(tile);
          setCachingTiles(newTiles);
          break;
        }
        case 'tiles-opened': {
          const { tiles, start_p, end_p } = payload as TilesOpenedMessageType;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'PART');
          break;
        }
        /** Fetches own information only once when connected. */
        case 'my-cursor': {
          const { position, pointer, color, id } = payload as GetMyCusorMessageType;
          setId(id);
          setOringinPosition(position.x, position.y);
          setCursorPosition(position.x, position.y);
          setColor(color.toLowerCase() as CursorColor);
          if (pointer) setClickPosition(pointer.x, pointer.y, '');
          setTimeout(() => setIsInitialized(true), 0);
          break;
        }
        /** Fetches information of other users. */
        case 'you-died': {
          const { revive_at } = payload as ReviveTimeMessageType;
          const leftTime = Math.floor((new Date(revive_at)?.getTime() - Date.now()) / 1000);
          setLeftReviveTime(leftTime);
          break;
        }
        case 'cursors': {
          const { cursors } = payload;
          type newCursorType = { position: XYType; id: string; color: string; pointer: XYType };
          const newCursors = cursors.map(({ position: { x, y }, color, id, pointer }: newCursorType) => {
            color = color.toLowerCase();
            return { id, pointer, x, y, color };
          });
          addCursors(newCursors);
          break;
        }
        case 'cursors-died': {
          const { cursors: deadCursors, revive_at } = payload;
          const revive_time = new Date(revive_at)?.getTime();
          const newCursors = cursors.map((cursor: OtherUserSingleCursorState) => {
            for (const dc of deadCursors as OtherUserSingleCursorState[]) if (cursor.id === dc.id) return { ...cursor, revive_at: revive_time };
            return cursor;
          });
          setCursors(newCursors);
          break;
        }
        /** Receives movement events from other users. */
        case 'moved': {
          const { id, new_position } = payload;
          const { x, y } = new_position;
          const newCursors = cursors.map((cursor: OtherUserSingleCursorState) => (id === cursor.id ? { ...cursor, x, y } : cursor));
          setCursors(newCursors);
          break;
        }
        /** Receives other user's quit */
        case 'cursor-quit': {
          const newCursors = [...cursors];
          const index = newCursors.findIndex((cursor: OtherUserSingleCursorState) => cursor.id === payload.id);
          if (index !== -1) newCursors.splice(index, 1);
          setCursors(newCursors);
          break;
        }
        case 'chat': {
          const { cursor_id, message } = payload;
          const messageTime = Date.now() + MESSAGE_REMAIN_TIME;
          const newCursors = cursors.map((cursor: OtherUserSingleCursorState) =>
            cursor.id === cursor_id ? { ...cursor, message, messageTime } : cursor,
          );
          setCursors(newCursors);
          break;
        }
        case 'error': {
          const { msg } = payload;
          console.error(msg);
          break;
        }
        default:
          console.log('Unknown event:', event);
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
    newTiles.forEach((row, ri) => {
      if (!(ri + offsetY >= 0 && ri + offsetY < cachingTiles.length)) return;
      row.forEach((_, ci) => {
        const targetCol = ci + offsetX;
        if (targetCol >= 0 && targetCol < cachingTiles[ri + offsetY].length) newTiles[ri][ci] = cachingTiles[ri + offsetY][targetCol] || '??';
      });
    });
    setRenderTiles(newTiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingTiles, cursorOriginX, cursorOriginY]);

  /** Reset screen range when cursor position or screen size changes */
  useLayoutEffect(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const tilePaddingWidth = Math.floor((windowWidth * RENDER_RANGE) / newTileSize / 2);
    const tilePaddingHeight = Math.floor((windowHeight * RENDER_RANGE) / newTileSize / 2);

    if (tilePaddingHeight < 1 || tilePaddingWidth < 1) return;
    const createPoint = (baseX: number, baseY: number, type: 'START' | 'END') => ({
      x: type === 'START' ? baseX - tilePaddingWidth : baseX + tilePaddingWidth,
      y: type === 'START' ? baseY - tilePaddingHeight : baseY + tilePaddingHeight,
    });

    setStartPoint(createPoint(cursorX, cursorY, 'START'));
    setEndPoint(createPoint(cursorX, cursorY, 'END'));
    setRenderStartPoint(createPoint(cursorOriginX, cursorOriginY, 'START'));
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
    const body = JSON.stringify({ event: 'set-view-size', payload });
    sendMessage(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, isInitialized, isOpen]);

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

    const handleDiagonalMovement = () => {
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
      }
    };

    const handleStraightMovement = () => {
      if (isRight) requestTiles(rightfrom, endPoint.y, rightto, startPoint.y, Direction.RIGHT);
      if (isLeft) requestTiles(leftfrom, endPoint.y, leftto, startPoint.y, Direction.LEFT);
      if (isDown) requestTiles(startPoint.x, downfrom, endPoint.x, downto, Direction.DOWN);
      if (isUp) requestTiles(startPoint.x, upfrom, endPoint.x, upto, Direction.UP);
    };

    if (!(isRight || isLeft || isUp || isDown)) return;
    if ((isRight || isLeft) && (isUp || isDown)) handleDiagonalMovement();
    else handleStraightMovement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorX, cursorY]);

  /** Send user move event */
  useEffect(() => {
    if (!isInitialized) return;
    const event = 'moving';
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
