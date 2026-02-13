/**
 * Persona Store - Persona management for mobile PWA
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PersonaSummary } from '@ahri/shared';
import { api } from '../api/client';

interface PersonaState {
  // State
  personas: PersonaSummary[];
  activePersona: PersonaSummary | null;
  isLoading: boolean;

  // Actions
  loadPersonas: () => Promise<void>;
  activatePersona: (personaName: string) => Promise<void>;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set) => ({
      // Initial state
      personas: [],
      activePersona: null,
      isLoading: false,

      // Load all personas from backend
      loadPersonas: async () => {
        set({ isLoading: true });
        try {
          const response = await api.getPersonas();
          const personas = response.personas || [];
          set({ personas, isLoading: false });

          // Set active persona
          const activePersona = personas.find(p => p.name === response.active);
          if (activePersona) {
            set({ activePersona });
          } else if (personas.length > 0) {
            set({ activePersona: personas[0] });
          }
        } catch (error) {
          console.error('[Persona] Failed to load:', error);
          set({ isLoading: false });
        }
      },

      // Switch active persona
      activatePersona: async (personaName: string) => {
        set({ isLoading: true });
        try {
          await api.activatePersona(personaName);
          // Reload personas to get updated active state
          await get().loadPersonas();
        } catch (error) {
          console.error('[Persona] Failed to activate:', error);
          set({ isLoading: false });
        }
      }
    }),
    {
      name: 'persona-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activePersona: state.activePersona
      })
    }
  )
);
