/**
 * Reasoning Timeline - Step-by-step orchestrator thinking visualization
 *
 * Shows:
 * - Main reasoning (why this approach)
 * - Sequential step progression
 * - Current executing step
 * - Completed steps with timestamps
 * - Worker delegation tree
 */

import { useState } from 'react';
import type { AgentWorkerTask } from '@ahri/shared';

interface Step {
  worker: string;
  description: string;
  input?: Record<string, any>;
  depends_on?: number[];
}

interface ReasoningTimelineProps {
  reasoning: string;
  steps: Step[];
  workerTasks: AgentWorkerTask[];
  theme: any;
}

export function ReasoningTimeline({
  reasoning,
  steps,
  workerTasks,
  theme
}: ReasoningTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
    }
    setExpandedSteps(newExpanded);
  };

  // Determine current step based on worker tasks
  const getCurrentStepIndex = (): number => {
    if (workerTasks.length === 0) return -1;

    const lastTask = workerTasks[workerTasks.length - 1];

    // Find step index by matching worker type
    const stepIndex = steps.findIndex((step, idx) => {
      // Match by worker type and check if this task hasn't been completed yet
      return step.worker === lastTask.worker_type &&
             workerTasks.filter(t => t.worker_type === step.worker).length === idx + 1;
    });

    return stepIndex;
  };

  const currentStepIdx = getCurrentStepIndex();

  const getStepStatus = (stepIdx: number): 'pending' | 'running' | 'completed' | 'failed' => {
    // Find matching worker task for this step
    const stepWorker = steps[stepIdx].worker;
    const matchingTasks = workerTasks.filter(t => t.worker_type === stepWorker);

    if (matchingTasks.length === 0) {
      return stepIdx <= currentStepIdx ? 'running' : 'pending';
    }

    const task = matchingTasks[stepIdx] || matchingTasks[matchingTasks.length - 1];

    if (task.status === 'completed') return 'completed';
    if (task.status === 'failed') return 'failed';
    if (task.status === 'running') return 'running';
    return 'pending';
  };

  const getStepTask = (stepIdx: number): AgentWorkerTask | undefined => {
    const stepWorker = steps[stepIdx].worker;
    const matchingTasks = workerTasks.filter(t => t.worker_type === stepWorker);
    return matchingTasks[stepIdx] || matchingTasks[matchingTasks.length - 1];
  };

  const getStepIcon = (status: string): JSX.Element => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'running':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        );
      default: // pending
        return (
          <div className="w-8 h-8 rounded-full border-2 border-white/20 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white/20" />
          </div>
        );
    }
  };

  const getWorkerIcon = (worker: string): string => {
    const icons: Record<string, string> = {
      RAG: '🔍',
      Code: '💻',
      Shell: '⚡',
      Memory: '🧠',
      Web: '🌐',
      Vision: '👁️',
      Browser: '🌍',
      Router: '🔀',
    };
    return icons[worker] || '⚙️';
  };

  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const calculateDuration = (task: AgentWorkerTask | undefined): string => {
    if (!task || !task.created_at) return '';
    const start = new Date(task.created_at).getTime();
    const end = task.completed_at ? new Date(task.completed_at).getTime() : Date.now();
    const durationMs = end - start;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  return (
    <div className="glass rounded-2xl p-6 border-l-4" style={{ borderColor: theme.primary }}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: theme.primary }}>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white/90 mb-2">Orchestrator Reasoning</h3>
          <p className="text-sm text-white/70 leading-relaxed italic">
            "{reasoning}"
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wider">
          Execution Plan ({steps.length} steps)
        </div>

        {steps.map((step, idx) => {
          const status = getStepStatus(idx);
          const task = getStepTask(idx);
          const isExpanded = expandedSteps.has(idx);
          const hasDependencies = step.depends_on && step.depends_on.length > 0;

          return (
            <div key={idx} className="relative">
              {/* Vertical line connector */}
              {idx < steps.length - 1 && (
                <div
                  className="absolute left-4 top-8 w-0.5 h-[calc(100%+4px)] bg-white/10"
                  style={{
                    background: status === 'completed' ? theme.primary + '40' : 'rgba(255,255,255,0.1)'
                  }}
                />
              )}

              {/* Step card */}
              <div
                className={`relative bg-white/5 rounded-xl p-4 transition-all hover:bg-white/10 ${
                  status === 'running' ? 'ring-2 ring-blue-500/50' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Status icon */}
                  <div className="relative flex-shrink-0">
                    {getStepIcon(status)}

                    {/* Step number badge */}
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-mono text-white border border-white/30">
                      {idx}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getWorkerIcon(step.worker)}</span>
                        <span className="text-sm font-semibold text-white/90">
                          {step.worker} Worker
                        </span>

                        {/* Dependencies indicator */}
                        {hasDependencies && (
                          <span className="text-xs text-white/40 font-mono">
                            ← depends on [{step.depends_on!.join(', ')}]
                          </span>
                        )}
                      </div>

                      {/* Expand button */}
                      <button
                        onClick={() => toggleStep(idx)}
                        className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-white/60 leading-relaxed mb-2">
                      {step.description}
                    </p>

                    {/* Metadata */}
                    {task && (
                      <div className="flex items-center gap-3 text-xs text-white/40">
                        {task.created_at && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTimestamp(task.created_at)}
                          </span>
                        )}

                        {task.completed_at && (
                          <span>
                            Duration: {calculateDuration(task)}
                          </span>
                        )}

                        {task.tokens_used > 0 && (
                          <span>
                            {task.tokens_used.toLocaleString()} tokens
                          </span>
                        )}
                      </div>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        {/* Input parameters */}
                        {step.input && Object.keys(step.input).length > 0 && (
                          <div className="bg-black/40 rounded-lg p-3">
                            <div className="text-xs font-semibold text-cyan-400 mb-2">Input Parameters</div>
                            <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono">
                              {JSON.stringify(step.input, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Output data */}
                        {task?.output_data && status === 'completed' && (
                          <div className="bg-black/40 rounded-lg p-3">
                            <div className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Output
                            </div>
                            <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto custom-scrollbar">
                              {JSON.stringify(task.output_data, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Error */}
                        {task?.error && status === 'failed' && (
                          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                            <div className="text-xs font-semibold text-red-400 mb-2">Error</div>
                            <p className="text-xs text-red-300/90 font-mono">{task.error}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-xs text-white/50">
          <div className="flex items-center gap-4">
            <span>
              Completed: {steps.filter((_, idx) => getStepStatus(idx) === 'completed').length}/{steps.length}
            </span>
            {workerTasks.length > 0 && (
              <span>
                Total tokens: {workerTasks.reduce((sum, t) => sum + (t.tokens_used || 0), 0).toLocaleString()}
              </span>
            )}
          </div>

          {currentStepIdx >= 0 && currentStepIdx < steps.length && (
            <div className="text-blue-400">
              Current: Step {currentStepIdx} ({steps[currentStepIdx].worker})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
