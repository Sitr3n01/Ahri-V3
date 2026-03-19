import { useEffect, useState } from 'react';
import { ChatView } from './features/chat/ChatView';
import { AgentModeView } from './features/agent-mode/AgentModeView';
import { SettingsView } from './features/settings/SettingsView';
import { Sidebar } from './features/sidebar/Sidebar';
import { LoginView } from './features/auth/LoginView';
import { AgentPanel } from './features/agent/AgentPanel';
import { Fireflies } from './components/Fireflies';
import { Toolbar } from './components/Toolbar';
import { usePersonaStore } from './stores/persona-store';
import { useAuthStore } from './stores/auth-store';
import { useChatStore } from './stores/chat-store';
import { useAgentStore } from './stores/agent-store';
import { useUIStore } from './stores/ui-store';
import { useThemeStore } from './stores/theme-store';
import { getPersonaTheme } from '@ahri/shared';

export type AppMode = 'chat' | 'agent' | 'settings';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tryRestore = useAuthStore((s) => s.tryRestore);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const backgroundOpacity = usePersonaStore((s) => s.backgroundOpacity);
  const fetchPersonas = usePersonaStore((s) => s.fetchPersonas);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const isPanelOpen = useAgentStore((s) => s.isPanelOpen);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const appTheme = useThemeStore((s) => s.theme);
  const isLight = appTheme === 'light';

  // Mode state: 'chat' or 'agent'
  const [mode, setMode] = useState<AppMode>('chat');

  // Tenta restaurar tokens ao carregar
  useEffect(() => {
    tryRestore();
  }, [tryRestore]);

  // Carrega dados iniciais quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
      fetchPersonas();
      fetchSessions();
    }
  }, [isAuthenticated, fetchPersonas, fetchSessions]);

  // Recarrega sessões quando persona muda
  useEffect(() => {
    if (isAuthenticated) {
      fetchSessions(activePersona);
    }
  }, [activePersona, isAuthenticated, fetchSessions]);

  // Aplica tema da persona ativa como CSS variables
  const theme = getPersonaTheme(activePersona);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden relative app-enter"
      style={{
        '--persona-primary': theme.primary,
        '--persona-secondary': theme.secondary,
        '--persona-shadow': theme.shadow,
        '--persona-glow': theme.glow,
      } as React.CSSProperties}
    >
      {/* Top toolbar with mode selector */}
      <Toolbar mode={mode} setMode={setMode} />

      {/* Background image layer — always visible, no blur (VN aesthetic) */}
      <style>{`
        .persona-background {
          background-image: url('/${theme.background}');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
      `}</style>
      {/* Background image — sempre visivel */}
      <div
        className="absolute inset-0 z-0 persona-background transition-opacity duration-700"
        style={{
          opacity: isLight ? 1 : (mode === 'chat' ? Math.max(backgroundOpacity / 100, 0.18) : 0.10),
          filter: isLight && mode === 'settings' ? 'blur(8px) brightness(1.1)' : 'none',
          transition: 'opacity 0.7s, filter 0.5s',
        }}
      />
      {/* Dark vignette overlay — APENAS no dark mode */}
      {!isLight && (
        <div
          className="absolute inset-0 z-0 transition-opacity duration-500"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 100%)',
            opacity: mode === 'chat' ? 1 : 0.85,
          }}
        />
      )}

      {/* Firefly particles — V2 VN ambiance */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none overflow-hidden transition-opacity duration-500"
        style={{ opacity: isLight ? 0.6 : 1 }}
      >
        <Fireflies />
      </div>

      {/* Content layer */}
      <div className="relative z-10 flex flex-1 overflow-hidden" data-mode={mode}>
        {/* Sidebar with transition wrapper — hidden in settings mode */}
        {mode !== 'settings' && (
          <div className={`sidebar-wrapper ${sidebarOpen ? 'expanded' : 'collapsed'}`}>
            <Sidebar mode={mode} />
          </div>
        )}

        <main className="flex-1 flex flex-col relative">
          {mode === 'chat' && <ChatView />}
          {mode === 'agent' && <AgentModeView />}
          {mode === 'settings' && <SettingsView />}
        </main>

        {isPanelOpen && <AgentPanel />}
      </div>
    </div>
  );
}
