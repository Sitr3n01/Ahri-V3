/**
 * Ahri API Client - HTTP + WebSocket para comunicação com o backend.
 * Usado pelo desktop (Electron) e web (mobile PWA).
 */

import type { TokenResponse, HealthResponse } from '../types/api.js';
import type { PersonaListResponse, PersonaDetail } from '../types/persona.js';
import type { ChatRequest, ChatResponse, SessionSummary, SessionDetail } from '../types/chat.js';
import type { AgentTask } from '../types/agent.js';
import type { AgentExecution, AgentWorkerTask, AgentModeExecuteRequest } from '../types/agent-mode.js';
import type { UserProfile, SpotifyContext } from '../types/memory.js';
import type { AvailableModel } from '../types/llm.js';

export interface AhriClientConfig {
  baseUrl: string;
  onTokenExpired?: () => void;
}

export class AhriApiClient {
  private baseUrl: string;
  private accessToken: string = '';
  private refreshToken: string = '';
  private onTokenExpired?: () => void;

  constructor(config: AhriClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.onTokenExpired = config.onTokenExpired;
  }

  // =========================================================================
  // Token Management
  // =========================================================================

  setTokens(access: string | null, refresh: string | null) {
    this.accessToken = access || '';
    this.refreshToken = refresh || '';
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  async refreshTokenManual(refreshToken: string): Promise<TokenResponse> {
    const res = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }

    const data = (await res.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  // =========================================================================
  // HTTP Helpers
  // =========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    requireAuth = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requireAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && requireAuth) {
      // Tenta refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retry = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retry.ok) throw new ApiError(retry.status, await retry.text());
        return retry.json() as T;
      }
      this.onTokenExpired?.();
      throw new ApiError(401, 'Authentication expired');
    }

    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text);
    }

    return res.json() as T;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!res.ok) return false;

      const data = (await res.json()) as TokenResponse;
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Auth
  // =========================================================================

  async login(password: string): Promise<TokenResponse> {
    const data = await this.request<TokenResponse>('POST', '/auth/login', { password }, false);
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  // =========================================================================
  // Password Reset
  // =========================================================================

  async resetPassword(currentPassword: string, newPassword: string): Promise<TokenResponse> {
    const data = await this.request<TokenResponse>('POST', '/auth/reset-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  async forceResetPassword(newPassword: string): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>(
      'POST', '/auth/force-reset',
      { new_password: newPassword },
      false, // No auth required
    );
  }

  // =========================================================================
  // Health
  // =========================================================================

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health', undefined, false);
  }

  // =========================================================================
  // Personas
  // =========================================================================

  async listPersonas(): Promise<PersonaListResponse> {
    return this.request<PersonaListResponse>('GET', '/personas');
  }

  async getPersona(name: string): Promise<PersonaDetail> {
    return this.request<PersonaDetail>('GET', `/personas/${encodeURIComponent(name)}`);
  }

  async activatePersona(name: string): Promise<{ active: string }> {
    return this.request<{ active: string }>('POST', `/personas/${encodeURIComponent(name)}/activate`);
  }

  async updatePersona(name: string, data: Record<string, any>): Promise<PersonaDetail> {
    return this.request<PersonaDetail>('PUT', `/personas/${encodeURIComponent(name)}`, data);
  }

  // =========================================================================
  // Chat
  // =========================================================================

  async sendMessage(req: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>('POST', '/chat', req);
  }

  // =========================================================================
  // Sessions
  // =========================================================================

  async listSessions(persona?: string): Promise<SessionSummary[]> {
    const query = persona ? `?persona=${encodeURIComponent(persona)}` : '';
    return this.request<SessionSummary[]>('GET', `/sessions${query}`);
  }

  async createSession(title?: string): Promise<SessionSummary> {
    return this.request<SessionSummary>('POST', '/sessions', { title: title ?? '' });
  }

  async getSession(id: number): Promise<SessionDetail> {
    return this.request<SessionDetail>('GET', `/sessions/${id}`);
  }

  async renameSession(id: number, title: string): Promise<void> {
    await this.request<unknown>('PUT', `/sessions/${id}`, { title });
  }

  async deleteSession(id: number): Promise<void> {
    await this.request<unknown>('DELETE', `/sessions/${id}`);
  }

  // =========================================================================
  // Memory
  // =========================================================================

  async getProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('GET', '/memory/profile');
  }

  async saveProfile(profile: UserProfile): Promise<{ status: string; profile: UserProfile }> {
    return this.request<{ status: string; profile: UserProfile }>('POST', '/memory/profile', profile);
  }

  async saveMemory(title: string, content: string): Promise<void> {
    await this.request<unknown>('POST', '/memory/save', { title, content });
  }

  async learnFact(topic: string, content: string): Promise<void> {
    await this.request<unknown>('POST', '/memory/learn', { topic, content });
  }

  async forgetFact(topic: string): Promise<void> {
    await this.request<unknown>('POST', '/memory/forget', { topic });
  }

  async listMemories(sourceType?: string): Promise<{ memories: Array<{ id: string; content: string; type: string; filename: string; source: string }>; total: number; persona: string }> {
    const query = sourceType ? `?source_type=${encodeURIComponent(sourceType)}` : '';
    return this.request('GET', `/memory/list${query}`);
  }

  async getMemory(id: string): Promise<{ id: string; content: string; type: string; filename: string; source: string }> {
    return this.request('GET', `/memory/${encodeURIComponent(id)}`);
  }

  async updateMemory(id: string, content: string): Promise<{ status: string; id: string }> {
    return this.request('PUT', `/memory/${encodeURIComponent(id)}`, { content });
  }

  async deleteMemory(id: string): Promise<{ status: string; id: string }> {
    return this.request('DELETE', `/memory/${encodeURIComponent(id)}`);
  }

  // =========================================================================
  // Agent
  // =========================================================================

  async executeAgentTask(capability: string, parameters: Record<string, unknown> = {}): Promise<AgentTask> {
    return this.request<AgentTask>('POST', '/agent/execute', { capability, parameters });
  }

  async approveAgentTask(taskId: number): Promise<AgentTask> {
    return this.request<AgentTask>('POST', `/agent/${taskId}/approve`);
  }

  async getAgentTaskStatus(taskId: number): Promise<AgentTask> {
    return this.request<AgentTask>('GET', `/agent/${taskId}/status`);
  }

  // =========================================================================
  // Search
  // =========================================================================

  async search(query: string, maxResults = 5): Promise<{ results: Array<{ title: string; link: string; snippet: string }>; remaining_quota: number }> {
    return this.request('POST', '/search', { query, max_results: maxResults });
  }

  // =========================================================================
  // Spotify
  // =========================================================================

  async getSpotifyContext(): Promise<SpotifyContext> {
    return this.request<SpotifyContext>('GET', '/spotify/context');
  }

  async syncPersonaByMusic(): Promise<{ switched: boolean; persona: string }> {
    return this.request('POST', '/spotify/sync-persona');
  }

  // =========================================================================
  // Agent Mode
  // =========================================================================

  async executeAgentMode(
    goal: string,
    orchestratorModel = 'gemini-3.1-flash-lite',
    options?: {
      reasoning_level?: string;
      enable_thinking?: boolean;
      internet_search_enabled?: boolean;
      images?: string[];
    }
  ): Promise<AgentExecution> {
    return this.request<AgentExecution>('POST', '/agent-mode/execute', {
      goal,
      orchestrator_model: orchestratorModel,
      ...(options || {}),
    });
  }

  async getAgentModeStatus(executionId: number): Promise<AgentExecution> {
    return this.request<AgentExecution>('GET', `/agent-mode/${executionId}/status`);
  }

  async getAgentModeWorkers(executionId: number): Promise<AgentWorkerTask[]> {
    return this.request<AgentWorkerTask[]>('GET', `/agent-mode/${executionId}/workers`);
  }

  // =========================================================================
  // Settings
  // =========================================================================

  async getSettings(): Promise<any> {
    return this.request<any>('GET', '/settings');
  }

  async updateSettings(settings: Record<string, any>): Promise<{ status: string }> {
    return this.request<{ status: string }>('POST', '/settings', { settings });
  }

  // =========================================================================
  // Models
  // =========================================================================

  async getAvailableModels(): Promise<AvailableModel[]> {
    return this.request<AvailableModel[]>('GET', '/settings/models/available');
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  createChatWebSocket(): WebSocket {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return new WebSocket(`${wsUrl}/chat/ws`);
  }

  createAgentWebSocket(): WebSocket {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return new WebSocket(`${wsUrl}/agent/ws`);
  }

  createAgentModeWebSocket(executionId: number): WebSocket {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return new WebSocket(`${wsUrl}/agent-mode/ws/${executionId}`);
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Cria uma instância do client configurada para desenvolvimento local.
 */
export function createLocalClient(port = 8742): AhriApiClient {
  return new AhriApiClient({ baseUrl: `http://localhost:${port}` });
}
