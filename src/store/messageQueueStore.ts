import { SendMessageEvent, SendMessagePayloadType, GetMessageEvent } from '@/types';
import { create } from 'zustand';

export interface QueuedMessage {
  id: string;
  event: SendMessageEvent;
  payload: SendMessagePayloadType;
  priority: number; // 높을수록 우선순위 높음
  waitForResponse?: GetMessageEvent; // 응답을 기다릴 이벤트 타입
  onComplete?: () => void; // 응답 수신 후 실행할 콜백
  timestamp: number;
  retries: number;
  maxRetries: number;
}

interface MessageQueueState {
  queue: QueuedMessage[];
  processing: boolean;
  pendingMessages: Map<string, QueuedMessage>; // 응답 대기 중인 메시지 (id -> message)
  
  // 큐에 메시지 추가
  enqueue: (
    event: SendMessageEvent,
    payload: SendMessagePayloadType,
    options?: {
      priority?: number;
      waitForResponse?: GetMessageEvent;
      onComplete?: () => void;
      maxRetries?: number;
    }
  ) => string; // 메시지 ID 반환
  
  // 큐 처리
  processQueue: () => void;
  
  // 응답 처리
  handleResponse: (event: GetMessageEvent) => void;
  
  // 큐 초기화
  clear: () => void;
  
  // 특정 메시지 제거
  remove: (id: string) => void;
}

const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queue: [],
  processing: false,
  pendingMessages: new Map(),

  enqueue: (event, payload, options = {}) => {
    const {
      priority = 0,
      waitForResponse,
      onComplete,
      maxRetries = 3,
    } = options;

    const id = `${event}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message: QueuedMessage = {
      id,
      event,
      payload,
      priority,
      waitForResponse,
      onComplete,
      timestamp: Date.now(),
      retries: 0,
      maxRetries,
    };

    set(state => {
      const newQueue = [...state.queue, message];
      // 우선순위 순으로 정렬 (높은 우선순위가 먼저)
      newQueue.sort((a, b) => b.priority - a.priority);
      return { queue: newQueue };
    });

    // 큐 처리 시작 (websocketStore는 나중에 주입)
    setTimeout(() => get().processQueue(), 0);

    return id;
  },

  processQueue: (sendMessageFn?: (event: SendMessageEvent, payload: SendMessagePayloadType) => void) => {
    const { queue, processing, pendingMessages } = get();
    
    // 이미 처리 중이거나 큐가 비어있으면 리턴
    if (processing || queue.length === 0) return;

    // 응답을 기다리는 메시지가 있으면 대기
    if (pendingMessages.size > 0) return;

    set({ processing: true });

    const message = queue[0];
    
    // 큐에서 제거
    set(state => ({
      queue: state.queue.filter(m => m.id !== message.id),
    }));

    // 메시지 전송 함수가 제공되면 사용, 없으면 직접 전송
    if (sendMessageFn) {
      sendMessageFn(message.event, message.payload);
      
      // 응답을 기다려야 하는 경우 pendingMessages에 추가
      if (message.waitForResponse) {
        set(state => {
          const newPending = new Map(state.pendingMessages);
          newPending.set(message.id, message);
          return { pendingMessages: newPending };
        });
      } else {
        // 응답을 기다리지 않으면 즉시 완료
        message.onComplete?.();
      }
      
      set({ processing: false });
      setTimeout(() => get().processQueue(sendMessageFn), 0);
      return;
    } else {
      // websocketStore를 동적으로 import
      import('@/store/websocketStore').then(module => {
        const { default: useWebSocketStore } = module;
        const { socket, isOpen } = useWebSocketStore.getState();
        
        if (!isOpen || !socket) {
          console.error('send: WebSocket is closed');
          set({ processing: false });
          return;
        }
        
        const body = {
          header: { event: message.event },
          payload: message.payload,
        };
        
        try {
          socket.send(JSON.stringify(body));
          
          // 응답을 기다려야 하는 경우 pendingMessages에 추가
          if (message.waitForResponse) {
            set(state => {
              const newPending = new Map(state.pendingMessages);
              newPending.set(message.id, message);
              return { pendingMessages: newPending };
            });
          } else {
            // 응답을 기다리지 않으면 즉시 완료
            message.onComplete?.();
          }
        } catch (error) {
          console.error('Failed to send message:', error);
          // 재시도
          if (message.retries < message.maxRetries) {
            message.retries++;
            set(state => ({
              queue: [...state.queue, message].sort((a, b) => b.priority - a.priority),
            }));
          }
        }
        
        set({ processing: false });
        setTimeout(() => get().processQueue(), 0);
      });
      return;
    }
    
    // 응답을 기다려야 하는 경우 pendingMessages에 추가
    if (message.waitForResponse) {
      set(state => {
        const newPending = new Map(state.pendingMessages);
        newPending.set(message.id, message);
        return { pendingMessages: newPending };
      });
    } else {
      // 응답을 기다리지 않으면 즉시 완료
      message.onComplete?.();
    }

    set({ processing: false });
    
    // 다음 메시지 처리
    setTimeout(() => get().processQueue(sendMessageFn), 0);
  },

  handleResponse: (event: GetMessageEvent) => {
    const { pendingMessages } = get();
    
    // 해당 이벤트를 기다리는 메시지 찾기
    for (const [id, message] of pendingMessages.entries()) {
      if (message.waitForResponse === event) {
        // 콜백 실행
        message.onComplete?.();
        
        // pendingMessages에서 제거
        set(state => {
          const newPending = new Map(state.pendingMessages);
          newPending.delete(id);
          return { pendingMessages: newPending };
        });
        
        // 다음 메시지 처리
        setTimeout(() => get().processQueue(), 0);
        return;
      }
    }
  },

  clear: () => {
    set({
      queue: [],
      processing: false,
      pendingMessages: new Map(),
    });
  },

  remove: (id: string) => {
    set(state => ({
      queue: state.queue.filter(m => m.id !== id),
      pendingMessages: (() => {
        const newPending = new Map(state.pendingMessages);
        newPending.delete(id);
        return newPending;
      })(),
    }));
  },
}));

export default useMessageQueueStore;

