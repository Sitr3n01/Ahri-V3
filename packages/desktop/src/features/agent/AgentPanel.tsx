import { useAgentStore } from '@/stores/agent-store';
import type { AgentTask } from '@ahri/shared';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: 'Pending' },
  approved:  { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'Approved' },
  running:   { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'Running' },
  completed: { bg: 'bg-green-500/20',  text: 'text-green-300',  label: 'Completed' },
  failed:    { bg: 'bg-red-500/20',    text: 'text-red-300',    label: 'Failed' },
};

function TaskCard({ task }: { task: AgentTask }) {
  const approveTask = useAgentStore((s) => s.approveTask);
  const updateTask = useAgentStore((s) => s.updateTask);
  const style = STATUS_STYLES[task.status] ?? STATUS_STYLES.pending;

  return (
    <div className="glass rounded-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/80 font-medium font-mono">
          {task.capability}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
          {style.label}
        </span>
      </div>

      {/* Parameters */}
      {Object.keys(task.parameters).length > 0 && (
        <div className="text-[11px] text-white/50 bg-black/20 rounded-lg p-2 font-mono break-all">
          {Object.entries(task.parameters).map(([k, v]) => (
            <div key={k}>
              <span className="text-white/30">{k}:</span>{' '}
              <span className="text-white/60">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result or Error */}
      {task.status === 'completed' && task.result && (
        <div className="text-[11px] text-green-300/70 bg-green-500/5 rounded-lg p-2 break-all max-h-24 overflow-y-auto">
          {task.result}
        </div>
      )}
      {task.status === 'failed' && task.error && (
        <div className="text-[11px] text-red-300/70 bg-red-500/5 rounded-lg p-2 break-all max-h-24 overflow-y-auto">
          {task.error}
        </div>
      )}

      {/* Actions for pending tasks */}
      {task.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => approveTask(task.id)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => updateTask(task.id, { status: 'failed', error: 'Denied by user' })}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            Deny
          </button>
        </div>
      )}

      {/* Timestamp */}
      {task.created_at && (
        <p className="text-[9px] text-white/20">
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
    <aside className="w-80 h-full glass-dark flex flex-col border-l border-white/5">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white/80">Agent Tasks</h2>
          {pendingCount > 0 && (
            <span className="w-5 h-5 bg-yellow-500/30 rounded-full text-[10px] text-yellow-300 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/30 hover:text-white/60 text-[10px]"
              title="Clear completed"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/30 hover:text-white/60"
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
              <p className="text-sm text-white/20">No tasks</p>
              <p className="text-[10px] text-white/10 mt-1">
                Agent tasks will appear here
              </p>
            </div>
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <p className="text-[10px] text-white/20 text-center">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
        </p>
      </div>
    </aside>
  );
}
