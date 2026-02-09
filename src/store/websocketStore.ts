import { SendMessageEvent, SendMessagePayloadType, SendMessageType } from '@/types';
import { create } from 'zustand';

interface WebSocketState {
  socket: WebSocket | null;
  isOpen: boolean;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => void;
  message: string;
  binaryMessage: ArrayBuffer | null;
}

const useWebSocketStore = create<WebSocketState>(set => ({
  socket: null,
  message: '',
  binaryMessage: null,
  isOpen: false,
  connect: (url: string) => {
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer'; // Enable binary frame reception
    socket.onopen = () => {
      console.info('connect: WebSocket is opened');
      set({ socket, isOpen: true });
    };
    socket.onclose = () => {
      console.info('server closed: WebSocket is closed');
      set({ socket: null, isOpen: false });
    };
    socket.onmessage = event => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame (future: server sends 1-byte-per-tile data)
        set({ binaryMessage: event.data });
      } else {
        // Text frame (current: JSON with hex-encoded tiles)
        set({ message: event.data });
      }
    };
  },
  disconnect: () => {
    const { socket } = useWebSocketStore.getState();
    socket?.close();
    set({ socket: null, isOpen: false });
    console.info('disconnect: WebSocket is closed');
  },
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => {
    const { socket, isOpen } = useWebSocketStore.getState();
    const body: SendMessageType = { header: { event }, payload };
    if (isOpen && socket) socket.send(JSON.stringify(body));
    else console.error('send: WebSocket is closed');
  },
}));

export default useWebSocketStore;
