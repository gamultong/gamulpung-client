'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useState } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { CursorState, useCursorStore, useOtherUserCursorsStore } from '../../store/cursorStore';

/** components */
import CanvasRenderer from '@/components/canvas';
import useClickStore from '@/store/clickStore';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';

interface Point {
  x: number;
  y: number;
}

export default function Play() {
  /** constants */
  const renderRange = 2;
  const originTileSize = 80;
  const webSocketUrl = `${process.env.NEXT_PUBLIC_WS_HOST}/session`;

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
        case 'U':
          for (let i = 0; i < columnlength; i++) {
            newTiles.unshift([...Array(rowlength).fill('??')]);
            newTiles.pop();
          }
          break;
        case 'D':
          for (let i = 0; i < columnlength; i++) {
            newTiles.push([...Array(rowlength).fill('??')]);
            newTiles.shift();
          }
          break;
        case 'L':
          for (let i = 0; i < columnlength; i++) newTiles[i] = [...Array(rowlength).fill('??'), ...newTiles[i].slice(0, -1)];
          break;
        case 'R':
          for (let i = 0; i < columnlength; i++) newTiles[i] = [...newTiles[i].slice(rowlength, newTiles[0].length), ...Array(rowlength).fill('??')];
          break;
        case 'A':
          newTiles = Array.from({ length: columnlength }, () => Array.from({ length: rowlength }, () => '??'));
      }
      return newTiles;
    });

    const body = JSON.stringify({
      event: 'fetch-tiles',
      payload: {
        start_p: { x: start_x, y: start_y },
        end_p: { x: end_x, y: end_y },
      },
    });
    sendMessage(body);
    return;
  };

  /** Disconnect websocket when Component has been unmounted */
  useEffect(() => {
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
      connect(webSocketUrl + `?view_width=${view_width}&view_height=${view_height}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint, endPoint]);

  /** Parse Hex using two charactors
   * @param hex {string} - Hex string
   */
  const parseHex = (hex: string) => {
    const hexArray = hex.match(/.{1,2}/g);
    if (!hexArray) return '';
    // hex to byte
    const byte = hexArray.map(hex => parseInt(hex, 16).toString(2).padStart(8, '0')).join('');
    // byte 0 - IsOpen, 1 - IsMine, 2 - IsFlag, 3 ~ 4 color, 5 ~ 7 number of mines
    const isTileOpened = byte[0] === '1';
    const isMine = byte[1] === '1';
    const isFlag = byte[2] === '1';
    const color = parseInt(byte.slice(3, 5), 2).toString(); /** 00 red, 01 yellow, 10 blue, 11 purple */
    const number = parseInt(byte.slice(5), 2);
    if (isTileOpened) return isMine ? 'B' : number === 0 ? 'O' : number.toString();
    if (isFlag) return 'F' + color;
    return 'C';
  };

  const sortTiles = (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string) => {
    const [rowlength, columnlength] = [Math.abs(end_x - start_x + 1) * 2, Math.abs(start_y - end_y + 1)];
    const sortedTiles: string[][] = [];
    for (let i = 0; i < columnlength; i++) {
      const tempTilelist = [] as string[];
      const sortedlist = unsortedTiles.slice(i * rowlength, (i + 1) * rowlength);
      for (let j = 0; j < rowlength / 2; j++) {
        const hex = sortedlist.slice(j * 2, j * 2 + 2);
        tempTilelist[j] = parseHex(hex);
      }
      sortedTiles[i] = tempTilelist;
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
    for (let i = 0; i < columnlength; i++) {
      let rowIndex = i;
      /** Move down only when receiving tiles from below. */
      if (type === 'All' && cursorY < end_y) rowIndex += endPoint.y - startPoint.y - columnlength + 1;
      if (type === 'PART') rowIndex += end_y - startPoint.y;
      newTiles[rowIndex] = newTiles[rowIndex] ?? [];
      for (let j = 0; j < rowlength; j++) {
        let tile = sortedTiles[i][j];
        if (['C', 'F'].some(c => tile?.includes(c))) {
          tile += (i - end_y + j - start_x) % 2 === 0 ? '0' : '1';
        }
        if (tile) newTiles[rowIndex][j + start_x - startPoint.x] = tile;
      }
    }
    setCachingTiles(newTiles);
  };

  /** Handling Websocket Message */
  useEffect(() => {
    if (!message) return;
    try {
      const { event, payload } = JSON.parse(message as string);
      switch (event) {
        /** When receiving requested tiles */
        case 'tiles': {
          const { tiles, start_p, end_p } = payload;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'All');
          break;
        }
        /** When receiving unrequested tiles when sending tile open event */
        case 'flag-set': {
          const { position, is_set, color } = payload;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          newTiles[y - startPoint.y][x - startPoint.x] = (is_set ? 'F' + color : 'C') + ((x + y) % 2 === 0 ? '0' : '1');
          setCachingTiles(newTiles);
          break;
        }
        case 'single-tile-opened': {
          const { position, tile } = payload;
          const { x, y } = position;
          const newTiles = [...cachingTiles];
          newTiles[y - startPoint.y][x - startPoint.x] = parseHex(tile);
          setCachingTiles(newTiles);
          break;
        }
        case 'tiles-opened': {
          const { tiles, start_p, end_p } = payload;
          const { x: start_x, y: start_y } = start_p;
          const { x: end_x, y: end_y } = end_p;
          replaceTiles(end_x, end_y, start_x, start_y, tiles, 'PART');
          break;
        }
        /** Fetches own information only once when connected. */
        case 'my-cursor': {
          const { position, pointer, color } = payload;
          setOringinPosition(position.x, position.y);
          setCursorPosition(position.x, position.y);
          setColor(color.toLowerCase());
          if (pointer) setClickPosition(pointer.x, pointer.y, '');
          setTimeout(() => setIsInitialized(true), 0);
          break;
        }
        /** Fetches information of other users. */
        case 'you-died': {
          const { revive_at } = payload;
          const leftTime = Math.floor((new Date(revive_at)?.getTime() - Date.now()) / 1000);
          setLeftReviveTime(leftTime);
          break;
        }
        case 'cursors': {
          const { cursors } = payload;
          const newCursors = cursors.map(({ position: { x, y }, color }: { position: { x: number; y: number }; color: string }) => ({
            x,
            y,
            color: color.toLowerCase(),
          }));
          addCursors(newCursors);
          break;
        }
        case 'cursors-died': {
          const { cursors: deadCursors, revive_at } = payload;
          const revive_time = new Date(revive_at)?.getTime();
          const newCursors = cursors.map(({ x, y, color }) => {
            for (const deadCursor of deadCursors) {
              if (deadCursor.position.x === x && deadCursor.position.y === y) {
                return { x, y, color, revive_at: revive_time };
              }
            }
            return { x, y, color };
          });
          setCursors(newCursors);
          break;
        }
        /** Receives movement events from other users. */
        case 'moved': {
          const { origin_position, new_position, color } = payload;
          const { x: originX, y: originY } = origin_position;
          const { x: newX, y: newY } = new_position;
          const newCursors = cursors.map((cursor: CursorState) => {
            const { x, y, color: cursorColor } = cursor;
            if (x === originX && y === originY && cursorColor === color.toLowerCase()) {
              return { x: newX, y: newY, color: color.toLowerCase() };
            }
            return cursor;
          });
          setCursors(newCursors);
          break;
        }
        /** Receives other user's quit */
        case 'cursor-quit': {
          const { color, position } = payload;
          const newCursors = [...cursors];
          const index = newCursors.findIndex((cursor: CursorState) => {
            const { x, y, color: cursorColor } = cursor;
            return x === position.x && y === position.y && cursorColor === color.toLowerCase();
          });
          if (index !== -1) newCursors.splice(index, 1);
          setCursors(newCursors);
          break;
        }
        case 'send-chat': {
          const { position, message, color } = payload;
          const { x, y } = position;
          console.log(x, y, message, color);
          break;
        }
        case 'error': {
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
  useEffect(() => {
    const newTiles = [...cachingTiles.map(row => [...row.map(() => '??')])];
    for (let i = 0; i < cachingTiles.length; i++) {
      const rowIndex = i + cursorOriginY - cursorY;
      for (let j = 0; j < cachingTiles[i].length; j++) {
        const columnIndex = j + cursorOriginX - cursorX;
        if (!cachingTiles[rowIndex]?.[columnIndex]) continue;
        newTiles[i][j] = cachingTiles[rowIndex]?.[columnIndex] || '??';
      }
    }
    setRenderTiles(newTiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingTiles, cursorOriginX, cursorOriginY]);

  /** Reset screen range when cursor position or screen size changes */
  useEffect(() => {
    const newTileSize = originTileSize * zoom;
    const [tilePaddingWidth, tilePaddingHeight] = [
      Math.floor((windowWidth * renderRange) / newTileSize / 2),
      Math.floor((windowHeight * renderRange) / newTileSize / 2),
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
  }, [windowWidth, windowHeight, zoom, cursorOriginX, cursorOriginY, cursorX, cursorY, renderRange, isInitialized]);

  /** Handling zoom event */
  useEffect(() => {
    if (!isInitialized) return;
    const newTileSize = originTileSize * zoom;
    const [tileVisibleWidth, tileVisibleHeight] = [
      Math.floor((windowWidth * renderRange) / newTileSize),
      Math.floor((windowHeight * renderRange) / newTileSize),
    ];

    const [tilePaddingWidth, tilePaddingHeight] = [Math.floor(tileVisibleWidth / 2), Math.floor(tileVisibleHeight / 2)];
    let [heightReductionLength, widthReductionLength] = [0, 0];
    if (tileVisibleWidth > endPoint.x - startPoint.x + 1 || tileVisibleHeight > endPoint.y - startPoint.y + 1) {
      /** Request for expanded entire tiles */
      heightReductionLength = Math.floor(tilePaddingHeight - (endPoint.y - startPoint.y) / 2);
      widthReductionLength = Math.round(tilePaddingWidth - (endPoint.x - startPoint.x) / 2);
    } else {
      /** Request for reduced entire tiles */
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
    const body = JSON.stringify({
      event: 'set-view-size',
      payload: {
        width: Math.floor(Math.floor((windowWidth * renderRange) / newTileSize)),
        height: Math.floor(Math.floor((windowHeight * renderRange) / newTileSize)),
      },
    });
    sendMessage(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, renderRange, isInitialized]);

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
    const body = JSON.stringify({
      event: 'moving',
      payload: {
        position: {
          x: cursorOriginX,
          y: cursorOriginY,
        },
      },
    });
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
      <CanvasDashboard />
      <CanvasRenderer
        leftReviveTime={leftReviveTime}
        paddingTiles={renderRange}
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
