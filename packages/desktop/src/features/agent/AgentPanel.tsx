import { useAgentStore } from '@/stores/agent-store';
import type { AgentTask } from '@ahri/shared';

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  pending:   { color: 'var(--warning)', label: 'Pending' },
  approved:  { color: 'var(--info)',    label: 'Approved' },
  running:   { color: 'var(--info)',    label: 'Running' },
  completed: { color: 'var(--success)', label: 'Completed' },
  failed:    { color: 'var(--error)',   label: 'Failed' },
};

function TaskCard({ task }: { task: AgentTask }) {
  const approveTask = useAgentStore((s) => s.approveTask);
  const updateTask = useAgentStore((s) => s.updateTask);
  const style = STATUS_STYLES[task.status] ?? STATUS_STYLES.pending;

  return (
    <div className="glass rounded-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
          {task.capability}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: style.color, background: `color-mix(in srgb, ${style.color} 20%, transparent)` }}>
          {style.label}
        </span>
      </div>

      {/* Parameters */}
      {Object.keys(task.parameters).length > 0 && (
        <div className="text-[11px] rounded-lg p-2 font-mono break-all" style={{ color: 'var(--text-secondary)', background: 'var(--code-bg)' }}>
          {Object.entries(task.parameters).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: 'var(--text-tertiary)' }}>{k}:</span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result or Error */}
      {task.status === 'completed' && task.result && (
        <div className="text-[11px] rounded-lg p-2 break-all max-h-24 overflow-y-auto" style={{ color: 'var(--success)', background: 'var(--surface-hover)' }}>
          {task.result}
        </div>
      )}
      {task.status === 'failed' && task.error && (
        <div className="text-[11px] rounded-lg p-2 break-all max-h-24 overflow-y-auto" style={{ color: 'var(--error)', background: 'var(--surface-hover)' }}>
          {task.error}
        </div>
      )}

      {/* Actions for pending tasks */}
      {task.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => approveTask(task.id)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 20%, transparent)' }}
          >
            Approve
          </button>
          <button
            onClick={() => updateTask(task.id, { status: 'failed', error: 'Denied by user' })}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--error)', background: 'color-mix(in srgb, var(--error) 20%, transparent)' }}
          >
            Deny
          </button>
        </div>
      )}

      {/* Timestamp */}
      {task.created_at && (
        <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
          {new Date(task.created_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export function AgentPanel() {
  const tasks = useAgentStore((s) => s.tasks);
  const setPanelOpen = useAgentStore((s) => s.setPanelOpen);
  const clearCompleted = useAgentStore((s) => s.clearCompleted);

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const hasCompleted = tasks.some((t) => t.status === 'completed' || t.status === 'failed');

  return (
    <aside className="w-80 h-full flex flex-col border-l relative z-10" style={{ 
      borderColor: 'var(--glass-border)',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(24px) saturate(150%)',
      boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.15)'
    }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Agent Tasks</h2>
          {pendingCount > 0 && (
            <span className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)', color: 'var(--warning)' }}>
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="p-1.5 rounded-lg transition-colors text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
              title="Clear completed"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            title="Close panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No tasks</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Agent tasks will appear here
              </p>
            </div>
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>

      {/* Footer */}
      <div className="p-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <p className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
        </p>
      </div>
    </aside>
  );
}
