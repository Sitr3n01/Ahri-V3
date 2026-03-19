import { useState, useRef, useEffect } from 'react';
import { getPersonaTheme } from '@ahri/shared';
import { usePersonaStore } from '@/stores/persona-store';
import { useThemeStore } from '@/stores/theme-store';
import { useUIStore } from '@/stores/ui-store';
import { useT } from '@/stores/i18n-store';
import type { AppMode } from '@/App';

interface ToolbarProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export function Toolbar({ mode, setMode }: ToolbarProps) {
  const activePersona = usePersonaStore((s) => s.activePersona);
  const theme = getPersonaTheme(activePersona);
  const appTheme = useThemeStore((s) => s.theme);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const modes: { key: AppMode; label: string }[] = [
    { key: 'chat', label: t('nav.chat') },
    { key: 'agent', label: t('nav.agent') },
  ];

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const iconColor = 'var(--text-tertiary)';
  const iconHoverColor = 'var(--text-primary)';

  return (
    <div className="app-toolbar">
      {/* LEFT: Hamburger menu + Settings */}
      <div className="absolute left-3 flex items-center gap-0.5 app-toolbar-no-drag">
        {/* Hamburger menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-md transition-colors duration-150"
            style={{
              color: menuOpen ? theme.primary : iconColor,
              background: menuOpen
                ? `color-mix(in srgb, ${theme.primary} 10%, transparent)`
                : 'transparent',
            }}
            title="Menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Dropdown menu — simple solid, no glassmorphism */}
          {menuOpen && (
            <div
              className="absolute top-full left-0 mt-1 z-50 w-[180px] rounded-lg py-1 animate-fade-in"
              style={{
                background: 'var(--sidebar-bg)',
                border: '1px solid var(--glass-border)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--info)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Sobre Ahri V3</span>
              </button>
              <button
                onClick={() => { window.location.reload(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--success)' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>Recarregar</span>
              </button>
              <div className="mx-2 my-1" style={{ height: '1px', background: 'var(--glass-border)' }} />
              <button
                onClick={() => { window.close(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--error)' }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>

        {/* Sidebar toggle (hidden in settings mode) */}
        {mode !== 'settings' && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md transition-colors duration-150"
            style={{
              color: sidebarOpen ? iconColor : theme.primary,
              background: !sidebarOpen
                ? `color-mix(in srgb, ${theme.primary} 10%, transparent)`
                : 'transparent',
            }}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={() => setMode(mode === 'settings' ? 'chat' : 'settings')}
          className="p-1.5 rounded-md transition-colors duration-150"
          style={{
            color: mode === 'settings' ? theme.primary : iconColor,
            background: mode === 'settings'
              ? `color-mix(in srgb, ${theme.primary} 10%, transparent)`
              : 'transparent',
          }}
          title={t('nav.settings')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* CENTER: Mode selector pill */}
      <div className="app-toolbar-no-drag flex items-center gap-0.5 rounded-lg p-0.5"
        style={{
          background: 'var(--surface-hover)',
        }}
      >
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className="relative px-5 py-1 text-xs font-medium rounded-md transition-all duration-200"
            style={
              mode === m.key
                ? {
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                    color: 'rgba(0,0,0,0.85)',
                    boxShadow: `0 0 10px ${theme.shadow}`,
                  }
                : {
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                  }
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* RIGHT: empty — reserved for native window controls (titleBarOverlay) */}
    </div>
  );
}
