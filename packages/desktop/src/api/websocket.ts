/**
 * WebSocket manager para streaming de chat.
 */
import { api } from './client';

type ChunkHandler = (content: string) => void;
type DoneHandler = (data: { content: string; memory_notifications: string[] }) => void;
type ErrorHandler = (error: string) => void;

export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private onChunk: ChunkHandler = () => {};
  private onDone: DoneHandler = () => {};
  private onError: ErrorHandler = () => {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManuallyDisconnected = false;
  private isConnecting = false;

  /**
   * Geração atual da requisição.
   *
   * Cada chamada a beginRequest() incrementa este contador.
   * cancel() também incrementa, invalidando todos os handlers em andamento.
   * Os callers capturam a geração via closure e verificam antes de aplicar chunks.
   */
  generation = 0;

  /**
   * Inicia uma nova requisição de streaming.
   * Retorna a geração atual para que o caller capture em um closure.
   * Exemplo: const gen = chatWs.beginRequest(); → usa gen para guards em handlers.
   */
  beginRequest(): number {
    return ++this.generation;
  }

  async connect(): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) return true;
    if (this.isConnecting) return false;

    this.isConnecting = true;
    this.isManuallyDisconnected = false;

    return new Promise((resolve) => {
      try {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }

        this.ws = api.createChatWebSocket();

        this.ws.onopen = () => {
          this.ws?.send(JSON.stringify({ type: 'auth', token: api.getAccessToken() }));
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'auth':
              if (data.status === 'ok') {
                this.reconnectAttempts = 0;
                this.isConnecting = false;
                resolve(true);
              } else {
                this.isConnecting = false;
                resolve(false);
                this.disconnect();
              }
              break;
            case 'chunk':
              this.onChunk(data.content);
              break;
            case 'done':
              this.onDone(data);
              break;
            case 'error':
              this.onError(data.detail || 'Unknown error');
              break;
          }
        };

        this.ws.onerror = () => {
          if (this.isConnecting) {
            this.isConnecting = false;
            resolve(false);
          }
        };

        this.ws.onclose = () => {
          this.ws = null;
          if (this.isConnecting) {
            this.isConnecting = false;
            resolve(false);
          }
          if (!this.isManuallyDisconnected) this.scheduleReconnect();
        };
      } catch (e) {
        this.isConnecting = false;
        resolve(false);
        if (!this.isManuallyDisconnected) this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[ChatWS] Max reconnect attempts reached');
      return;
    }
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[ChatWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  sendMessage(
    message: string,
    model: string,
    sessionId?: number,
    images: string[] = [],
    video?: { data: string; name: string },
    pdfs?: { data: string; name: string }[],
    mode: 'default' | 'web_search' | 'lore_search' = 'default',
    reasoning?: { reasoning_level?: string; enable_thinking?: boolean; auto_save_tags?: boolean },
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError('WebSocket not connected');
      if (!this.isConnecting && !this.isManuallyDisconnected) this.connect();
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'message', message, model, session_id: sessionId,
      images, video, pdfs, mode,
      reasoning_level: reasoning?.reasoning_level,
      enable_thinking: reasoning?.enable_thinking,
      auto_save_tags: reasoning?.auto_save_tags,
    }));
  }

  setHandlers(handlers: { onChunk?: ChunkHandler; onDone?: DoneHandler; onError?: ErrorHandler }) {
    if (handlers.onChunk) this.onChunk = handlers.onChunk;
    if (handlers.onDone) this.onDone = handlers.onDone;
    if (handlers.onError) this.onError = handlers.onError;
  }

  disconnect() {
    this.isManuallyDisconnected = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  /**
   * Cancela o stream atual.
   * Incrementar a geração invalida todos os handlers capturados em closures.
   * Mesmo que o backend envie chunks adicionais, eles serão ignorados pelos
   * guards `if (gen !== chatWs.generation) return` nos handlers da store.
   */
  cancel() {
    this.generation++; // Invalida handlers em andamento
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cancel' }));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const chatWs = new ChatWebSocket();
