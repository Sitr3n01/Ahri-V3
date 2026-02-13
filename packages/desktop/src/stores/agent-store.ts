import { create } from 'zustand';
import type { AgentTask } from '@ahri/shared';
import { api } from '@/api/client';

interface AgentState {
  tasks: AgentTask[];
  isPanelOpen: boolean;

  addTask: (task: AgentTask) => void;
  updateTask: (id: number, updates: Partial<AgentTask>) => void;
  approveTask: (id: number) => Promise<void>;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  clearCompleted: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  tasks: [],
  isPanelOpen: false,

  addTask: (task) =>
    set((state) => ({ tasks: [task, ...state.tasks] })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  approveTask: async (id) => {
    try {
      const result = await api.approveAgentTask(id);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? result : t)),
      }));
    } catch (e) {
      console.error('Failed to approve task:', e);
    }
  },

  togglePanel: () =>
    set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  clearCompleted: () =>
    set((state) => ({
      tasks: state.tasks.filter(
        (t) => t.status !== 'completed' && t.status !== 'failed',
      ),
    })),
}));
