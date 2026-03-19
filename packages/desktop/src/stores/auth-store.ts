import { create } from 'zustand';
import { ApiError } from '@ahri/shared';
import { api } from '@/api/client';
import { persistTokens, restoreTokens, clearTokens } from '@/api/client';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string;

  login: (password: string) => Promise<boolean>;
  logout: () => void;
  tryRestore: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: '',

  login: async (password) => {
    set({ isLoading: true, error: '' });
    try {
      const tokens = await api.login(password);
      persistTokens(tokens.access_token, tokens.refresh_token);
      set({ isAuthenticated: true, isLoading: false });
      return true;
    } catch (e) {
      let errorMsg = 'Erro desconhecido';
      if (e instanceof ApiError) {
        errorMsg = e.status === 401
          ? 'Senha incorreta'
          : `Erro ${e.status}: ${e.message}`;
      } else if (e instanceof TypeError) {
        errorMsg = 'Falha ao conectar com o servidor (porta 8742)';
      } else if (e instanceof Error) {
        errorMsg = e.message;
      }
      set({
        isAuthenticated: false,
        isLoading: false,
        error: errorMsg,
      });
      return false;
    }
  },

  logout: () => {
    clearTokens();
    set({ isAuthenticated: false });
  },

  tryRestore: () => {
    const restored = restoreTokens();
    if (restored) {
      set({ isAuthenticated: true });
    }
    return restored;
  },
}));
