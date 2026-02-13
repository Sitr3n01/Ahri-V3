/**
 * Execution History Panel - Shows past agent mode executions.
 */

import { useState } from 'react';
import type { AgentExecution } from '@ahri/shared';

interface ExecutionHistoryProps {
  executions: AgentExecution[];
  onSelectExecution: (execution: AgentExecution) => void;
  onClearHistory?: () => void;
  onDeleteExecution?: (executionId: number) => void;
}

export function ExecutionHistory({
  executions,
  onSelectExecution,
  onClearHistory,
  onDeleteExecution,
}: ExecutionHistoryProps) {
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'running'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'fastest' | 'slowest'>('newest');
  const [orchestratorFilter, setOrchestratorFilter] = useState<string>('all');

  // Get unique orchestrator models
  const uniqueOrchestrators = Array.from(
    new Set(executions.map(e => e.orchestrator_model))
  ).filter(Boolean);

  const filteredExecutions = executions
    .filter((exec) => {
      // Status filter
      if (filter !== 'all' && exec.status !== filter) return false;

      // Search filter
      if (searchQuery && !exec.goal.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Orchestrator filter
      if (orchestratorFilter !== 'all' && exec.orchestrator_model !== orchestratorFilter) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'fastest':
        case 'slowest': {
          const getDuration = (exec: AgentExecution): number => {
            if (!exec.completed_at) return Infinity;
            return new Date(exec.completed_at).getTime() - new Date(exec.created_at).getTime();
          };
          const durationA = getDuration(a);
          const durationB = getDuration(b);
          return sortBy === 'fastest' ? durationA - durationB : durationB - durationA;
        }
        default:
          return 0;
      }
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'planning':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✕';
      case 'running':
        return '⟳';
      case 'planning':
        return '…';
      default:
        return '?';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="glass-dark rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Execution History</h3>
          {onClearHistory && executions.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search executions..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-9 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 transition-colors"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 mb-3">
          {(['all', 'completed', 'failed', 'running'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-white/20 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Advanced Filters */}
        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="fastest">Fastest first</option>
            <option value="slowest">Slowest first</option>
          </select>

          {/* Orchestrator filter */}
          {uniqueOrchestrators.length > 1 && (
            <select
              value={orchestratorFilter}
              onChange={(e) => setOrchestratorFilter(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors"
            >
              <option value="all">All models</option>
              {uniqueOrchestrators.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        {filteredExecutions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            {filter === 'all' ? 'No executions yet' : `No ${filter} executions`}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredExecutions.map((execution) => (
              <div
                key={execution.id}
                className="relative p-4 hover:bg-white/5 transition-colors group"
              >
                {/* Delete button */}
                {onDeleteExecution && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete execution "${execution.goal.substring(0, 50)}..."?`)) {
                        onDeleteExecution(execution.id);
                      }
                    }}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400"
                    title="Delete execution"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                <button
                  onClick={() => onSelectExecution(execution)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                  {/* Status badge */}
                  <div
                    className={`mt-0.5 px-2 py-1 rounded border text-xs font-mono ${getStatusColor(
                      execution.status
                    )}`}
                  >
                    {getStatusIcon(execution.status)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium line-clamp-2 group-hover:text-cyan-400 transition-colors">
                      {execution.goal}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatDate(execution.created_at)}</span>
                      <span>•</span>
                      <span>{execution.worker_tasks?.length || 0} workers</span>
                      {execution.completed_at && (
                        <>
                          <span>•</span>
                          <span>
                            {Math.round(
                              (new Date(execution.completed_at).getTime() -
                                new Date(execution.created_at).getTime()) /
                                1000
                            )}s
                          </span>
                        </>
                      )}
                    </div>

                    {/* Model */}
                    <div className="mt-1 text-[10px] text-gray-600 font-mono">
                      {execution.orchestrator_model}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors flex-shrink-0 mt-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
