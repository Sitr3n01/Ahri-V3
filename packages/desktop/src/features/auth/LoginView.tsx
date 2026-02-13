import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { usePersonaStore } from '@/stores/persona-store';

export function LoginView() {
  const [password, setPassword] = useState('');
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const personas = usePersonaStore((s) => s.personas);

  // Simula status de backend (em produção viria de health check)
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');

  useEffect(() => {
    // Simula check de backend connection
    const timer = setTimeout(() => {
      setBackendStatus('connected');
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await login(password);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setPassword('');
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center surface-0">
      {/* Terminal-style login container */}
      <div className="w-full max-w-md px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-agent-text-primary mb-1">
            AHRI AGENT SYSTEM
          </h1>
          <p className="text-xs text-agent-text-tertiary font-mono tracking-wide">
            v3.1.0
          </p>
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="surface-2 p-6 mb-6"
        >
          {/* Password input */}
          <div className="mb-4">
            <label
              htmlFor="password-input"
              className="block text-xs text-agent-text-secondary font-mono mb-2 tracking-wide"
            >
              {'> '}<span className="animate-pulse">_</span>
            </label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter system password"
              autoFocus
              className="agent-input w-full font-mono"
            />
            <p className="text-xs text-agent-text-tertiary mt-2 font-mono">
              ESC to clear
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-agent-error/10 border border-agent-error rounded-sm">
              <p className="text-xs text-agent-error font-mono">
                ERROR: {error}
              </p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || !password.trim() || backendStatus !== 'connected'}
            className="agent-button-primary w-full"
          >
            {isLoading ? 'INITIALIZING...' : 'INITIALIZE SYSTEM'}
          </button>
        </form>

        {/* System status indicators */}
        <div className="surface-1 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-agent-text-secondary">Backend:</span>
            <div className="flex items-center gap-2">
              {backendStatus === 'connecting' && (
                <>
                  <div className="status-dot status-warning animate-pulse" />
                  <span className="text-agent-warning">CONNECTING</span>
                </>
              )}
              {backendStatus === 'connected' && (
                <>
                  <div className="status-dot status-success" />
                  <span className="text-agent-success">CONNECTED</span>
                </>
              )}
              {backendStatus === 'failed' && (
                <>
                  <div className="status-dot status-error" />
                  <span className="text-agent-error">FAILED</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-agent-text-secondary">LLM Engines:</span>
            <div className="flex items-center gap-2">
              <div className="status-dot status-success" />
              <span className="text-agent-text-primary">4 READY</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-agent-text-secondary">Personas:</span>
            <div className="flex items-center gap-2">
              <div className="status-dot status-info" />
              <span className="text-agent-text-primary">
                {personas.length || 17} LOADED
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-agent-text-secondary">Agent Mode:</span>
            <div className="flex items-center gap-2">
              <div className="status-dot status-working" />
              <span className="text-agent-text-primary">ENABLED</span>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-4 text-center">
          <p className="text-xs text-agent-text-tertiary font-mono">
            MULTI-AGENT ORCHESTRATION SYSTEM
          </p>
        </div>
      </div>
    </div>
  );
}
