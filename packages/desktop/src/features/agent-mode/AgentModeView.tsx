/**
 * AgentModeView (Phase 3) - Advanced multi-agent orchestration UI.
 *
 * New features:
 * - WebSocket real-time streaming
 * - Dependency graph visualization
 * - TPM quota meter
 * - Execution history panel
 * - Agent reasoning display
 */

import { useState, useEffect, useRef } from 'react';
import { useAgentModeStore } from '@/stores/agent-mode-store';
import { getPersonaTheme } from '@ahri/shared';
import { usePersonaStore } from '@/stores/persona-store';
import type { AgentWorkerTask, AgentExecution } from '@ahri/shared';
import { AgentWebSocket } from '@/api/agent-websocket';
import { TPMQuotaMeter } from '@/components/TPMQuotaMeter';
import { DependencyGraph } from '@/components/DependencyGraph';
import { ExecutionHistory } from '@/components/ExecutionHistory';
import { ReasoningTimeline } from '@/components/ReasoningTimeline';

export function AgentModeView() {
  const activePersona = usePersonaStore((s) => s.activePersona);
  const theme = getPersonaTheme(activePersona);

  const [goal, setGoal] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [tpmStatus, setTPMStatus] = useState({
    tokensUsed: 0,
    tokensRemaining: 15000,
    limitTPM: 15000,
    utilizationPercent: 0,
  });

  const activeExecution = useAgentModeStore((s) => s.activeExecution);
  const executions = useAgentModeStore((s) => s.executions);
  const isLoading = useAgentModeStore((s) => s.isLoading);
  const executeTask = useAgentModeStore((s) => s.executeTask);
  const setActiveExecution = useAgentModeStore((s) => s.setActiveExecution);
  const clearExecutions = useAgentModeStore((s) => s.clearHistory);
  const deleteExecution = useAgentModeStore((s) => s.deleteExecution);

  const wsRef = useRef<AgentWebSocket | null>(null);

  // Setup WebSocket when execution starts
  useEffect(() => {
    if (!activeExecution || !activeExecution.id) return;

    // Create WebSocket connection
    const ws = new AgentWebSocket(activeExecution.id, {
      onConnected: (data) => {
        console.log('[AgentMode] WebSocket connected', data);
      },

      onStatusUpdate: (data) => {
        console.log('[AgentMode] Status update:', data.status);
        // Update will be handled by polling in the store
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

    // Cleanup on unmount or execution change
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [activeExecution?.id]);

  const handleSubmit = async () => {
    if (!goal.trim() || isLoading) return;
    await executeTask(goal, 'PRO');
    setGoal(''); // Clear input after submission
  };

  const handleSelectHistory = (execution: AgentExecution) => {
    setActiveExecution(execution);
    setShowHistory(false);
  };

  const currentWorkerTasks = activeExecution?.worker_tasks || [];
  const hasActivePlan = activeExecution?.plan?.steps && activeExecution.plan.steps.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header with TPM Meter */}
      <div className="p-4 border-b border-white/5 glass-dark">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold text-white/90 mb-1">Agent Mode</h2>
              <p className="text-sm text-white/40">
                Phase 3: Multi-agent orchestration with real-time streaming
              </p>
            </div>

            <button
              onClick={() => setShowHistory(!showHistory)}
              className="glass rounded-lg px-4 py-2 text-sm text-white/70 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History ({executions.length})
            </button>
          </div>

          {/* TPM Quota Meter */}
          <TPMQuotaMeter
            tokensUsed={tpmStatus.tokensUsed}
            tokensRemaining={tpmStatus.tokensRemaining}
            limitTPM={tpmStatus.limitTPM}
            utilizationPercent={tpmStatus.utilizationPercent}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* History Sidebar */}
        {showHistory && (
          <div className="w-80 border-r border-white/5 overflow-y-auto">
            <ExecutionHistory
              executions={executions}
              onSelectExecution={handleSelectHistory}
              onClearHistory={clearExecutions}
              onDeleteExecution={deleteExecution}
            />
          </div>
        )}

        {/* Main Panel */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Task Input */}
            <div className="glass-strong rounded-2xl p-6">
              <label className="block text-sm font-medium text-white/70 mb-3">
                Task Goal
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Describe what you want the agent system to accomplish...&#10;&#10;Examples:&#10;• 'Analyze this Python code and suggest improvements'&#10;• 'Search my memories for information about Japanese learning'&#10;• 'Fetch the latest news from example.com and summarize'"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors resize-none"
                rows={6}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />

              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-white/30">
                  {activeExecution ? (
                    <span className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        activeExecution.status === 'running' ? 'bg-blue-400 animate-pulse' :
                        activeExecution.status === 'completed' ? 'bg-green-400' :
                        activeExecution.status === 'failed' ? 'bg-red-400' :
                        'bg-yellow-400'
                      }`} />
                      Execution #{activeExecution.id} • {activeExecution.status}
                    </span>
                  ) : (
                    <span>⌘+Enter to execute</span>
                  )}
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!goal.trim() || isLoading}
                  className="px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                    boxShadow: `0 4px 12px ${theme.shadow}`,
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Executing...
                    </span>
                  ) : (
                    'Execute Task'
                  )}
                </button>
              </div>
            </div>

            {/* Execution Display */}
            {activeExecution && (
              <>
                {/* Reasoning Timeline (replaces both reasoning display and dependency graph) */}
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
                    <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Worker Tasks ({currentWorkerTasks.length})
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
                    <h3 className="text-sm font-semibold text-green-400 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Final Result
                    </h3>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <div className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                        {activeExecution.result}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
                {activeExecution.status === 'failed' && activeExecution.error && (
                  <div className="glass rounded-2xl p-6 border border-red-500/30">
                    <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Execution Failed
                    </h3>
                    <p className="text-sm text-red-300/90 font-mono bg-red-500/10 rounded-lg p-4">
                      {activeExecution.error}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!activeExecution && !isLoading && (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl glass flex items-center justify-center">
                  <svg className="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white/70 mb-3">
                  Ready for Multi-Agent Orchestration
                </h3>
                <p className="text-sm text-white/50 max-w-lg mx-auto leading-relaxed">
                  Describe a complex task above and the orchestrator will plan, delegate to specialized workers,
                  and synthesize a final result. All 8 workers are available: RAG, Code, Shell, Memory, Web, Vision, Browser, Router.
                </p>
              </div>
            )}
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
    <div className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: theme.primary }}>
            {getWorkerIcon(task.worker_type)}
          </div>
          <div>
            <span className="text-sm font-medium text-white/90">{task.worker_type} Worker</span>
            <div className="text-xs text-white/40 mt-0.5">
              {task.model}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white/40 hover:text-white/80 transition-colors"
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

      <div className="flex items-center gap-3 text-xs text-white/50">
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
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          {task.status === 'completed' && task.output_data && (
            <div className="bg-black/40 rounded-lg p-3">
              <div className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Output
              </div>
              <pre className="text-xs text-white/80 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto custom-scrollbar">
                {JSON.stringify(task.output_data, null, 2)}
              </pre>
            </div>
          )}

          {task.status === 'failed' && task.error && (
            <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
              <div className="text-xs font-semibold text-red-400 mb-2">Error</div>
              <p className="text-xs text-red-300/90 font-mono">{task.error}</p>
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
    pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: '⏳' },
    running: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: '⟳' },
    completed: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: '✓' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: '✕' },
  };

  const config = configs[status as keyof typeof configs] || configs.pending;

  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${config.bg} ${config.text} ${config.border} font-medium flex items-center gap-1`}>
      <span>{config.icon}</span>
      <span>{status}</span>
    </span>
  );
}

// Worker icon helper
function getWorkerIcon(worker: string): string {
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
}
