'use client';
import S from './style.module.scss';
import { CSSProperties, useEffect, useRef, useState } from 'react';

import useWebSocketStore from '@/store/websocketStore';

interface ChatProps {
  isClient: boolean;
  color: 'red' | 'blue' | 'yellow' | 'purple';
  x?: number;
  y?: number;
  msg?: string;
}

export default function ChatComponent({ isClient, x, y, color, msg }: ChatProps) {
  /** constants */
  const seconds = 8;

  /** states */
  const [message, setMessage] = useState(msg || '');
  const [messageWidth, setMessageWidth] = useState(0);
  const [countDown, setCountDown] = useState(0);

  /** stores */
  const { sendMessage } = useWebSocketStore();

  /** references */
  const inputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const countDownTimeoutRef = useRef<NodeJS.Timeout>();

  /** styles */
  const clientStyle: CSSProperties = {
    left: '51%',
    top: '51%',
    backgroundColor: color,
    opacity: countDown > seconds / 2 ? 1 : countDown / (seconds / 2),
  };
  const otherStyle: CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    backgroundColor: color,
  };

  useEffect(() => {
    if (messageRef.current) setMessageWidth(messageRef?.current.getBoundingClientRect().width);
  }, [message]);

  useEffect(() => {
    clearTimeout(countDownTimeoutRef.current);
    if (countDown > 0) countDownTimeoutRef.current = setTimeout(() => setCountDown(countDown - 1), 1000);
  }, [countDown]);

  const handleKeyEvent = (event: KeyboardEvent) => {
    /** Start Chat */
    if (event.key === 'Enter' && isClient) {
      setCountDown(seconds);
      inputRef.current?.focus();
    }
    /** End Chat */
    if (event.key === 'Escape' && isClient) {
      setMessage('');
      setCountDown(0);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyEvent);
    return () => window.removeEventListener('keydown', handleKeyEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Send chat message to server */
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message === '' || countDown <= 0) return;
    /** Send message using websocket. */
    const body = JSON.stringify({
      event: 'send-chat',
      payload: {
        message: message,
      },
    });
    sendMessage(body);
    setMessage('');
  };

  const ChangingMessage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    setCountDown(seconds);
  };

  return (
    <>
      {isClient && (
        <form className={S.chat} onSubmit={onSubmit} style={clientStyle}>
          <input
            type="text"
            ref={inputRef}
            className={S.message}
            value={message}
            maxLength={40}
            onChange={ChangingMessage}
            style={{ width: `${messageWidth + 5}px`, color: color === 'yellow' ? 'black' : 'white' }}
          />
          <div ref={messageRef} aria-hidden>
            {message}
          </div>
        </form>
      )}
      {!isClient && (
        <div className={S.chat} style={otherStyle}>
          <p className={S.message}>{message}</p>
        </div>
      )}
    </>
  );
}
