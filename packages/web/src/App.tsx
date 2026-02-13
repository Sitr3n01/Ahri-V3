/**
 * Ahri Mobile PWA - Main App Component
 * Responsive mobile-first design with bottom navigation
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth-store';
import { usePersonaStore } from './stores/persona-store';
import { getPersonaTheme } from '@ahri/shared';

// Views
import { LoginView } from './features/auth/LoginView';
import { ChatView } from './features/chat/ChatView';
import { PersonasView } from './features/personas/PersonasView';
import { SessionsView } from './features/sessions/SessionsView';
import { SettingsView } from './features/settings/SettingsView';

// Layout
import { BottomNav } from './components/BottomNav';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const [currentTheme, setCurrentTheme] = useState(getPersonaTheme('Ahri'));

  // Update theme when persona changes
  useEffect(() => {
    if (activePersona) {
      setCurrentTheme(getPersonaTheme(activePersona));
    }
  }, [activePersona]);

  // Apply CSS variables for theme
  useEffect(() => {
    if (currentTheme) {
      const root = document.documentElement;
      root.style.setProperty('--theme-primary', currentTheme.primary);
      root.style.setProperty('--theme-secondary', currentTheme.secondary);
      root.style.setProperty('--theme-accent', currentTheme.primary); // Use primary as accent
      root.style.setProperty('--theme-glow', currentTheme.glow);
      root.style.setProperty('--theme-shadow', currentTheme.shadow);
    }
  }, [currentTheme]);

  // Protected route wrapper
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
  };

  return (
    <BrowserRouter>
      <div
        className="flex flex-col h-screen w-screen overflow-hidden"
        style={{
          background: currentTheme?.background || 'linear-gradient(135deg, #0a0a0f 0%, #1a0f2e 100%)'
        }}
      >
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginView />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-full">
                  <main className="flex-1 overflow-hidden">
                    <ChatView />
                  </main>
                  <BottomNav />
                </div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/personas"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-full">
                  <main className="flex-1 overflow-auto">
                    <PersonasView />
                  </main>
                  <BottomNav />
                </div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sessions"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-full">
                  <main className="flex-1 overflow-auto">
                    <SessionsView />
                  </main>
                  <BottomNav />
                </div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-full">
                  <main className="flex-1 overflow-auto">
                    <SettingsView />
                  </main>
                  <BottomNav />
                </div>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
