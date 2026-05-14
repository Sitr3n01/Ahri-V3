import { useEffect, useRef, useState } from 'react';
import { ChatView } from './features/chat/ChatView';
import { SettingsView } from './features/settings/SettingsView';
import { Sidebar } from './features/sidebar/Sidebar';
import { LoginView } from './features/auth/LoginView';
import { Fireflies } from './components/Fireflies';
import { Toolbar } from './components/Toolbar';
import { usePersonaTheme } from './hooks/usePersonaTheme';
import { usePersonaStore } from './stores/persona-store';
import { useAuthStore } from './stores/auth-store';
import { useAppStore } from './stores/app-store';
import { useUIStore } from './stores/ui-store';
import { useThemeStore } from './stores/theme-store';

export type AppMode = 'chat' | 'settings';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isAppReady, initApp, postLogin } = useAppStore();
  const activePersona = usePersonaStore((s) => s.activePersona);
  const backgroundOpacity = usePersonaStore((s) => s.backgroundOpacity);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const appTheme = useThemeStore((s) => s.theme);
  const isLight = appTheme === 'light';

  const [mode, setMode] = useState<AppMode>('chat');
  const previousModeRef = useRef<AppMode>('chat');

  // ── Boot único ───────────────────────────────────────────────────────────
  // Um único useEffect no mount chama initApp(), que orquestra toda a
  // sequência: tryRestore → fetchPersonas → fetchSessions(activePersona).
  // Sem useEffect([isAuthenticated]) ou useEffect([activePersona]) que causavam
  // double fetch por reagir a mudanças de estado assíncronas.
  useEffect(() => {
    initApp();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pós-login ────────────────────────────────────────────────────────────
  // Quando o usuário faz login manual (isAuthenticated: false → true) e o app
  // já está pronto, dispara o carregamento de dados.
  // Guard isAppReady: garante que este effect não dispare durante o boot inicial,
  // quando tryRestore() seta isAuthenticated=true antes do initApp() terminar.
  const isAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    const wasAuthenticated = isAuthenticatedRef.current;
    isAuthenticatedRef.current = isAuthenticated;

    // Só executa se foi uma transição false → true e o app já estava pronto
    if (isAuthenticated && !wasAuthenticated && isAppReady) {
      postLogin();
    }
  }, [isAuthenticated, isAppReady, postLogin]);

  // Rastreia o modo anterior (para voltar do settings)
  useEffect(() => {
    if (mode !== 'settings') previousModeRef.current = mode;
  }, [mode]);

  const theme = usePersonaTheme();

  // ── Loading screen ───────────────────────────────────────────────────────
  // Segura a UI até que initApp() termine — previne flash de conteúdo
  // incompleto ou redirecionamento prematuro para LoginView.
  if (!isAppReady) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-black">
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: 'rgba(139, 92, 246, 0.8)',
            borderRightColor: 'rgba(139, 92, 246, 0.3)',
          }}
        />
      </div>
    );
  }

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
      {/* Top toolbar com seletor de modo */}
      <Toolbar mode={mode} setMode={setMode} previousMode={previousModeRef.current} />

      {/* Camada de background */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-700"
        style={{
          backgroundImage: `url('/${theme.background}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: isLight ? 1 : Math.max(backgroundOpacity / 100, 0.18),
          filter: mode === 'settings' ? 'blur(20px) brightness(1.1)' : 'none',
          transition: 'opacity 0.7s, filter 0.5s',
        }}
      />

      {/* Vinheta escura */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.7) 100%)',
          opacity: isLight ? 0 : 1,
        }}
      />

      {/* Partículas Firefly */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none overflow-hidden transition-opacity duration-500"
        style={{ opacity: isLight ? 0.6 : 1 }}
      >
        <Fireflies />
      </div>

      {/* Camada de conteúdo */}
      <div className="relative z-10 flex flex-1 overflow-hidden" data-mode={mode}>
        {/*
          Sidebar sempre presente, mas recolhida via CSS quando mode === 'settings'.
          Mantém contexto de navegação visível e preserva estado montado.
          A classe collapsed/settings-mode reduz a largura via CSS transition.
        */}
        <div
          className={`sidebar-wrapper ${sidebarOpen && mode !== 'settings' ? 'expanded' : 'collapsed'}`}
        >
          <Sidebar mode={mode} setMode={setMode} previousMode={previousModeRef.current} />
        </div>

        <main className="flex-1 flex flex-col relative overflow-hidden">
          <div
            key={mode}
            className="flex-1 flex flex-col h-full animate-fade-in"
            style={{ animationDuration: '0.4s' }}
          >
            {mode === 'chat' && <ChatView />}
            {mode === 'settings' && (
              <SettingsView onClose={() => setMode(previousModeRef.current)} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
