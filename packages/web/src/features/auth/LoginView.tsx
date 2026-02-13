/**
 * LoginView - Mobile login screen with glassmorphism
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { usePersonaStore } from '@/stores/persona-store';
import { LogIn } from 'lucide-react';

export function LoginView() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const loadPersonas = usePersonaStore((s) => s.loadPersonas);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(password);
      await loadPersonas();
      navigate('/');
    } catch (err) {
      setError('Senha incorreta');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      {/* Logo/Icon */}
      <div className="mb-8 animate-pulse-slow">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-accent)] flex items-center justify-center">
          <span className="text-5xl">🌸</span>
        </div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm glass-strong rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-light text-white/90 text-center mb-2 tracking-wider">
          AHRI
        </h1>
        <p className="text-white/50 text-sm text-center mb-8">
          Sistema de Acesso
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Insira sua credencial..."
              disabled={isLoading}
              className="w-full bg-black/20 border-b border-white/30 text-white px-4 py-3 rounded-t-lg focus:outline-none focus:border-[var(--theme-primary)] transition-all placeholder:text-white/30"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center animate-shake">
              ⛔ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent)] text-white font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[var(--theme-glow)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <LogIn size={20} />
                <span>Inicializar Conexão</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-8 text-white/30 text-xs">
        Ahri V3 • Mobile PWA
      </p>
    </div>
  );
}
