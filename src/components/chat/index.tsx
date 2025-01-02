'use client';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import S from './style.module.scss';

interface ChatProps {
  isClient: boolean;
  color: 'red' | 'blue' | 'yellow' | 'purple';
  x?: number;
  y?: number;
  msg?: string;
}
export default function Chat({ isClient, x, y, color, msg }: ChatProps) {
  const [message, setMessage] = useState(msg || '');
  const [messageWidth, setMessageWidth] = useState(0);
  const [countDown, setCountDown] = useState(0);
  const seconds = 8;

  const inputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const countDownTimeoutRef = useRef<NodeJS.Timeout>();

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
    if (countDown > 0) {
      countDownTimeoutRef.current = setTimeout(() => setCountDown(countDown - 1), 1000);
    }
  }, [countDown]);

  const startChat = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && isClient) {
      setCountDown(seconds);
      inputRef.current?.focus();
    }
    if (event.key === 'Escape' && isClient) {
      setMessage('');
      setCountDown(0);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', startChat);
    return () => window.removeEventListener('keydown', startChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message === '' || countDown <= 0) return;
    /** Send message using websocket. */
    setMessage('');
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            onChange={onChange}
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
