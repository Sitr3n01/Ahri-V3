import { create } from 'zustand';
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
      set({
        isAuthenticated: false,
        isLoading: false,
        error: 'Senha incorreta',
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
