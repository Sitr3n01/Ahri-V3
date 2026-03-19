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

interface StatusStyle {
  background: string;
  color: string;
  borderColor: string;
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

  const getStatusStyle = (status: string): StatusStyle => {
    switch (status) {
      case 'completed':
        return {
          background: 'color-mix(in srgb, var(--success) 20%, transparent)',
          color: 'var(--success)',
          borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
        };
      case 'failed':
        return {
          background: 'color-mix(in srgb, var(--error) 20%, transparent)',
          color: 'var(--error)',
          borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)',
        };
      case 'running':
        return {
          background: 'color-mix(in srgb, var(--info) 20%, transparent)',
          color: 'var(--info)',
          borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)',
        };
      case 'planning':
        return {
          background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
          color: 'var(--warning)',
          borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
        };
      default:
        return {
          background: 'var(--surface-hover)',
          color: 'var(--text-secondary)',
          borderColor: 'var(--glass-border)',
        };
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
      <div className="p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Execution History</h3>
          {onClearHistory && executions.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
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
            className="w-full rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none transition-colors"
            style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
            }}
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4"
            style={{ color: 'var(--text-tertiary)' }}
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
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={
                filter === f
                  ? { background: 'var(--surface-elevated)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }
              }
              onMouseEnter={(e) => {
                if (filter !== f) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'var(--surface-active)';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== f) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
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
            className="flex-1 rounded-lg px-2 py-1.5 text-xs focus:outline-none transition-colors"
            style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
            }}
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
              className="flex-1 rounded-lg px-2 py-1.5 text-xs focus:outline-none transition-colors"
              style={{
                background: 'var(--surface-hover)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
              }}
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
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {filter === 'all' ? 'No executions yet' : `No ${filter} executions`}
          </div>
        ) : (
          <div className="divide-y" style={{ '--tw-divide-opacity': '1', borderColor: 'var(--surface-hover)' } as React.CSSProperties}>
            {filteredExecutions.map((execution) => {
              const statusStyle = getStatusStyle(execution.status);
              return (
                <div
                  key={execution.id}
                  className="relative p-4 transition-colors group"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
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
                      className="mt-0.5 px-2 py-1 rounded border text-xs font-mono"
                      style={{
                        background: statusStyle.background,
                        color: statusStyle.color,
                        borderColor: statusStyle.borderColor,
                      }}
                    >
                      {getStatusIcon(execution.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2 transition-colors" style={{ color: 'var(--text-primary)' }}>
                        {execution.goal}
                      </p>

                      <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
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
                      <div className="mt-1 text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {execution.orchestrator_model}
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 transition-colors flex-shrink-0 mt-1"
                      style={{ color: 'var(--text-tertiary)' }}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
