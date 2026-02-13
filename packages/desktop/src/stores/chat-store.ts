import { create } from 'zustand';
import type { ChatMessage, SessionSummary } from '@ahri/shared';
import { api } from '@/api/client';
import { chatWs } from '@/api/websocket';

type LlmModel = 'PRO' | 'GOOGLE' | 'DEEPSEEK' | 'LOCAL';

export interface Attachment {
  type: 'image' | 'video' | 'pdf';
  data: string; // base64
  name: string;
  preview?: string; // data URL for images
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  activeSessionId: number | null;
  sessions: SessionSummary[];
  model: LlmModel;
  memoryNotifications: string[];

  // Actions
  setModel: (model: LlmModel) => void;
  fetchSessions: (persona?: string) => Promise<void>;
  loadSession: (id: number) => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
  renameSession: (id: number, title: string) => Promise<void>;
  sendMessage: (message: string, attachments?: Attachment[], mode?: 'default' | 'web_search' | 'lore_search') => Promise<void>;
  sendMessageStreaming: (message: string, attachments?: Attachment[], mode?: 'default' | 'web_search' | 'lore_search') => Promise<void>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  activeSessionId: null,
  sessions: [],
  model: 'PRO',
  memoryNotifications: [],

  setModel: (model) => set({ model }),

  fetchSessions: async (persona) => {
    try {
      const sessions = await api.listSessions(persona);
      set({ sessions });
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  },

  loadSession: async (id) => {
    try {
      const detail = await api.getSession(id);
      set({
        activeSessionId: id,
        messages: detail.messages,
      });
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  },

  createSession: async (title) => {
    try {
      const session = await api.createSession(title);
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessionId: session.id,
        messages: [],
      }));
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id);
      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== id);
        const isActive = state.activeSessionId === id;
        return {
          sessions,
          activeSessionId: isActive ? null : state.activeSessionId,
          messages: isActive ? [] : state.messages,
        };
      });
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  },

  renameSession: async (id, title) => {
    try {
      await api.renameSession(id, title);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, title } : s,
        ),
      }));
    } catch (e) {
      console.error('Failed to rename session:', e);
    }
  },

  // HTTP (non-streaming) fallback
  sendMessage: async (message, attachments = [], mode = 'default') => {
    const { model } = get();

    // Extrai images, video, pdfs
    const images = attachments.filter(a => a.type === 'image').map(a => a.data);
    const video = attachments.find(a => a.type === 'video');
    const pdfs = attachments.filter(a => a.type === 'pdf');

    // Adiciona mensagem do user imediatamente
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      images,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      meta: {},
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
    }));

    try {
      const response = await api.sendMessage({
        message,
        images,
        video: video ? { data: video.data, name: video.name } : undefined,
        pdfs: pdfs.map(p => ({ data: p.data, name: p.name })),
        mode,
        model,
      });

      set((state) => ({
        messages: [...state.messages, response.message],
        isStreaming: false,
        memoryNotifications: response.memory_notifications,
      }));
    } catch (e) {
      console.error('Failed to send message:', e);
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `[Erro] Falha ao enviar mensagem: ${e}`,
        images: [],
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        meta: { error: true },
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        isStreaming: false,
      }));
    }
  },

  // WebSocket streaming
  sendMessageStreaming: async (message, attachments = [], mode = 'default') => {
    const { model } = get();

    // Extrai images, video, pdfs
    const images = attachments.filter(a => a.type === 'image').map(a => a.data);
    const video = attachments.find(a => a.type === 'video');
    const pdfs = attachments.filter(a => a.type === 'pdf');

    // Adiciona mensagem do user imediatamente
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      images,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      meta: {},
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
    }));

    // Configura handlers
    chatWs.setHandlers({
      onChunk: (content) => {
        set((state) => ({
          streamingContent: state.streamingContent + content,
        }));
      },
      onDone: async (data) => {
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: data.content,
          images: [],
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          meta: { model },
        };
        set((state) => ({
          messages: [...state.messages, aiMsg],
          isStreaming: false,
          streamingContent: '',
          memoryNotifications: data.memory_notifications,
        }));

        // Adiciona agent tasks ao agent-store
        if (data.agent_tasks && data.agent_tasks.length > 0) {
          const { useAgentStore } = await import('./agent-store');
          data.agent_tasks.forEach((task: any) => {
            useAgentStore.getState().addTask(task);
          });
        }
      },
      onError: (error) => {
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `[Erro] ${error}`,
          images: [],
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          meta: { error: true },
        };
        set((state) => ({
          messages: [...state.messages, errorMsg],
          isStreaming: false,
          streamingContent: '',
        }));
      },
    });

    // Conecta WS se necessário, senão fallback para HTTP
    if (!chatWs.isConnected) {
      const connected = await chatWs.connect();
      if (!connected) {
        // Revert optimistic update (remove user message) before fallback to avoid duplicate
        set((state) => ({
          messages: state.messages.slice(0, -1),
          isStreaming: false
        }));
        return get().sendMessage(message, attachments, mode);
      }
    }

    chatWs.sendMessage(message, model, images, video, pdfs, mode);
  },

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  clearMessages: () => set({ messages: [], activeSessionId: null }),
}));
