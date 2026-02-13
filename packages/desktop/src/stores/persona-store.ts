import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersonaSummary } from '@ahri/shared';
import { getPersonaTheme, type PersonaTheme } from '@ahri/shared';
import { api } from '@/api/client';

interface PersonaState {
  activePersona: string;
  personas: PersonaSummary[];
  isLoading: boolean;
  backgroundOpacity: number; // 0-100 (percentage)

  setActivePersona: (name: string) => void;
  fetchPersonas: () => Promise<void>;
  activatePersona: (name: string) => Promise<void>;
  getTheme: () => PersonaTheme;
  setBackgroundOpacity: (opacity: number) => void;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      activePersona: 'ahri',
      personas: [],
      isLoading: false,
      backgroundOpacity: 12, // Default 12%

      setActivePersona: (name) => set({ activePersona: name }),

      fetchPersonas: async () => {
        set({ isLoading: true });
        try {
          const data = await api.listPersonas();
          set({
            personas: data.personas,
            activePersona: data.active,
            isLoading: false,
          });
        } catch (e) {
          console.error('Failed to fetch personas:', e);
          set({ isLoading: false });
        }
      },

      activatePersona: async (name) => {
        try {
          const result = await api.activatePersona(name);
          set({ activePersona: result.active });
        } catch (e) {
          console.error('Failed to activate persona:', e);
        }
      },

      getTheme: () => getPersonaTheme(get().activePersona),

      setBackgroundOpacity: (opacity) => set({ backgroundOpacity: opacity }),
    }),
    {
      name: 'persona-preferences', // localStorage key
      partialize: (state) => ({ backgroundOpacity: state.backgroundOpacity }), // Only persist opacity
    }
  )
);
