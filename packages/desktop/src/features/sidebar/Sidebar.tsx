import { useState } from 'react';
import { usePersonaStore } from '@/stores/persona-store';
import { useChatStore } from '@/stores/chat-store';
import { useAgentStore } from '@/stores/agent-store';
import { useAuthStore } from '@/stores/auth-store';
import { getPersonaTheme } from '@ahri/shared';
import type { AppMode } from '@/App';

interface SidebarProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export function Sidebar({ mode, setMode }: SidebarProps) {
  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);
  const activatePersona = usePersonaStore((s) => s.activatePersona);
  const backgroundOpacity = usePersonaStore((s) => s.backgroundOpacity);
  const setBackgroundOpacity = usePersonaStore((s) => s.setBackgroundOpacity);
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const loadSession = useChatStore((s) => s.loadSession);
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const toggleAgentPanel = useAgentStore((s) => s.togglePanel);
  const agentTasks = useAgentStore((s) => s.tasks);
  const logout = useAuthStore((s) => s.logout);

  const [personaSectionOpen, setPersonaSectionOpen] = useState(true);
  const [sessionsSectionOpen, setSessionsSectionOpen] = useState(true);
  const [showPersonaList, setShowPersonaList] = useState(false);
  const [isAutoPersonaEnabled, setIsAutoPersonaEnabled] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const pendingTasks = agentTasks.filter((t) => t.status === 'pending').length;
  const currentPersonaData = personas.find((p) => p.name === activePersona);

  const toggleAutoPersona = async () => {
    if (isAutoPersonaEnabled) {
      await window.ahri?.autoPersona.stop();
      setIsAutoPersonaEnabled(false);
    } else {
      await window.ahri?.autoPersona.start();
      setIsAutoPersonaEnabled(true);
    }
  };

  return (
    <aside className="agent-panel h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-agent-border flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-agent-text-primary">AHRI</h1>
          <p className="text-xs text-agent-text-tertiary font-mono">v3.1</p>
        </div>
        <div className="flex items-center gap-1">
          {/* Agent Panel Toggle */}
          <button
            onClick={toggleAgentPanel}
            className="agent-button-icon relative"
            title="Agent Tasks"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 11h6M9 15h6"/>
            </svg>
            {pendingTasks > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-agent-error rounded-full" />
            )}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="agent-button-icon"
            title="Logout"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="p-2 border-b border-agent-border">
        <div className="text-xs text-agent-text-tertiary font-mono mb-1 px-1 tracking-wide">
          MODE
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode('chat')}
            className={`
              flex-1 py-1.5 text-xs font-mono rounded-sm transition-all
              ${mode === 'chat'
                ? 'bg-agent-accent text-black font-semibold'
                : 'bg-agent-bg-tertiary text-agent-text-secondary hover:bg-agent-bg-tertiary/60'
              }
            `}
          >
            CHAT
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`
              flex-1 py-1.5 text-xs font-mono rounded-sm transition-all
              ${mode === 'agent'
                ? 'bg-agent-accent text-black font-semibold'
                : 'bg-agent-bg-tertiary text-agent-text-secondary hover:bg-agent-bg-tertiary/60'
              }
            `}
          >
            AGENT
          </button>
        </div>
      </div>

      {/* Persona Section */}
      <div className="border-b border-agent-border">
        <button
          onClick={() => setPersonaSectionOpen(!personaSectionOpen)}
          className="w-full p-2 flex items-center justify-between hover:bg-agent-bg-tertiary/40 transition-colors"
        >
          <span className="text-xs text-agent-text-tertiary font-mono tracking-wide">
            PERSONA
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`transition-transform text-agent-text-tertiary ${personaSectionOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {personaSectionOpen && (
          <div className="px-2 pb-2">
            {/* Current Persona */}
            <button
              onClick={() => setShowPersonaList(!showPersonaList)}
              className="w-full surface-1 p-2 flex items-center gap-2 hover:bg-agent-bg-tertiary transition-colors rounded-md"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden border border-agent-border-strong flex-shrink-0">
                <img
                  src={`/${getPersonaTheme(activePersona).avatar}`}
                  alt={activePersona}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.style.background = getPersonaTheme(activePersona).primary;
                  }}
                />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-medium text-agent-text-primary truncate capitalize">
                  {currentPersonaData?.display_name || activePersona}
                </p>
                <p className="text-xs text-agent-text-tertiary font-mono">
                  [{personas.length} total]
                </p>
              </div>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Persona List Dropdown */}
            {showPersonaList && (
              <div className="mt-1 surface-2 max-h-48 overflow-y-auto rounded-md">
                {personas.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      activatePersona(p.name);
                      setShowPersonaList(false);
                    }}
                    className={`
                      w-full px-2 py-1.5 flex items-center gap-2 text-left transition-colors
                      ${p.name === activePersona
                        ? 'bg-agent-accent/20 text-agent-accent'
                        : 'hover:bg-agent-bg-tertiary text-agent-text-secondary'
                      }
                    `}
                  >
                    <div className="w-4 h-4 rounded-full overflow-hidden border border-agent-border">
                      <img
                        src={`/${getPersonaTheme(p.name).avatar}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xs truncate">{p.display_name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Spotify Sync */}
            <button
              onClick={toggleAutoPersona}
              className={`
                w-full mt-1.5 py-1 rounded-md text-xs font-mono transition-colors border
                ${isAutoPersonaEnabled
                  ? 'bg-agent-success/10 border-agent-success/30 text-agent-success'
                  : 'border-agent-border text-agent-text-tertiary hover:bg-agent-bg-tertiary'
                }
              `}
            >
              {isAutoPersonaEnabled ? 'Spotify: ON' : 'Spotify: OFF'}
            </button>
          </div>
        )}
      </div>

      {/* Background Opacity Section */}
      {mode === 'chat' && (
        <div className="border-b border-agent-border p-2">
          <div className="text-xs text-agent-text-tertiary font-mono mb-2 px-1 tracking-wide flex items-center justify-between">
            <span>BACKGROUND</span>
            <span className="text-agent-accent">{backgroundOpacity}%</span>
          </div>
          <div className="px-1">
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={backgroundOpacity}
              onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
              className="w-full h-1 bg-agent-border rounded-sm appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-agent-accent
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-all
                [&::-webkit-slider-thumb]:hover:scale-110
                [&::-moz-range-thumb]:w-3
                [&::-moz-range-thumb]:h-3
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-agent-accent
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:cursor-pointer
                [&::-moz-range-thumb]:transition-all
                [&::-moz-range-thumb]:hover:scale-110
              "
              style={{
                background: `linear-gradient(to right, var(--agent-accent) 0%, var(--agent-accent) ${(backgroundOpacity / 30) * 100}%, var(--agent-border) ${(backgroundOpacity / 30) * 100}%, var(--agent-border) 100%)`,
              }}
            />
            <div className="flex justify-between mt-1 px-0.5">
              <span className="text-xs text-agent-text-tertiary font-mono">0%</span>
              <span className="text-xs text-agent-text-tertiary font-mono">30%</span>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Section */}
      <div className="flex-1 overflow-y-auto border-b border-agent-border">
        <button
          onClick={() => setSessionsSectionOpen(!sessionsSectionOpen)}
          className="w-full p-2 flex items-center justify-between hover:bg-agent-bg-tertiary/40 transition-colors sticky top-0 surface-0 z-10"
        >
          <span className="text-xs text-agent-text-tertiary font-mono tracking-wide">
            SESSIONS
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`transition-transform text-agent-text-tertiary ${sessionsSectionOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {sessionsSectionOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            {/* New Session Button */}
            <button
              onClick={() => createSession()}
              className="w-full p-2 surface-1 flex items-center gap-2 hover:bg-agent-bg-tertiary transition-colors group rounded-md"
            >
              <div className="w-3 h-3 flex items-center justify-center text-agent-text-tertiary group-hover:text-agent-accent transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span className="text-xs font-mono text-agent-text-secondary group-hover:text-agent-text-primary transition-colors">
                New Chat
              </span>
            </button>

            {/* Session List */}
            {sessions.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className={`
                  group p-2 rounded-md cursor-pointer transition-colors
                  ${s.id === activeSessionId
                    ? 'bg-agent-accent/10 border border-agent-accent/30'
                    : 'surface-1 hover:bg-agent-bg-tertiary'
                  }
                `}
                onClick={() => loadSession(s.id)}
              >
                {editingSessionId === s.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => {
                      if (editingTitle.trim()) renameSession(s.id, editingTitle.trim());
                      setEditingSessionId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingTitle.trim()) renameSession(s.id, editingTitle.trim());
                        setEditingSessionId(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingSessionId(null);
                      }
                    }}
                    autoFocus
                    className="agent-input w-full text-xs py-0.5"
                  />
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-agent-text-primary truncate font-medium">
                        {s.title}
                      </p>
                      <p className="text-xs text-agent-text-tertiary font-mono">
                        {s.message_count} msgs
                      </p>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSessionId(s.id);
                          setEditingTitle(s.title);
                        }}
                        className="p-1 hover:text-agent-info text-agent-text-tertiary transition-colors"
                        title="Rename"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s.id);
                        }}
                        className="p-1 hover:text-agent-error text-agent-text-tertiary transition-colors"
                        title="Delete"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Show more hint */}
            {sessions.length > 10 && (
              <p className="text-xs text-agent-text-tertiary text-center py-1 font-mono">
                +{sessions.length - 10} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-2 space-y-1">
        {/* Settings Button */}
        <button
          onClick={() => setMode('settings')}
          className={`
            w-full p-2 flex items-center gap-2 transition-colors group rounded-md
            ${mode === 'settings'
              ? 'surface-2 border-l-2 border-l-agent-accent'
              : 'surface-1 hover:bg-agent-bg-tertiary'
            }
          `}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-colors ${mode === 'settings' ? 'text-agent-accent' : 'text-agent-text-tertiary group-hover:text-agent-accent'}`}>
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M5.6 5.6l4.2 4.2m4.2 4.2l4.2 4.2M1 12h6m6 0h6M5.6 18.4l4.2-4.2m4.2-4.2l4.2-4.2"/>
          </svg>
          <span className={`text-xs font-mono transition-colors ${mode === 'settings' ? 'text-agent-text-primary' : 'text-agent-text-secondary group-hover:text-agent-text-primary'}`}>
            Settings
          </span>
        </button>
      </div>
    </aside>
  );
}
