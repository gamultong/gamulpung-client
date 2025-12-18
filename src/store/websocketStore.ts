import { SendMessageEvent, SendMessagePayloadType, SendMessageType } from '@/types';
import { create } from 'zustand';

interface WebSocketState {
  socket: WebSocket | null;
  isOpen: boolean;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => void;
  message: string;
}

const useWebSocketStore = create<WebSocketState>(set => ({
  socket: null,
  message: '',
  isOpen: false,
  connect: (url: string) => {
    const socket = new WebSocket(url);
    socket.onopen = () => set({ socket, isOpen: true });
    socket.onclose = () => set({ socket: null, isOpen: false });
    socket.onmessage = event => set({ message: event.data });
  },
  disconnect: () => {
    const { socket } = useWebSocketStore.getState();
    socket?.close();
    set({ socket: null, isOpen: false });
  },
  sendMessage: (event: SendMessageEvent, payload: SendMessagePayloadType) => {
    const { socket, isOpen } = useWebSocketStore.getState();
    const body: SendMessageType = {
      header: { event },
      payload,
    };
    if (isOpen && socket) socket.send(JSON.stringify(body));
    // Removed unnecessary set({}) that was causing infinite loops
  },
}));

export default useWebSocketStore;
