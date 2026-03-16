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
  COLORMAP,
  GetColoredTilesStatePayloadType,
  GetBombPositionPayloadType,
} from '@/types';
import { useCursorStore, useOtherUserCursorsStore, OtherCursorState } from '@/store/cursorStore';
import { useRankStore } from '@/store/rankingStore';
import useWebSocketStore from '@/store/websocketStore';

interface UseMessageHandlerOptions {
  getCurrentTileWidthAndHeight: () => { width: number; height: number };
  replaceTiles: (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => Promise<void>;
  replaceColoredTiles: (end_x: number, end_y: number, start_x: number, start_y: number, coloredTilesData: string, myTilesData: string, type: 'All' | 'PART') => Promise<void>;
  replaceBinaryTiles?: (binaryData: Uint8Array) => Promise<void>;
  setLeftReviveTime: (time: number) => void;
  setIsInitialized: (initialized: boolean) => void;
  onExplosion: (position: { x: number; y: number }) => void;
  onBombPosition: (position: { x: number; y: number }, color: number) => void;
}

export default function useMessageHandler(options: UseMessageHandlerOptions) {
  const { getCurrentTileWidthAndHeight, setLeftReviveTime, setIsInitialized, onExplosion, onBombPosition } = options;
  const { replaceTiles, replaceBinaryTiles, replaceColoredTiles } = options;

  // Store hooks - only stable setters, no reactive state in callback deps
  const { sendMessage } = useWebSocketStore();
  const { setRanking } = useRankStore();

  const handleWebSocketMessage = useCallback(
    async (wsMessage: string) => {
      const { MY_CURSOR, CHAT, CURSORS_STATE, EXPLOSION, BOMB_POSITION, QUIT_CURSOR, SCOREBOARD_STATE, TILES_STATE, COLORED_TILES_STATE } = GetMessageEvent;

      // Read current state inside callback to avoid stale closures
      const { position, id: clientCursorId, setPosition, setOriginPosition, setId, setScore, setItems, setColor } = useCursorStore.getState();
      const { cursors: nowCursors, setCursors } = useOtherUserCursorsStore.getState();

      try {
        const { header, payload } = JSON.parse(wsMessage) as GetMessageType;
        const { event } = header;
        switch (event) {
          /** When receiving requested tiles */
          case TILES_STATE: {
            const { tiles_li } = payload as GetTilesStatePayloadType;
            // Process each chunk sequentially so tiles render progressively
            for (const tiles of tiles_li) {
              const { data, range } = tiles;
              const { top_left, bottom_right } = range;
              const { width, height } = getCurrentTileWidthAndHeight();
              const [totalWidth, totalHeight] = [bottom_right.x - top_left.x + 1, top_left.y - bottom_right.y + 1];
              const [resWidth, resHeight] = [(totalWidth / 2) >>> 0, (totalHeight / 2) >>> 0];

              let isAll: 'PART' | 'All' = 'PART';
              if (resWidth === width && resHeight === height) isAll = 'All';
              await replaceTiles(top_left.x, bottom_right.y, bottom_right.x, top_left.y, data, isAll);
            }
            break;
          }
          case COLORED_TILES_STATE: {
            const { colored_tiles_li } = payload as GetColoredTilesStatePayloadType;
            for (const tiles of colored_tiles_li) {
              const { colored_tiles_data, my_tiles_data, range } = tiles;
              const { top_left, bottom_right } = range;
              const { width, height } = getCurrentTileWidthAndHeight();
              const [totalWidth, totalHeight] = [bottom_right.x - top_left.x + 1, top_left.y - bottom_right.y + 1];
              const [resWidth, resHeight] = [(totalWidth / 2) >>> 0, (totalHeight / 2) >>> 0];

              let isAll: 'PART' | 'All' = 'PART';
              if (resWidth === width && resHeight === height) isAll = 'All';
              await replaceColoredTiles(top_left.x, bottom_right.y, bottom_right.x, top_left.y, colored_tiles_data, my_tiles_data, isAll);
            }
            break;
          }
          case EXPLOSION: {
            // The Explosion event is applied on all the cursor in the view.
            const { position: explode_position } = payload as GetExplosionPayloadType; // It should be changed tile content to 'B'
            const { x, y } = explode_position;
            console.log('explosion position', explode_position);

            // Trigger shockwave animation for ALL explosions in view
            onExplosion(explode_position);

            // Stun only if cursor is within 3x3 impact zone
            const { x: cursorX, y: cursorY } = position;
            if (cursorX >= x - 1 && cursorX <= x + 1 && cursorY >= y - 1 && cursorY <= y + 1) {
              console.log('explosion', performance.now());
              setLeftReviveTime(10);
            }
            break;
          }
          case BOMB_POSITION: {
            const { position: bombPos, color: bombColor } = payload as GetBombPositionPayloadType;
            onBombPosition(bombPos, bombColor);
            break;
          }
          case SCOREBOARD_STATE: {
            const { scoreboard } = payload as GetScoreboardPayloadType;
            setRanking(Object.entries(scoreboard).map(([ranking, score]) => ({ ranking: +ranking, score })));
            const colors = Object.values(COLORMAP).filter(v => v !== COLORMAP.NONE);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const windowSize: SendCreateCursorPayloadType = { ...getCurrentTileWidthAndHeight(), color };
            if (!clientCursorId) sendMessage(SendMessageEvent.CREATE_CURSOR, windowSize);
            break;
          }
          case CURSORS_STATE: {
            const { cursors } = payload as GetCursorStatePayloadType;

            // Build Map from server data for O(1) lookups
            const serverMap = new Map<string, OtherCursorState>();
            for (const cursor of cursors) {
              if (cursor.id === clientCursorId) {
                // Handle own cursor
                setColor(cursor.color);
                setScore(cursor.score);
                setItems(cursor.items);
                setPosition(cursor.position);
                setOriginPosition(cursor.position);
                continue;
              }
              serverMap.set(cursor.id, {
                color: cursor.color,
                id: cursor.id,
                position: cursor.position,
                message: '',
                messageTime: 0,
                pointer: { x: Infinity, y: Infinity },
                score: cursor.score,
                revive_at: new Date(cursor.active_at).getTime(),
                items: cursor.items,
              });
            }

            // Merge: update existing + add new cursors in O(n + m)
            const result: OtherCursorState[] = [];
            const seen = new Set<string>();
            for (const existing of nowCursors) {
              const updated = serverMap.get(existing.id);
              if (updated) {
                result.push(updated);
                seen.add(existing.id);
              } else result.push(existing);
            }
            for (const [id, cursor] of serverMap) if (!seen.has(id)) result.push(cursor);
            setCursors(result);
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
            const updatedCursors = nowCursors.map(cursor => {
              if (cursor.id !== id) return cursor;
              return { ...cursor, message, messageTime: Date.now() + 1000 * 8 };
            });
            setCursors(updatedCursors);
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
    [replaceTiles, replaceColoredTiles, setLeftReviveTime, setIsInitialized, getCurrentTileWidthAndHeight, sendMessage, setRanking, onExplosion, onBombPosition],
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
