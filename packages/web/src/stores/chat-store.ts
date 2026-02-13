/**
 * Chat Store - Chat state management for mobile PWA
 * Aligned with @ahri/shared AhriApiClient methods and types.
 */

import { create } from 'zustand';
import type { ChatMessage, ChatRequest, SessionSummary, SessionDetail } from '@ahri/shared';
import { api } from '../api/client';

type LlmModel = 'PRO' | 'GOOGLE' | 'DEEPSEEK' | 'LOCAL';

interface ChatState {
  // State
  sessions: SessionSummary[];
  activeSessionId: number | null;
  messages: ChatMessage[];
  model: LlmModel;
  isStreaming: boolean;
  isLoading: boolean;

  // Actions
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  loadSession: (sessionId: number) => Promise<void>;
  deleteSession: (sessionId: number) => Promise<void>;
  renameSession: (sessionId: number, newTitle: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  setModel: (model: LlmModel) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  sessions: [],
  activeSessionId: null,
  messages: [],
  model: 'PRO',
  isStreaming: false,
  isLoading: false,

  // Load all sessions (api.listSessions)
  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await api.listSessions();
      set({ sessions, isLoading: false });
    } catch (error) {
      console.error('[Chat] Failed to load sessions:', error);
      set({ isLoading: false });
    }
  },

  // Create new session
  createSession: async (title = 'Novo Chat') => {
    set({ isLoading: true });
    try {
      const session = await api.createSession(title);
      set({
        sessions: [session, ...get().sessions],
        activeSessionId: session.id,
        messages: [],
        isLoading: false
      });
    } catch (error) {
      console.error('[Chat] Failed to create session:', error);
      set({ isLoading: false });
    }
  },

  // Load session with messages (api.getSession returns SessionDetail)
  loadSession: async (sessionId: number) => {
    set({ isLoading: true, activeSessionId: sessionId });
    try {
      const detail: SessionDetail = await api.getSession(sessionId);
      set({ messages: detail.messages, isLoading: false });
    } catch (error) {
      console.error('[Chat] Failed to load session:', error);
      set({ isLoading: false });
    }
  },

  // Delete session
  deleteSession: async (sessionId: number) => {
    try {
      await api.deleteSession(sessionId);
      const sessions = get().sessions.filter((s) => s.id !== sessionId);
      set({ sessions });

      if (get().activeSessionId === sessionId) {
        set({ activeSessionId: null, messages: [] });
      }
    } catch (error) {
      console.error('[Chat] Failed to delete session:', error);
    }
  },

  // Rename session
  renameSession: async (sessionId: number, newTitle: string) => {
    try {
      await api.renameSession(sessionId, newTitle);
      const sessions = get().sessions.map((s) =>
        s.id === sessionId ? { ...s, title: newTitle } : s
      );
      set({ sessions });
    } catch (error) {
      console.error('[Chat] Failed to rename session:', error);
    }
  },

  // Send message via HTTP (api.sendMessage takes ChatRequest)
  sendMessage: async (content: string) => {
    const { model, messages } = get();

    // Add user message optimistically
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      images: [],
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      meta: {},
    };

    set({ messages: [...messages, userMessage], isStreaming: true });

    try {
      // TODO: Implement WebSocket streaming for PWA
      const chatReq: ChatRequest = {
        message: content,
        images: [],
        mode: 'default',
        model,
      };
      const response = await api.sendMessage(chatReq);

      set({
        messages: [...get().messages, response.message],
        isStreaming: false
      });
    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `[Erro] Falha ao enviar mensagem: ${error}`,
        images: [],
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        meta: { error: true },
      };
      set({
        messages: [...get().messages, errorMsg],
        isStreaming: false
      });
    }
  },

  // Change model
  setModel: (model: LlmModel) => {
    set({ model });
  },

  // Clear messages (new chat)
  clearMessages: () => {
    set({ messages: [], activeSessionId: null });
  }
}));
