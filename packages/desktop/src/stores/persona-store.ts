import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersonaSummary, SpotifyContext } from '@ahri/shared';
import { getPersonaTheme, mergePersonaTheme, type PersonaTheme } from '@ahri/shared';
import { api } from '@/api/client';
import { useChatStore } from './chat-store';

interface PersonaState {
  activePersona: string;
  personas: PersonaSummary[];
  isLoading: boolean;
  isActivatingPersona: boolean; // lock enquanto POST /activate está pendente
  error: string | null;
  backgroundOpacity: number;
  spotifyContext: SpotifyContext | null;
  isSyncingSpotify: boolean;

  setActivePersona: (name: string) => void;
  fetchPersonas: (retryCount?: number) => Promise<void>;
  activatePersona: (name: string) => Promise<void>;
  getTheme: () => PersonaTheme;
  getMergedTheme: (name: string) => PersonaTheme;
  setBackgroundOpacity: (opacity: number) => void;
  fetchSpotifyContext: () => Promise<void>;
  syncPersonaByMusic: () => Promise<string | null>;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      activePersona: 'ahri',
      personas: [],
      isLoading: false,
      isActivatingPersona: false,
      error: null,
      backgroundOpacity: 40,
      spotifyContext: null,
      isSyncingSpotify: false,

      setActivePersona: (name) => set({ activePersona: name }),

      fetchPersonas: async (retryCount = 0) => {
        set({ isLoading: true, error: null });
        try {
          const data = await api.listPersonas();
          set({
            personas: data.personas,
            // Backend é a fonte da verdade da persona ativa
            activePersona: data.active,
            isLoading: false,
            error: null,
          });
        } catch (e: any) {
          const message = e?.message || 'Falha ao carregar personas';
          console.error(`Failed to fetch personas (attempt ${retryCount + 1}):`, e);

          if (retryCount < 2) {
            setTimeout(() => get().fetchPersonas(retryCount + 1), 2000);
          } else {
            set({ isLoading: false, error: message });
          }
        }
      },

      activatePersona: async (name) => {
        // Cancela streaming ativo antes de trocar contexto — evita vazamento
        // de chunks de uma persona aparecendo no chat de outra
        useChatStore.getState().cancelStreaming();

        // Sem optimistic update: mostramos loading e esperamos confirmação do backend.
        // Motivo: optimistic update trigga useEffect([activePersona]) → fetchSessions
        // prematuro, que depois é triggado de novo no rollback caso a API falhe.
        set({ isActivatingPersona: true });

        try {
          const result = await api.activatePersona(name);

          // Só atualiza estado e busca sessões após confirmação do backend
          set({ activePersona: result.active, isActivatingPersona: false });

          // Busca sessões da nova persona após troca confirmada
          await useChatStore.getState().fetchSessions(result.active);
        } catch (e) {
          console.error('Failed to activate persona:', e);
          // Sem rollback necessário — nunca fizemos optimistic update
          set({ isActivatingPersona: false });
        }
      },

      getTheme: () => get().getMergedTheme(get().activePersona),

      getMergedTheme: (name: string) => {
        if (!name) return getPersonaTheme('');
        const persona = get().personas.find(
          (p) => p.name && p.name.toLowerCase() === name.toLowerCase()
        );
        const staticTheme = getPersonaTheme(name);
        return mergePersonaTheme(staticTheme, persona?.theme);
      },

      setBackgroundOpacity: (opacity) => set({ backgroundOpacity: opacity }),

      fetchSpotifyContext: async () => {
        try {
          const ctx = await api.getSpotifyContext();
          set({ spotifyContext: ctx });
        } catch (e) {
          console.error('Failed to fetch Spotify context:', e);
        }
      },

      syncPersonaByMusic: async () => {
        set({ isSyncingSpotify: true });
        try {
          const result = await api.syncPersonaByMusic();
          if (result.switched) {
            // Cancela streaming e busca sessões da persona sincronizada
            useChatStore.getState().cancelStreaming();
            set({ activePersona: result.persona, isSyncingSpotify: false });
            await useChatStore.getState().fetchSessions(result.persona);
            return result.persona;
          }
          set({ isSyncingSpotify: false });
          return null;
        } catch (e) {
          console.error('Failed to sync persona by music:', e);
          set({ isSyncingSpotify: false });
          return null;
        }
      },
    }),
    {
      name: 'persona-preferences',
      // Persiste activePersona para evitar flash para persona padrão antes
      // da API responder. O fetchPersonas() sobrescreve com o valor do backend.
      partialize: (state) => ({
        backgroundOpacity: state.backgroundOpacity,
        activePersona: state.activePersona,
      }),
    }
  )
);
