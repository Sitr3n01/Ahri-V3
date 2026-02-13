/**
 * Auth Store - Authentication state management for mobile PWA
 * Syncs with desktop via backend API
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '../api/client';

interface AuthState {
  // State
  isAuthenticated: boolean;
  tokens: {
    access: string | null;
    refresh: string | null;
  };

  // Actions
  login: (password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      tokens: {
        access: null,
        refresh: null
      },

      // Login with password
      login: async (password: string) => {
        try {
          const response = await api.login(password);

          set({
            isAuthenticated: true,
            tokens: {
              access: response.access_token,
              refresh: response.refresh_token
            }
          });

          // Store tokens in API client
          api.setTokens(response.access_token, response.refresh_token);

        } catch (error) {
          console.error('[Auth] Login failed:', error);
          throw error;
        }
      },

      // Logout and clear tokens
      logout: () => {
        set({
          isAuthenticated: false,
          tokens: {
            access: null,
            refresh: null
          }
        });

        // Clear from API client
        api.setTokens(null, null);

        // Clear persisted storage
        localStorage.removeItem('auth-storage');
      },

      // Refresh access token using refresh token
      refreshAuth: async () => {
        const { tokens } = get();

        if (!tokens.refresh) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await api.refreshTokenManual(tokens.refresh);

          set({
            tokens: {
              access: response.access_token,
              refresh: tokens.refresh
            }
          });

          // Update in API client
          api.setTokens(response.access_token, tokens.refresh);

        } catch (error) {
          console.error('[Auth] Token refresh failed:', error);
          get().logout();
          throw error;
        }
      }
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        tokens: state.tokens
      }),
      onRehydrateStorage: () => (state) => {
        // Restore tokens to API client after hydration
        if (state?.tokens.access && state?.tokens.refresh) {
          setTimeout(() => {
            api.setTokens(state.tokens.access!, state.tokens.refresh!);
          }, 0);
        }
      }
    }
  )
);
