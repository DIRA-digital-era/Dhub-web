// src/store/chatSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ChatMessage } from '../types';

const MAX_MESSAGES_PER_THREAD = 100;

function normalize(msg: ChatMessage): ChatMessage {
  return {
    id: msg.id,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    message: msg.message,
    read: msg.read ?? false,
    created_at: msg.created_at,
    threadId: msg.threadId,
  };
}

interface ChatState {
  threads: Record<string, ChatMessage[]>;
  currentChatPeerId?: string; // <-- added to store current selected chat peer
}

const initialState: ChatState = {
  threads: {},
  currentChatPeerId: undefined,
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<{ threadId: string; messages: ChatMessage[] }>) => {
      const { threadId, messages } = action.payload;
      const map = new Map<string, ChatMessage>();
      messages.forEach(m => map.set(m.id, normalize(m)));
      const sorted = Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      state.threads[threadId] = sorted.slice(-MAX_MESSAGES_PER_THREAD);
    },
    addMessage: (state, action: PayloadAction<{ threadId: string; message: ChatMessage }>) => {
      const { threadId, message } = action.payload;
      const norm = normalize(message);
      if (!state.threads[threadId]) state.threads[threadId] = [];
      if (!state.threads[threadId].some(m => m.id === norm.id)) {
        state.threads[threadId].push(norm);
        if (state.threads[threadId].length > MAX_MESSAGES_PER_THREAD) {
          state.threads[threadId] = state.threads[threadId].slice(-MAX_MESSAGES_PER_THREAD);
        }
      }
    },
    clearMessages: (state) => {
      state.threads = {};
      state.currentChatPeerId = undefined;
    },
    setCurrentChatPeerId: (state, action: PayloadAction<string>) => {
      state.currentChatPeerId = action.payload;
    },
  },
});

export const { setMessages, addMessage, clearMessages, setCurrentChatPeerId } = chatSlice.actions;
export default chatSlice.reducer;
