'use client';
import { useCallback, useLayoutEffect } from 'react';
import {
  GetMessageEvent,
  GetMessageType,
  GetTilesStatePayloadType,
  GetExplosionPayloadType,
  GetScoreboardPayloadType,
  GetCursorStatePayloadType,
  CursorIdType,
  GetChatPayloadType,
  SendMessageEvent,
  SendCreateCursorPayloadType,
} from '@/types';
import { useCursorStore, useOtherUserCursorsStore, OtherCursorState } from '@/store/cursorStore';
import { useRankStore } from '@/store/rankingStore';
import useWebSocketStore from '@/store/websocketStore';

interface UseMessageHandlerOptions {
  getCurrentTileWidthAndHeight: () => { width: number; height: number };
  replaceTiles: (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => Promise<void>;
  replaceBinaryTiles?: (binaryData: Uint8Array) => Promise<void>;
  setLeftReviveTime: (time: number) => void;
  setIsInitialized: (initialized: boolean) => void;
}

export default function useMessageHandler(options: UseMessageHandlerOptions) {
  const { getCurrentTileWidthAndHeight, replaceTiles, replaceBinaryTiles, setLeftReviveTime, setIsInitialized } = options;

  // Store hooks
  const { setCursors, cursors: nowCursors } = useOtherUserCursorsStore();
  const { sendMessage } = useWebSocketStore();
  const { position, setPosition, setOriginPosition, setId, id: clientCursorId, setScore, setItems } = useCursorStore();
  const { setRanking } = useRankStore();

  const handleWebSocketMessage = useCallback(
    async (wsMessage: string) => {
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
            await Promise.all(promises);
            break;
          }
          case EXPLOSION: {
            // The Explosion event is applied on all the cursor in the view.
            const { position: explode_position } = payload as GetExplosionPayloadType; // It should be changed tile content to 'B'
            const { x, y } = explode_position;
            const { x: cursorX, y: cursorY } = position;
            if (cursorX >= x - 1 && cursorX <= x + 1 && cursorY >= y - 1 && cursorY <= y + 1) {
              console.log('explosion', performance.now());
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
              items: cursor.items,
            }));
            // find client cursor
            const getCursors = newCursors.filter(cursor => cursor.id !== clientCursorId);
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
              setItems(myCursor.items);
              // console.log('mycursor', position, performance.now());
              // if (!(position.x === cursorPosition.x && position.y === cursorPosition.y)) {
              setPosition(position);
              setOriginPosition(position);
              // }
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replaceTiles, position, clientCursorId, nowCursors],
  );

  /** Handle binary WebSocket frames (future: server sends 1-byte-per-tile data) */
  const handleBinaryMessage = useCallback(
    async (buffer: ArrayBuffer) => {
      if (!replaceBinaryTiles) return;
      try {
        const data = new Uint8Array(buffer);
        await replaceBinaryTiles(data);
      } catch (e) {
        console.error('Binary message error:', e);
      }
    },
    [replaceBinaryTiles],
  );

  // Handle text WebSocket messages
  const { message } = useWebSocketStore();
  useLayoutEffect(() => {
    if (!message) return;
    handleWebSocketMessage(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  // Handle binary WebSocket messages
  const { binaryMessage } = useWebSocketStore();
  useLayoutEffect(() => {
    if (!binaryMessage) return;
    handleBinaryMessage(binaryMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binaryMessage]);
}
