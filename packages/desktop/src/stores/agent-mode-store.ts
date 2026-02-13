/**
 * Agent Mode Store - Zustand state management for orchestrated task execution.
 *
 * Manages:
 * - Execution submissions
 * - Status polling
 * - Worker task tracking
 * - Execution history
 */

import { create } from 'zustand';
import type { AgentExecution, AgentWorkerTask } from '@ahri/shared';
import { api } from '../api/client';

interface AgentModeState {
  // State
  executions: AgentExecution[];
  activeExecution: AgentExecution | null;
  workerTasks: Map<number, AgentWorkerTask[]>;  // execution_id → tasks
  isLoading: boolean;

  // Actions
  executeTask: (goal: string, orchestrator?: string) => Promise<void>;
  pollStatus: (executionId: number) => Promise<void>;
  loadWorkerTasks: (executionId: number) => Promise<void>;
  clearHistory: () => void;
  setActiveExecution: (execution: AgentExecution | null) => void;

  // WebSocket updates (Phase 3)
  updateExecution: (execution: AgentExecution) => void;
  addWorkerTask: (task: AgentWorkerTask) => void;
  updateWorkerTask: (task: AgentWorkerTask) => void;

  // History management
  deleteExecution: (executionId: number) => void;
}

export const useAgentModeStore = create<AgentModeState>((set, get) => ({
  // Initial state
  executions: [],
  activeExecution: null,
  workerTasks: new Map(),
  isLoading: false,

  // Execute new task
  executeTask: async (goal: string, orchestrator = 'PRO') => {
    set({ isLoading: true });

    try {
      // Map frontend model names to backend
      const modelMap: Record<string, string> = {
        'PRO': 'gemini-2.5-flash',
        'GOOGLE': 'gemma-3-27b',
        'DEEPSEEK': 'deepseek-r1',
        'LOCAL': 'local-ollama'
      };

      const orchestratorModel = modelMap[orchestrator] || 'gemini-2.5-flash';

      const execution = await api.executeAgentMode(goal, orchestratorModel);

      set({
        activeExecution: execution,
        executions: [execution, ...get().executions],
        isLoading: false
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

      // Update active execution if it matches
      if (get().activeExecution?.id === executionId) {
        set({ activeExecution: execution });
      }

      // Update in executions list
      set({
        executions: get().executions.map(e =>
          e.id === executionId ? execution : e
        )
      });

      // Load worker tasks
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

  // Clear execution history
  clearHistory: () => {
    set({
      executions: [],
      activeExecution: null,
      workerTasks: new Map()
    });
  },

  // Set active execution (for viewing past runs)
  setActiveExecution: (execution: AgentExecution | null) => {
    set({ activeExecution: execution });

    // Load worker tasks if not already loaded
    if (execution && !get().workerTasks.has(execution.id)) {
      get().loadWorkerTasks(execution.id);
    }
  },

  // Update execution from WebSocket
  updateExecution: (execution: AgentExecution) => {
    // Update active execution if it matches
    if (get().activeExecution?.id === execution.id) {
      set({ activeExecution: execution });
    }

    // Update in executions list
    set({
      executions: get().executions.map(e =>
        e.id === execution.id ? execution : e
      )
    });
  },

  // Add new worker task from WebSocket
  addWorkerTask: (task: AgentWorkerTask) => {
    const workerTasks = new Map(get().workerTasks);
    const existingTasks = workerTasks.get(task.execution_id) || [];

    // Only add if not already in list
    if (!existingTasks.find(t => t.id === task.id)) {
      workerTasks.set(task.execution_id, [...existingTasks, task]);
      set({ workerTasks });
    }
  },

  // Update worker task from WebSocket
  updateWorkerTask: (task: AgentWorkerTask) => {
    const workerTasks = new Map(get().workerTasks);
    const existingTasks = workerTasks.get(task.execution_id) || [];

    workerTasks.set(
      task.execution_id,
      existingTasks.map(t => t.id === task.id ? task : t)
    );
    set({ workerTasks });
  },

  // Delete execution from history
  deleteExecution: (executionId: number) => {
    const workerTasks = new Map(get().workerTasks);
    workerTasks.delete(executionId);

    set({
      executions: get().executions.filter(e => e.id !== executionId),
      activeExecution: get().activeExecution?.id === executionId ? null : get().activeExecution,
      workerTasks
    });
  }
}));

// Helper: Poll execution until completed/failed
function pollExecutionUntilComplete(executionId: number) {
  const store = useAgentModeStore.getState();
  const pollInterval = 2000; // Poll every 2 seconds
  let pollCount = 0;
  const maxPolls = 150; // Max 5 minutes (150 * 2s)

  const interval = setInterval(async () => {
    const execution = store.executions.find(e => e.id === executionId);

    // Stop if execution is done
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

    // Continue polling
    await store.pollStatus(executionId);
    pollCount++;
  }, pollInterval);
}
