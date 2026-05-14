import { create } from 'zustand';
import type { ChatMessage, SessionSummary } from '@ahri/shared';
import type { AvailableModel } from '@ahri/shared/types/llm.js';
import { api } from '@/api/client';
import { chatWs } from '@/api/websocket';

export interface Attachment {
  type: 'image' | 'video' | 'pdf';
  data: string; // base64
  name: string;
  preview?: string;
}

/**
 * Extensão local de ChatMessage com campos necessários para UI:
 * - id: chave estável para o algoritmo de reconciliação do React
 * - isStreaming: true enquanto esta mensagem está sendo recebida via WS
 *
 * Não modificamos o tipo compartilhado (@ahri/shared) porque o backend
 * não envia esses campos — eles são exclusivamente de UI.
 */
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images: string[];
  timestamp: string;
  meta: Record<string, unknown>;
  isStreaming?: boolean;
}

/** ID reservado para a mensagem placeholder enquanto o stream está ativo. */
const STREAM_ID = '__stream__';

const SESSIONS_PAGE_SIZE = 15;

/** Converte ChatMessage do backend para LocalMessage com id estável. */
function fromApiMessage(msg: ChatMessage): LocalMessage {
  return {
    id: String((msg as any).id ?? crypto.randomUUID()),
    role: msg.role,
    content: msg.content,
    images: msg.images,
    timestamp: msg.timestamp,
    meta: msg.meta,
    isStreaming: false,
  };
}

function autoTitle(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 30 ? words.slice(0, 30) + '…' : words;
}

async function _ensureSession(
  get: () => ChatState,
  set: (fn: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  message: string,
): Promise<void> {
  if (!get().isPendingNewChat) return;
  if (get().isCreatingSession) return;

  set({ isCreatingSession: true });
  try {
    const session = await api.createSession(autoTitle(message));
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      isPendingNewChat: false,
      isCreatingSession: false,
    }));
  } catch (e) {
    set({ isCreatingSession: false });
    throw e;
  }
}

interface ChatState {
  messages: LocalMessage[];
  isStreaming: boolean;
  activeSessionId: number | null;
  sessions: SessionSummary[];
  sessionsLoading: boolean;
  visibleCount: number;
  model: string;
  availableModels: AvailableModel[];
  memoryNotifications: string[];

  isPendingNewChat: boolean;
  isCreatingSession: boolean;

  /**
   * Rascunhos por sessão.
   * Chave: String(sessionId) para sessões existentes, 'new' para novo chat pendente.
   * Permite que o usuário troque de sessão sem perder o texto digitado.
   */
  drafts: Record<string, string>;

  reasoningLevel: string;
  enableThinking: boolean;
  streamingEnabled: boolean;
  showTimestamps: boolean;
  autoSaveTags: boolean;
  internetSearchEnabled: boolean;
  globalEnableThinking: boolean;

  // Actions
  setModel: (model: string) => void;
  loadChatSettings: () => void;
  fetchAvailableModels: () => Promise<void>;
  refreshOllamaModels: () => Promise<void>;
  fetchSessions: (persona?: string) => Promise<void>;
  loadMoreSessions: () => void;
  loadSession: (id: number) => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  startNewChat: () => void;
  deleteSession: (id: number) => Promise<void>;
  renameSession: (id: number, title: string) => Promise<void>;
  sendMessage: (message: string, attachments?: Attachment[], mode?: 'default' | 'web_search' | 'lore_search') => Promise<void>;
  sendMessageStreaming: (message: string, attachments?: Attachment[], mode?: 'default' | 'web_search' | 'lore_search') => Promise<void>;
  cancelStreaming: () => void;
  stopStreaming: () => void;
  addMessage: (msg: LocalMessage) => void;
  clearMessages: () => void;
  setReasoningLevel: (level: string) => void;
  setEnableThinking: (enabled: boolean) => void;
  saveDraft: (key: string, text: string) => void;
  clearMemoryNotifications: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeSessionId: null,
  sessions: [],
  sessionsLoading: false,
  visibleCount: SESSIONS_PAGE_SIZE,
  model: 'LITE',
  availableModels: [],
  memoryNotifications: [],
  isPendingNewChat: false,
  isCreatingSession: false,
  drafts: {},

  streamingEnabled: true,
  showTimestamps: true,
  autoSaveTags: true,
  internetSearchEnabled: false,
  globalEnableThinking: false,
  reasoningLevel: 'medium',
  enableThinking: false,

  setModel: (model) => set({ model }),

  loadChatSettings: () => {
    try {
      const stored = localStorage.getItem('ahri_settings_chat');
      if (stored) {
        const parsed = JSON.parse(stored);
        set({
          streamingEnabled: parsed.streaming_enabled ?? true,
          showTimestamps: parsed.show_timestamps ?? true,
          autoSaveTags: parsed.auto_save_tags ?? true,
          internetSearchEnabled: parsed.internet_search_enabled ?? false,
          globalEnableThinking: parsed.enable_thinking ?? false,
          reasoningLevel: parsed.reasoning_level ?? 'off',
        });
      }
    } catch { /* ignore */ }
  },

  setReasoningLevel: (level) => set({ reasoningLevel: level }),
  setEnableThinking: (enabled) => set({ enableThinking: enabled }),

  /**
   * Salva rascunho de texto para uma sessão específica.
   * Chamado pelo ChatInput a cada mudança de texto.
   * Barato: Zustand updates são síncronos e o objeto de drafts é pequeno.
   */
  saveDraft: (key, text) =>
    set((state) => ({ drafts: { ...state.drafts, [key]: text } })),

  clearMemoryNotifications: () => set({ memoryNotifications: [] }),

  fetchAvailableModels: async () => {
    try {
      const models = await api.getAvailableModels();
      set({ availableModels: models });
      const current = useChatStore.getState().model;
      if (models.length > 0 && !models.find((m) => m.id === current)) {
        set({ model: models[0].id });
      }
    } catch (e) {
      console.error('Failed to fetch available models:', e);
    }
  },

  refreshOllamaModels: async () => {
    try {
      const ollamaModels = await api.refreshOllamaModels();
      const current = useChatStore.getState().availableModels;
      const nonOllama = current.filter((m) => (m.group || m.provider) !== 'ollama');
      set({ availableModels: [...nonOllama, ...ollamaModels] });
    } catch (e) {
      console.error('Failed to refresh Ollama models:', e);
    }
  },

  fetchSessions: async (persona) => {
    set({ sessionsLoading: true });
    try {
      const sessions = await api.listSessions(persona);
      set({ sessions, sessionsLoading: false, visibleCount: SESSIONS_PAGE_SIZE });
    } catch (e) {
      set({ sessionsLoading: false });
      console.error('Failed to fetch sessions:', e);
    }
  },

  loadMoreSessions: () =>
    set((state) => ({ visibleCount: state.visibleCount + SESSIONS_PAGE_SIZE })),

  loadSession: async (id) => {
    get().cancelStreaming();
    try {
      const detail = await api.getSession(id);
      set({
        activeSessionId: id,
        // Mapeia para LocalMessage para garantir IDs estáveis
        messages: detail.messages.map(fromApiMessage),
        isPendingNewChat: false,
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
        isPendingNewChat: false,
      }));
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  },

  startNewChat: () => {
    const { isPendingNewChat, messages } = get();
    if (isPendingNewChat && messages.length === 0) return;
    get().cancelStreaming();
    set({
      messages: [],
      activeSessionId: null,
      isPendingNewChat: true,
      isStreaming: false,
      memoryNotifications: [],
    });
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
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
      }));
    } catch (e) {
      console.error('Failed to rename session:', e);
    }
  },

  // HTTP fallback — também usa o padrão de placeholder para UX consistente
  sendMessage: async (message, attachments = [], mode = 'default') => {
    const { model, reasoningLevel, enableThinking, autoSaveTags } = get();
    await _ensureSession(get, set, message);

    const images = attachments.filter((a) => a.type === 'image').map((a) => a.data);
    const video = attachments.find((a) => a.type === 'video');
    const pdfs = attachments.filter((a) => a.type === 'pdf');

    const userMsg: LocalMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      images,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      meta: {},
    };

    // Placeholder enquanto aguarda resposta HTTP (mesma UX do streaming)
    const placeholderMsg: LocalMessage = {
      id: STREAM_ID,
      role: 'assistant',
      content: '',
      images: [],
      timestamp: '',
      meta: {},
      isStreaming: true,
    };

    set((state) => ({ messages: [...state.messages, userMsg, placeholderMsg], isStreaming: true }));

    try {
      const response = await api.sendMessage({
        message,
        session_id: get().activeSessionId ?? undefined,
        images,
        video: video ? { data: video.data, name: video.name } : undefined,
        pdfs: pdfs.map((p) => ({ data: p.data, name: p.name })),
        mode,
        model,
        reasoning_level: reasoningLevel,
        enable_thinking: enableThinking,
        auto_save_tags: autoSaveTags,
      });

      const finalMsg = fromApiMessage(response.message);
      set((state) => ({
        messages: state.messages.map((m) => (m.id === STREAM_ID ? finalMsg : m)),
        isStreaming: false,
        memoryNotifications: response.memory_notifications,
      }));
    } catch (e) {
      const errorMsg: LocalMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[Erro] Falha ao enviar mensagem: ${e}`,
        images: [],
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        meta: { error: true },
        isStreaming: false,
      };
      set((state) => ({
        messages: state.messages.map((m) => (m.id === STREAM_ID ? errorMsg : m)),
        isStreaming: false,
      }));
    }
  },

  sendMessageStreaming: async (message, attachments = [], mode = 'default') => {
    const { model, reasoningLevel, enableThinking, autoSaveTags } = get();
    await _ensureSession(get, set, message);

    const images = attachments.filter((a) => a.type === 'image').map((a) => a.data);
    const video = attachments.find((a) => a.type === 'video');
    const pdfs = attachments.filter((a) => a.type === 'pdf');

    const userMsg: LocalMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      images,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      meta: {},
    };

    /**
     * Mensagem placeholder com id reservado STREAM_ID.
     * Fica no array de mensagens e é atualizada chunk-a-chunk.
     * Quando o stream termina, é substituída pela mensagem final com id real.
     * Isso elimina o "scroll jump" causado por streamingContent separado.
     */
    const streamingPlaceholder: LocalMessage = {
      id: STREAM_ID,
      role: 'assistant',
      content: '',
      images: [],
      timestamp: '',
      meta: {},
      isStreaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMsg, streamingPlaceholder],
      isStreaming: true,
    }));

    /**
     * Captura a geração ANTES de registrar handlers.
     * Qualquer cancel() incrementa chatWs.generation, fazendo os guards falharem.
     * Isso garante que chunks de streams cancelados nunca poluam o estado.
     */
    const gen = chatWs.beginRequest();

    chatWs.setHandlers({
      onChunk: (content) => {
        // Guard de geração: ignora chunks de streams cancelados ou anteriores
        if (gen !== chatWs.generation) return;

        // Atualiza APENAS a mensagem placeholder — O(n) no pior caso, mas
        // com keys estáveis o React só re-renderiza essa mensagem específica.
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === STREAM_ID ? { ...m, content: m.content + content } : m,
          ),
        }));
      },

      onDone: (data) => {
        if (gen !== chatWs.generation) return;

        // Substitui o placeholder pela mensagem final com metadados reais
        const finalMsg: LocalMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.content,
          images: [],
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          meta: { model },
          isStreaming: false,
        };

        set((state) => ({
          messages: state.messages.map((m) => (m.id === STREAM_ID ? finalMsg : m)),
          isStreaming: false,
          memoryNotifications: data.memory_notifications,
        }));
      },

      onError: (error) => {
        if (gen !== chatWs.generation) return;

        const errorMsg: LocalMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `[Erro] ${error}`,
          images: [],
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          meta: { error: true },
          isStreaming: false,
        };

        set((state) => ({
          messages: state.messages.map((m) => (m.id === STREAM_ID ? errorMsg : m)),
          isStreaming: false,
        }));
      },
    });

    if (!chatWs.isConnected) {
      const connected = await chatWs.connect();
      if (!connected) {
        // Reverte mensagens otimistas antes do fallback para evitar duplicata
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== userMsg.id && m.id !== STREAM_ID),
          isStreaming: false,
        }));
        return get().sendMessage(message, attachments, mode);
      }
    }

    chatWs.sendMessage(message, model, get().activeSessionId ?? undefined, images, video, pdfs, mode, {
      reasoning_level: reasoningLevel,
      enable_thinking: enableThinking,
      auto_save_tags: autoSaveTags,
    });
  },

  cancelStreaming: () => {
    if (!get().isStreaming) return;
    chatWs.cancel();
    // Remove o placeholder do array — mensagem cancelada não fica no histórico
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== STREAM_ID),
      isStreaming: false,
    }));
  },

  stopStreaming: () => {
    if (!get().isStreaming) return;
    chatWs.cancel();
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== STREAM_ID),
      isStreaming: false,
    }));
  },

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [], activeSessionId: null }),
}));
