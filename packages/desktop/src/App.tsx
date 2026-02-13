import { useEffect, useState } from 'react';
import { ChatView } from './features/chat/ChatView';
import { AgentModeView } from './features/agent-mode/AgentModeView';
import { SettingsView } from './features/settings/SettingsView';
import { Sidebar } from './features/sidebar/Sidebar';
import { LoginView } from './features/auth/LoginView';
import { AgentPanel } from './features/agent/AgentPanel';
import { usePersonaStore } from './stores/persona-store';
import { useAuthStore } from './stores/auth-store';
import { useChatStore } from './stores/chat-store';
import { useAgentStore } from './stores/agent-store';
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
      className="flex h-screen w-screen overflow-hidden relative text-white"
      style={{
        '--persona-primary': theme.primary,
        '--persona-secondary': theme.secondary,
        '--persona-shadow': theme.shadow,
        '--persona-glow': theme.glow,
      } as React.CSSProperties}
    >
      {/* Background image layer - opacity varies by mode */}
      <style>{`
        .persona-background {
          background-image: url('/${theme.background}');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          filter: blur(50px);
        }
      `}</style>
      <div
        className="absolute inset-0 z-0 persona-background transition-opacity duration-300"
        style={{
          opacity: mode === 'chat' ? backgroundOpacity / 100 : 0,
        }}
      />

      {/* Content layer */}
      <div className="relative z-10 flex h-full w-full">
        <Sidebar mode={mode} setMode={setMode} />

        <main className="flex-1 flex flex-col relative bg-black/20">
          {mode === 'chat' && <ChatView />}
          {mode === 'agent' && <AgentModeView />}
          {mode === 'settings' && <SettingsView />}
        </main>
        
        {isPanelOpen && <AgentPanel />}
      </div>
    </div>
  );
}
