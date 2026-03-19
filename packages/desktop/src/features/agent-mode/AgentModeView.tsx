/**
 * AgentModeView - Multi-agent orchestration UI.
 *
 * Redesigned layout:
 * - Scrollable content area with execution results
 * - Bottom composer-pill input bar (like ChatInput)
 * - TPM meter and history moved to sidebar
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgentModeStore } from '@/stores/agent-mode-store';
import { getPersonaTheme } from '@ahri/shared';
import { usePersonaStore } from '@/stores/persona-store';
import type { AgentWorkerTask } from '@ahri/shared';
import { AgentWebSocket } from '@/api/agent-websocket';
import { ReasoningTimeline } from '@/components/ReasoningTimeline';

export function AgentModeView() {
  const activePersona = usePersonaStore((s) => s.activePersona);
  const theme = getPersonaTheme(activePersona);

  const [goal, setGoal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeExecution = useAgentModeStore((s) => s.activeExecution);
  const isLoading = useAgentModeStore((s) => s.isLoading);
  const executeTask = useAgentModeStore((s) => s.executeTask);
  const setTPMStatus = useAgentModeStore((s) => s.setTPMStatus);

  const wsRef = useRef<AgentWebSocket | null>(null);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, []);

  // Setup WebSocket when execution starts
  useEffect(() => {
    if (!activeExecution || !activeExecution.id) return;

    const ws = new AgentWebSocket(activeExecution.id, {
      onConnected: (data) => {
        console.log('[AgentMode] WebSocket connected', data);
      },
      onStatusUpdate: (data) => {
        console.log('[AgentMode] Status update:', data.status);
      },
      onWorkerStarted: (data) => {
        console.log('[AgentMode] Worker started:', data.worker_type);
      },
      onWorkerCompleted: (data) => {
        console.log('[AgentMode] Worker completed:', data.worker_type, data.status);
      },
      onExecutionCompleted: (data) => {
        console.log('[AgentMode] Execution completed:', data.status);
      },
      onTPMStatus: (data) => {
        setTPMStatus({
          tokensUsed: data.tokens_used_window,
          tokensRemaining: data.tokens_remaining,
          limitTPM: data.limit_tpm,
          utilizationPercent: data.utilization_percent,
        });
      },
      onError: (error) => {
        console.error('[AgentMode] WebSocket error:', error);
      },
      onClose: () => {
        console.log('[AgentMode] WebSocket closed');
      },
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [activeExecution?.id, setTPMStatus]);

  // Auto-scroll on new execution content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeExecution?.status, activeExecution?.result]);

  const handleSubmit = async () => {
    if (!goal.trim() || isLoading) return;
    await executeTask(goal, 'PRO');
    setGoal('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const currentWorkerTasks = activeExecution?.worker_tasks || [];
  const hasActivePlan = activeExecution?.plan?.steps && activeExecution.plan.steps.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Execution Display */}
          {activeExecution && (
            <>
              {/* Execution status header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  activeExecution.status === 'running' ? 'animate-pulse' : ''
                }`} style={{ background: activeExecution.status === 'running' ? 'var(--info)' :
                  activeExecution.status === 'completed' ? 'var(--success)' :
                  activeExecution.status === 'failed' ? 'var(--error)' :
                  'var(--warning)'
                }} />
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                  Execucao #{activeExecution.id}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {activeExecution.status}
                </span>
              </div>

              {/* Goal display */}
              <div className="glass-subtle rounded-xl p-4">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {activeExecution.goal}
                </p>
              </div>

              {/* Reasoning Timeline */}
              {activeExecution.plan?.reasoning && hasActivePlan && (
                <ReasoningTimeline
                  reasoning={activeExecution.plan.reasoning}
                  steps={activeExecution.plan.steps}
                  workerTasks={currentWorkerTasks}
                  theme={theme}
                />
              )}

              {/* Worker Tasks */}
              {currentWorkerTasks.length > 0 && (
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Workers ({currentWorkerTasks.length})
                  </h3>
                  <div className="space-y-3">
                    {currentWorkerTasks.map((task) => (
                      <WorkerTaskCard key={task.id} task={task} theme={theme} />
                    ))}
                  </div>
                </div>
              )}

              {/* Final Result */}
              {activeExecution.status === 'completed' && activeExecution.result && (
                <div className="glass rounded-2xl p-6 border border-green-500/20">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--success)' }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resultado
                  </h3>
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {activeExecution.result}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {activeExecution.status === 'failed' && activeExecution.error && (
                <div className="glass rounded-2xl p-6 border border-red-500/30">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--error)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Falha na Execucao
                  </h3>
                  <p className="text-sm font-mono rounded-lg p-4" style={{ color: 'var(--error)', background: 'var(--surface-hover)' }}>
                    {activeExecution.error}
                  </p>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom Input Bar (composer-pill style) */}
      <div className="px-4 pb-4 pt-2">
        <div className="max-w-4xl mx-auto">
          <div className="composer-pill flex items-end gap-2 px-4 py-2">
            <textarea
              ref={textareaRef}
              value={goal}
              onChange={(e) => { setGoal(e.target.value); autoResize(); }}
              placeholder="Descreva uma tarefa para os agentes..."
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm py-2 px-0"
              style={{ color: 'var(--text-primary)', maxHeight: '128px' }}
              rows={1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!goal.trim() || isLoading}
              className="composer-icon-btn flex-shrink-0 mb-1"
              style={
                goal.trim() && !isLoading
                  ? {
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                      color: 'rgba(0,0,0,0.85)',
                    }
                  : undefined
              }
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--spinner-track)', borderTopColor: 'var(--spinner-head)' }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Meta bar */}
          <div className="flex items-center justify-between mt-1.5 px-2">
            <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {activeExecution ? (
                <span className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    activeExecution.status === 'running' ? 'animate-pulse' : ''
                  }`} style={{ background: activeExecution.status === 'running' ? 'var(--info)' :
                    activeExecution.status === 'completed' ? 'var(--success)' :
                    activeExecution.status === 'failed' ? 'var(--error)' :
                    'var(--warning)'
                  }} />
                  #{activeExecution.id} {activeExecution.status}
                </span>
              ) : (
                <span>Enter para executar</span>
              )}
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
              Agent Mode
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Worker Task Card Component
function WorkerTaskCard({ task, theme }: { task: AgentWorkerTask; theme: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl p-4 transition-colors" style={{ background: 'var(--surface-hover)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: theme.primary }}>
            {getWorkerIcon(task.worker_type)}
          </div>
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{task.worker_type} Worker</span>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {task.model}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
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
      </div>

      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {task.duration_ms > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {(task.duration_ms / 1000).toFixed(2)}s
          </span>
        )}
        {task.tokens_used > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {task.tokens_used.toLocaleString()} tokens
          </span>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {task.status === 'completed' && task.output_data && (
            <div className="rounded-lg p-3" style={{ background: 'var(--code-bg)' }}>
              <div className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Output
              </div>
              <pre className="text-xs whitespace-pre-wrap font-mono max-h-60 overflow-y-auto custom-scrollbar" style={{ color: 'var(--text-secondary)' }}>
                {JSON.stringify(task.output_data, null, 2)}
              </pre>
            </div>
          )}

          {task.status === 'failed' && task.error && (
            <div className="rounded-lg p-3 border" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--error) 20%, transparent)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--error)' }}>Error</div>
              <p className="text-xs font-mono" style={{ color: 'var(--error)' }}>{task.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const configs = {
    pending: { color: 'var(--warning)', icon: '...' },
    running: { color: 'var(--info)', icon: '~' },
    completed: { color: 'var(--success)', icon: 'ok' },
    failed: { color: 'var(--error)', icon: 'x' },
  };

  const config = configs[status as keyof typeof configs] || configs.pending;

  return (
    <span
      className="text-xs px-2 py-1 rounded-full border font-medium flex items-center gap-1"
      style={{ color: config.color, borderColor: config.color, background: `color-mix(in srgb, ${config.color} 20%, transparent)` }}
    >
      <span className="font-mono">{config.icon}</span>
      <span>{status}</span>
    </span>
  );
}

// Worker icon helper
function getWorkerIcon(worker: string): string {
  const icons: Record<string, string> = {
    RAG: 'R',
    Code: 'C',
    Shell: 'S',
    Memory: 'M',
    Web: 'W',
    Vision: 'V',
    Browser: 'B',
    Router: 'Rt',
  };
  return icons[worker] || '?';
}
