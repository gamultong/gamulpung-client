import { create } from 'zustand';

interface WebSocketState {
  socket: WebSocket | null;
  isOpen: boolean;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (message: string) => void;
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
  sendMessage: (message: string) => {
    if (!message) return;
    const { socket, isOpen } = useWebSocketStore.getState();
    if (isOpen) socket?.send(message);
    set({}); // Update the message state
  },
}));

export default useWebSocketStore;
