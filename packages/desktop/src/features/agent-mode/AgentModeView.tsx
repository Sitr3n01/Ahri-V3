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
import { DirectorySelector } from '@/components/DirectorySelector';
import { AgentModelSelector } from '@/components/AgentModelSelector';
import { AgentReasoningSelector } from '@/components/AgentReasoningSelector';
import type { Attachment } from '@/stores/chat-store';

export function AgentModeView() {
  const activePersona = usePersonaStore((s) => s.activePersona);
  const theme = getPersonaTheme(activePersona);

  const [goal, setGoal] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeExecution = useAgentModeStore((s) => s.activeExecution);
  const isLoading = useAgentModeStore((s) => s.isLoading);
  const executeTask = useAgentModeStore((s) => s.executeTask);
  const setTPMStatus = useAgentModeStore((s) => s.setTPMStatus);
  const internetSearchEnabled = useAgentModeStore((s) => s.internetSearchEnabled);
  const setInternetSearchEnabled = useAgentModeStore((s) => s.setInternetSearchEnabled);

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
          requestsUsed: data.requests_used ?? 0,
          requestsRemaining: data.requests_remaining ?? 15,
          limitRPM: data.limit_rpm ?? 15,
          rpmUtilizationPercent: data.rpm_utilization_percent ?? 0,
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

  const processFile = useCallback(async (file: File) => {
    const reader = new FileReader();
    return new Promise<void>((resolve) => {
      reader.onload = (e) => {
        const result = e.target?.result as string;
        let type: 'image' | 'video' | 'pdf' | null = null;
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type === 'application/pdf') type = 'pdf';

        if (type) {
          setAttachments(prev => [...prev, {
            type: type!,
            data: result,
            name: file.name,
            preview: type === 'image' ? result : undefined
          }]);
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await Promise.all(files.map(processFile));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await Promise.all(files.map(processFile));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await Promise.all(files.map(processFile));
    }
  };

  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*,video/*,application/pdf';
      fileInputRef.current.click();
    }
  };

  const handleSubmit = async () => {
    if ((!goal.trim() && attachments.length === 0) || isLoading) return;
    await executeTask(goal);
    setGoal('');
    setAttachments([]);
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
        <div className="max-w-3xl mx-auto w-full space-y-4">
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
              {activeExecution.result && (
                <div className="mt-8 mb-4 animate-fade-in">
                  <div className="flex items-center gap-3 mb-4">
                     <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                     </div>
                     <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ahri</span>
                  </div>
                  <div className="prose prose-sm max-w-none pl-9">
                    <div className="text-[0.95rem] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>
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

      {/* Bottom Input Bar (chat style composer pill) */}
      <div 
        className="px-4 pb-4 pt-2 max-w-3xl mx-auto w-full animate-fade-in-up" 
        style={{ animationDuration: '0.4s' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`relative ${isDragging ? 'opacity-50' : ''}`}>
          <div
            className="flex flex-col bg-[var(--sidebar-bg)] rounded-2xl p-2 shadow-lg backdrop-blur-xl transition-all duration-300 ease-out border border-[var(--glass-border)] focus-within:-translate-y-2 focus-within:border-[var(--persona-primary)] focus-within:shadow-[0_16px_48px_rgba(0,0,0,0.25)]"
          >
            {/* Attachments Preview Area (Inside Pill) */}
            {attachments.length > 0 && (
              <div className="flex gap-2 flex-wrap px-2 pt-2">
                {attachments.map((att, idx) => (
                  <div 
                    key={idx} 
                    className="relative group rounded-xl overflow-hidden border flex-shrink-0 animate-fade-in-up" 
                    style={{ 
                      borderColor: 'var(--glass-border)', 
                      background: 'var(--surface-hover)',
                      animationDuration: '0.3s',
                      animationFillMode: 'both',
                    }}
                  >
                    {att.type === 'image' && att.preview ? (
                      <img src={att.preview} alt={att.name} className="w-14 h-14 object-cover" />
                    ) : (
                      <div className="w-14 h-14 flex flex-col items-center justify-center p-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: att.type === 'pdf' ? 'var(--error)' : 'var(--warning)' }}>
                          {att.type === 'pdf' ? (
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          ) : (
                            <polygon points="23 7 16 12 23 17 23 7" />
                          )}
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-[8px] font-mono mt-1 opacity-70 truncate max-w-full px-1">{att.type.toUpperCase()}</span>
                      </div>
                    )}
                    {/* Remove Button Overlay */}
                    <button
                      onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* TOP: Textarea */}
            <div className="px-2 pt-2 pb-1 relative">
              <textarea
                ref={textareaRef}
                value={goal}
                onPaste={handlePaste}
                onChange={(e) => { setGoal(e.target.value); autoResize(); }}
                placeholder="Descreva uma tarefa complexa para os agentes..."
                className="w-full bg-transparent text-[0.95rem] resize-none outline-none max-h-32 placeholder:font-sans placeholder:text-gray-500"
                style={{ color: 'var(--text-primary)', caretColor: 'var(--persona-primary)' }}
                rows={1}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>

            {/* BOTTOM: Actions Row */}
            <div className="flex justify-between items-center px-1 mt-1">
              {/* Left side: Clip + Directory + Terminal + Editor + Status */}
              <div className="flex items-center gap-1.5">
                {/* Paperclip attach button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileSelect();
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-full transition-colors text-[var(--text-tertiary)] hover:bg-white/5 hover:text-white"
                  title="Anexar arquivo"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                {/* Directory Selector */}
                <DirectorySelector theme={theme} />

                {/* Terminal shortcut */}
                <button
                  onClick={() => {
                    const dir = useAgentModeStore.getState().selectedDirectory;
                    if (dir && window.ahri?.agent?.openTerminal) {
                      window.ahri.agent.openTerminal(dir).catch((err: unknown) =>
                        console.error('[AgentMode] Failed to open terminal:', err)
                      );
                    }
                  }}
                  disabled={!useAgentModeStore.getState().selectedDirectory}
                  className="flex items-center justify-center w-7 h-7 rounded-full transition-colors text-[var(--text-secondary)] hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:pointer-events-none"
                  title="Abrir terminal no diretório"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                </button>

                {/* Editor shortcut */}
                <button
                  onClick={() => {
                    const dir = useAgentModeStore.getState().selectedDirectory;
                    if (dir && window.ahri?.agent?.openEditor) {
                      window.ahri.agent.openEditor(dir).catch((err: unknown) =>
                        console.error('[AgentMode] Failed to open editor:', err)
                      );
                    }
                  }}
                  disabled={!useAgentModeStore.getState().selectedDirectory}
                  className="flex items-center justify-center w-7 h-7 rounded-full transition-colors text-[var(--text-secondary)] hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:pointer-events-none"
                  title="Abrir VS Code no diretório"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>

                {/* Internet search toggle */}
                <button
                  onClick={() => setInternetSearchEnabled(!internetSearchEnabled)}
                  className="flex items-center justify-center w-7 h-7 rounded-full transition-all hover:bg-white/5"
                  style={{
                    color: internetSearchEnabled ? theme.primary : 'var(--text-tertiary)',
                    background: internetSearchEnabled
                      ? `color-mix(in srgb, ${theme.primary} 15%, transparent)`
                      : 'transparent',
                  }}
                  title={internetSearchEnabled ? 'Pesquisa web ativa' : 'Ativar pesquisa web'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </button>

                {/* Status indicator */}
                {activeExecution && (
                  <div className="text-[10px] opacity-60 flex items-center ml-1" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="flex items-center gap-1.5 font-mono">
                      <div className={`w-1.5 h-1.5 rounded-full ${activeExecution.status === 'running' ? 'animate-pulse' : ''}`}
                        style={{ background: activeExecution.status === 'running' ? 'var(--info)' :
                        activeExecution.status === 'completed' ? 'var(--success)' :
                        activeExecution.status === 'failed' ? 'var(--error)' : 'var(--warning)' }} />
                      #{activeExecution.id} {activeExecution.status}
                    </span>
                  </div>
                )}
              </div>

              {/* Right side: Reasoning + Submit */}
              <div className="flex items-center gap-2">
                <AgentModelSelector theme={theme} />
                <AgentReasoningSelector />

                <button
                  onClick={handleSubmit}
                  disabled={(!goal.trim() && attachments.length === 0) || isLoading}
                  className={`flex items-center justify-center h-8 px-2.5 rounded-full transition-all duration-300 ${
                    (goal.trim() || attachments.length > 0) && !isLoading
                      ? 'bg-[var(--persona-primary)] text-white scale-100 hover:scale-105 shadow-md'
                      : 'bg-[var(--surface-hover)] text-[var(--text-tertiary)] opacity-60 pointer-events-none'
                  }`}
                  title="Enviar (Ctrl + Enter)"
                >
                  <span className="text-[10px] font-bold mr-1.5 opacity-90 hidden sm:inline">Ctrl+Enter</span>
                  {isLoading ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
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
