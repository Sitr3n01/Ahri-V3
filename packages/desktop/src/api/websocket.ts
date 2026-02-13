/**
 * WebSocket manager para streaming de chat.
 */
import { api } from './client';

type ChunkHandler = (content: string) => void;
type DoneHandler = (data: {
  content: string;
  agent_tasks: unknown[];
  memory_notifications: string[];
}) => void;
type ErrorHandler = (error: string) => void;

export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private onChunk: ChunkHandler = () => {};
  private onDone: DoneHandler = () => {};
  private onError: ErrorHandler = () => {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = api.createChatWebSocket();

        this.ws.onopen = () => {
          // Autentica
          this.ws?.send(
            JSON.stringify({ type: 'auth', token: api.getAccessToken() }),
          );
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'auth':
              if (data.status === 'ok') {
                this.reconnectAttempts = 0;
                resolve(true);
              } else {
                resolve(false);
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
          resolve(false);
        };

        this.ws.onclose = () => {
          this.ws = null;
        };
      } catch {
        resolve(false);
      }
    });
  }

  sendMessage(
    message: string,
    model: string,
    images: string[] = [],
    video?: { data: string; name: string },
    pdfs?: { data: string; name: string }[],
    mode: 'default' | 'web_search' | 'lore_search' = 'default'
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError('WebSocket not connected');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'message',
        message,
        model,
        images,
        video,
        pdfs,
        mode,
      }),
    );
  }

  setHandlers(handlers: {
    onChunk?: ChunkHandler;
    onDone?: DoneHandler;
    onError?: ErrorHandler;
  }) {
    if (handlers.onChunk) this.onChunk = handlers.onChunk;
    if (handlers.onDone) this.onDone = handlers.onDone;
    if (handlers.onError) this.onError = handlers.onError;
  }

  disconnect() {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const chatWs = new ChatWebSocket();
