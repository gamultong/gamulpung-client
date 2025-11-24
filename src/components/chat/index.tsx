'use client';
import S from './style.module.scss';
import { CSSProperties, useEffect, useRef, useState } from 'react';

import useWebSocketStore from '@/store/websocketStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useScreenSize from '@/hooks/useScreenSize';
import { SendMessageEvent } from '@/types';

export default function ChatComponent() {
  /** constants */
  const REMAIN_TIME = 8 * 1000; // 8 seconds
  const MAX_MESSAGE_LENGTH = 40;
  const SET_NOW_INTERVAL = 1000;

  /** states */
  const [message, setMessage] = useState('');
  const [messageWidth, setMessageWidth] = useState(0);
  const [startChatTime, setStartChatTime] = useState<number | null>(0);
  const [now, setNow] = useState(Date.now());

  /** stores */
  const { sendMessage } = useWebSocketStore();
  const { color, originX, originY, zoom } = useCursorStore();
  const { cursors } = useOtherUserCursorsStore();
  const { windowHeight, windowWidth } = useScreenSize();

  /** references */
  const inputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  const getOpacity = (messageTime: number | null) =>
    messageTime ? (messageTime - now > REMAIN_TIME / 2 ? 1 : (messageTime - now) / (REMAIN_TIME / 2)) : 0;

  /** styles */
  const clientStyle: CSSProperties = {
    left: '51%',
    top: '51%',
    backgroundColor: color,
    opacity: getOpacity(startChatTime),
  };

  // 메모리 최적화: 불필요한 getBoundingClientRect 호출 제거
  useEffect(() => {
    if (!messageRef.current || !message) return;
    // requestAnimationFrame으로 DOM 업데이트 최적화
    const rafId = requestAnimationFrame(() => {
      if (messageRef.current) {
        setMessageWidth(messageRef.current.getBoundingClientRect().width);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [message]);

  const handleKeyEvent = (event: KeyboardEvent) => {
    /** Start Chat */
    if (event.key === 'Enter') inputRef.current?.focus();
    /** End Chat */
    if (event.key === 'Escape') {
      setMessage('');
      setStartChatTime(null);
    }
  };

  /** Send chat message to server */
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStartChatTime(Date.now() + REMAIN_TIME);
    if (message === '' || (startChatTime as number) < now) return;
    /** Send message using websocket. */
    const payload = { message };
    const event = SendMessageEvent.CHAT;
    const body = JSON.stringify({ event, payload });
    sendMessage(body);
    setMessage('');
  };

  const ChangingMessage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    setStartChatTime(Date.now() + REMAIN_TIME);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyEvent);
    return () => window.removeEventListener('keydown', handleKeyEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => setNow(Date.now()), SET_NOW_INTERVAL);
  }, [now]);

  return (
    <>
      <form className={S.chat} onSubmit={onSubmit} style={clientStyle}>
        <input
          type="text"
          ref={inputRef}
          className={S.message}
          value={message}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={ChangingMessage}
          style={{ width: `${messageWidth + 5}px`, color: color === 'yellow' ? 'black' : 'white' }}
        />
        <div ref={messageRef} aria-hidden>
          {message}
        </div>
      </form>
      {cursors.map((cursor, index) => (
        <div
          key={`${cursor.id}-${index}`}
          className={S.chat}
          style={{
            left: `${windowWidth / 2 + (cursor.x - originX - 1 / zoom / 2) * zoom * 80}px`,
            top: `${windowHeight / 2 + (cursor.y - originY - 1 / zoom / 2) * zoom * 80}px`,
            backgroundColor: cursor.color,
            color: cursor.color === 'yellow' ? 'black' : 'white',
            opacity: getOpacity(cursor.messageTime),
          }}
        >
          {cursor.message}
        </div>
      ))}
    </>
  );
}
