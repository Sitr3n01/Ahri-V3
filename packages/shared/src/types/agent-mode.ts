/**
 * Agent Mode Types - Orchestrated multi-agent task execution.
 *
 * These types align with backend Pydantic schemas in:
 * packages/backend/src/models/schemas.py
 */

import type { AgentTaskStatus } from './agent.js';

export type AgentExecutionStatus = 'planning' | 'running' | 'completed' | 'failed';

export type AgentWorkerType =
  | 'RAG'
  | 'Code'
  | 'Web'
  | 'Memory'
  | 'Vision'
  | 'Shell'
  | 'Browser'
  | 'Router';

// Re-export AgentTaskStatus for convenience
export type { AgentTaskStatus };

export interface AgentWorkerTask {
  id: number;
  execution_id: number;
  worker_type: AgentWorkerType;
  model: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  tokens_used: number;
  duration_ms: number;
  status: AgentTaskStatus;
  error: string;
  created_at: string;
  completed_at: string | null;
}

export interface AgentExecution {
  id: number;
  goal: string;
  orchestrator_model: string;
  status: AgentExecutionStatus;
  plan: {
    reasoning?: string;
    steps: Array<{
      worker: AgentWorkerType;
      input: Record<string, unknown>;
      description?: string;
    }>;
  };
  result: string;
  error: string;
  created_at: string;
  completed_at: string | null;
  worker_tasks: AgentWorkerTask[];
}

export interface AgentModeExecuteRequest {
  goal: string;
  orchestrator_model?: string;  // default: "gemini-2.5-flash"
}
