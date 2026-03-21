/**
 * Agent Mode Store - Zustand state management for orchestrated task execution.
 *
 * V2: Adds model selection, directory context, RPM tracking.
 * Thread-safe: store actions use immutable patterns (no .push()).
 */

import { create } from 'zustand';
import type { AgentExecution, AgentWorkerTask, TPMStatus, AgentModelId, GeminiReasoningLevel } from '@ahri/shared';
import { api } from '../api/client';

interface AgentModeState {
  // State
  executions: AgentExecution[];
  activeExecution: AgentExecution | null;
  workerTasks: Map<number, AgentWorkerTask[]>;
  isLoading: boolean;
  tpmStatus: TPMStatus;

  // Agent Mode v2 — model & directory selection
  selectedModel: AgentModelId;
  selectedDirectory: string | null;
  recentDirectories: string[];

  // Agent Mode v3 — reasoning & internet search
  reasoningLevel: GeminiReasoningLevel;
  enableThinking: boolean;
  internetSearchEnabled: boolean;

  // Actions
  executeTask: (goal: string, orchestrator?: string) => Promise<void>;
  pollStatus: (executionId: number) => Promise<void>;
  loadWorkerTasks: (executionId: number) => Promise<void>;
  clearHistory: () => void;
  setActiveExecution: (execution: AgentExecution | null) => void;
  setTPMStatus: (status: TPMStatus) => void;

  // Model & directory actions
  setSelectedModel: (model: AgentModelId) => void;
  setSelectedDirectory: (dir: string | null) => void;
  loadRecentDirectories: () => Promise<void>;

  // Reasoning & internet actions
  setReasoningLevel: (level: GeminiReasoningLevel) => void;
  setEnableThinking: (enabled: boolean) => void;
  setInternetSearchEnabled: (enabled: boolean) => void;

  // WebSocket updates
  updateExecution: (execution: AgentExecution) => void;
  addWorkerTask: (task: AgentWorkerTask) => void;
  updateWorkerTask: (task: AgentWorkerTask) => void;

  // History management
  deleteExecution: (executionId: number) => void;
}

// Persist model selection in localStorage
function getPersistedModel(): AgentModelId {
  try {
    const stored = localStorage.getItem('ahri-agent-model');
    if (stored === 'qwen-3.5-local' || stored === 'gemini-flash-lite') return stored;
  } catch { /* ignore */ }
  return 'gemini-flash-lite';
}

function getPersistedDirectory(): string | null {
  try {
    return localStorage.getItem('ahri-agent-directory') || null;
  } catch { return null; }
}

function getPersistedReasoning(): GeminiReasoningLevel {
  try {
    const stored = localStorage.getItem('ahri-agent-reasoning');
    if (stored === 'off' || stored === 'low' || stored === 'medium' || stored === 'high') return stored;
  } catch { /* ignore */ }
  return 'medium';
}

function getPersistedThinking(): boolean {
  try {
    return localStorage.getItem('ahri-agent-thinking') === 'true';
  } catch { return false; }
}

function getPersistedInternetSearch(): boolean {
  try {
    return localStorage.getItem('ahri-agent-internet') === 'true';
  } catch { return false; }
}

export const useAgentModeStore = create<AgentModeState>((set, get) => ({
  // Initial state
  executions: [],
  activeExecution: null,
  workerTasks: new Map(),
  isLoading: false,
  tpmStatus: {
    tokensUsed: 0, tokensRemaining: 250000, limitTPM: 250000, utilizationPercent: 0,
    requestsUsed: 0, requestsRemaining: 15, limitRPM: 15, rpmUtilizationPercent: 0,
  },

  // Agent Mode v2 defaults
  selectedModel: getPersistedModel(),
  selectedDirectory: getPersistedDirectory(),
  recentDirectories: [],

  // Agent Mode v3 defaults
  reasoningLevel: getPersistedReasoning(),
  enableThinking: getPersistedThinking(),
  internetSearchEnabled: getPersistedInternetSearch(),

  // Model & directory actions
  setSelectedModel: (model: AgentModelId) => {
    localStorage.setItem('ahri-agent-model', model);
    set({ selectedModel: model });
  },

  setSelectedDirectory: (dir: string | null) => {
    if (dir) localStorage.setItem('ahri-agent-directory', dir);
    else localStorage.removeItem('ahri-agent-directory');
    set({ selectedDirectory: dir });

    // Also add to recent dirs via IPC
    if (dir && window.ahri?.agent?.addRecentDir) {
      window.ahri.agent.addRecentDir(dir).then(dirs => {
        set({ recentDirectories: dirs });
      }).catch(() => { /* ignore */ });
    }
  },

  loadRecentDirectories: async () => {
    try {
      if (window.ahri?.agent?.getRecentDirs) {
        const dirs = await window.ahri.agent.getRecentDirs();
        set({ recentDirectories: dirs });
      }
    } catch { /* ignore */ }
  },

  // Reasoning & internet actions
  setReasoningLevel: (level: GeminiReasoningLevel) => {
    localStorage.setItem('ahri-agent-reasoning', level);
    set({ reasoningLevel: level });
  },

  setEnableThinking: (enabled: boolean) => {
    localStorage.setItem('ahri-agent-thinking', String(enabled));
    set({ enableThinking: enabled });
  },

  setInternetSearchEnabled: (enabled: boolean) => {
    localStorage.setItem('ahri-agent-internet', String(enabled));
    set({ internetSearchEnabled: enabled });
  },

  // Execute new task
  executeTask: async (goal: string, orchestrator?: string) => {
    set({ isLoading: true });

    try {
      const { selectedModel, selectedDirectory, reasoningLevel, enableThinking, internetSearchEnabled } = get();

      // Map frontend model IDs to backend
      const modelMap: Record<string, string> = {
        'qwen-3.5-local': 'LOCAL',
        'gemini-flash-lite': 'gemini-3.1-flash-lite',
      };

      const orchestratorModel = orchestrator
        ? orchestrator
        : (modelMap[selectedModel] || 'gemini-3.1-flash-lite');

      // Prepend directory context to goal if set
      const contextualGoal = selectedDirectory
        ? `[Diretório: ${selectedDirectory}]\n\n${goal}`
        : goal;

      const execution = await api.executeAgentMode(contextualGoal, orchestratorModel, {
        reasoning_level: reasoningLevel,
        enable_thinking: enableThinking,
        internet_search_enabled: internetSearchEnabled,
      });

      set({
        activeExecution: execution,
        executions: [execution, ...get().executions],
        isLoading: false,
      });

      // Start polling for status updates
      pollExecutionUntilComplete(execution.id);

    } catch (error) {
      console.error('[AgentMode] Execution failed:', error);
      set({ isLoading: false });
    }
  },

  // Poll execution status
  pollStatus: async (executionId: number) => {
    try {
      const execution = await api.getAgentModeStatus(executionId);

      if (get().activeExecution?.id === executionId) {
        set({ activeExecution: execution });
      }

      set({
        executions: get().executions.map(e =>
          e.id === executionId ? execution : e
        ),
      });

      if (execution.worker_tasks && execution.worker_tasks.length > 0) {
        const workerTasks = new Map(get().workerTasks);
        workerTasks.set(executionId, execution.worker_tasks);
        set({ workerTasks });
      }
    } catch (error) {
      console.error('[AgentMode] Status poll failed:', error);
    }
  },

  // Load worker tasks separately
  loadWorkerTasks: async (executionId: number) => {
    try {
      const tasks = await api.getAgentModeWorkers(executionId);
      const workerTasks = new Map(get().workerTasks);
      workerTasks.set(executionId, tasks);
      set({ workerTasks });
    } catch (error) {
      console.error('[AgentMode] Worker tasks load failed:', error);
    }
  },

  setTPMStatus: (status: TPMStatus) => set({ tpmStatus: status }),

  clearHistory: () => set({
    executions: [],
    activeExecution: null,
    workerTasks: new Map(),
  }),

  setActiveExecution: (execution: AgentExecution | null) => {
    set({ activeExecution: execution });
    if (execution && !get().workerTasks.has(execution.id)) {
      get().loadWorkerTasks(execution.id);
    }
  },

  // WebSocket updates (immutable patterns)
  updateExecution: (execution: AgentExecution) => {
    if (get().activeExecution?.id === execution.id) {
      set({ activeExecution: execution });
    }
    set({
      executions: get().executions.map(e =>
        e.id === execution.id ? execution : e
      ),
    });
  },

  addWorkerTask: (task: AgentWorkerTask) => {
    const workerTasks = new Map(get().workerTasks);
    const existingTasks = workerTasks.get(task.execution_id) || [];
    if (!existingTasks.find(t => t.id === task.id)) {
      workerTasks.set(task.execution_id, [...existingTasks, task]);
      set({ workerTasks });
    }
  },

  updateWorkerTask: (task: AgentWorkerTask) => {
    const workerTasks = new Map(get().workerTasks);
    const existingTasks = workerTasks.get(task.execution_id) || [];
    workerTasks.set(
      task.execution_id,
      existingTasks.map(t => t.id === task.id ? task : t)
    );
    set({ workerTasks });
  },

  deleteExecution: (executionId: number) => {
    const workerTasks = new Map(get().workerTasks);
    workerTasks.delete(executionId);
    set({
      executions: get().executions.filter(e => e.id !== executionId),
      activeExecution: get().activeExecution?.id === executionId ? null : get().activeExecution,
      workerTasks,
    });
  },
}));

// Helper: Poll execution until completed/failed
function pollExecutionUntilComplete(executionId: number) {
  const pollInterval = 2000;
  let pollCount = 0;
  const maxPolls = 300; // Max 10 minutes (300 * 2s) — increased for background tasks

  const interval = setInterval(async () => {
    const store = useAgentModeStore.getState();
    const execution = store.executions.find(e => e.id === executionId);

    if (
      !execution ||
      execution.status === 'completed' ||
      execution.status === 'failed' ||
      pollCount >= maxPolls
    ) {
      clearInterval(interval);
      if (pollCount >= maxPolls) {
        console.warn('[AgentMode] Polling timeout reached for execution', executionId);
      }
      return;
    }

    await store.pollStatus(executionId);
    pollCount++;
  }, pollInterval);
}
