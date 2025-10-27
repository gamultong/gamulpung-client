'use client';
import { useLayoutEffect } from 'react';
import useWebSocketStore from '@/store/websocketStore';

export default function useMessageProcess(processFunction: (message: string) => void) {
  // settting the width and height of the screen as initial values
  const { message } = useWebSocketStore();

  /** Handling Websocket Message */
  useLayoutEffect(() => {
    if (!message) return;
    processFunction(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);
}
