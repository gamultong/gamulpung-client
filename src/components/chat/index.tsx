'use client';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import S from './style.module.scss';

interface ChatProps {
  isClient: boolean;
  color: 'red' | 'blue' | 'yellow' | 'purple';
  x?: number;
  y?: number;
}
export default function Chat({ isClient, x, y, color }: ChatProps) {
  const [message, setMessage] = useState('hello');
  const [messageWidth, setMessageWidth] = useState(0);
  const clientStyle: CSSProperties = {
    left: '51%',
    top: '51%',
    backgroundColor: color,
  };
  const otherStyle: CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    backgroundColor: color,
  };
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (messageRef.current) {
      setMessageWidth(messageRef?.current.getBoundingClientRect().width);
    }
  }, [message]);
  return (
    <div className={S.chat} style={isClient ? clientStyle : otherStyle}>
      <input
        type="text"
        value={message}
        autoFocus={isClient}
        disabled={!isClient}
        maxLength={50}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
        style={{ width: `${messageWidth}px` }}
      />
      <div ref={messageRef} aria-hidden>
        {message}
      </div>
    </div>
  );
}
