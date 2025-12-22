import { SendMessageEvent, SendMessagePayloadType, SendMessageType } from '@/types';
import { create } from 'zustand';

interface WebSocketState {
  socket: WebSocket | null;
  isOpen: boolean;
  connect: (url: string) => WebSocket;
  disconnect: () => void;
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => void;
  message: string;
}

const useWebSocketStore = create<WebSocketState>(set => ({
  socket: null,
  message: '',
  isOpen: false,
  connect: (url: string): WebSocket => {
    const socket = new WebSocket(url);
    socket.onopen = () => {
      console.info('WebSocket is opened');
      set({ socket, isOpen: true });
    };
    socket.onclose = () => {
      console.info('WebSocket is closed');
      set({ socket: null, isOpen: false });
    };
    socket.onmessage = event => set({ message: event.data });
    return socket;
  },
  disconnect: () => {
    const { socket } = useWebSocketStore.getState();
    socket?.close();
    set({ socket: null, isOpen: false });
    console.info('WebSocket is closed');
  },
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => {
    const { socket, isOpen } = useWebSocketStore.getState();
    const body: SendMessageType = { header: { event }, payload };
    if (isOpen && socket) socket.send(JSON.stringify(body));
    else console.error('WebSocket is closed');
  },
}));

export default useWebSocketStore;
