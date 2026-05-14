/**
 * App Store — orquestra a inicialização sequencial do app.
 *
 * Por que uma store separada para isso?
 * Manter initApp() aqui evita que App.tsx precise conhecer a ordem correta
 * dos fetches. O componente apenas chama initApp() uma vez e observa isAppReady.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth-store';
import { usePersonaStore } from './persona-store';
import { useChatStore } from './chat-store';


interface AppState {
  isAppReady: boolean;

  /**
   * Sequência de inicialização no boot do app:
   * 1. tryRestore() — lê tokens do localStorage (síncrono, sem rede)
   * 2. Se não autenticado: marca como pronto e exibe LoginView
   * 3. fetchPersonas() — define activePersona vindo do backend
   * 4. fetchSessions(activePersona) — busca sessões da persona correta
   *
   * Resultado: zero double-fetch, UI não renderiza até estar pronta.
   */
  initApp: () => Promise<void>;

  /**
   * Chamado após login manual do usuário (quando isAppReady já é true).
   * Separa o fluxo de boot do fluxo de login para não misturar os dois.
   */
  postLogin: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  isAppReady: false,

  initApp: async () => {
    // Passo 1: restaura tokens do localStorage — síncrono, sem chamada de rede
    const isAuthenticated = useAuthStore.getState().tryRestore();

    // Hidrata configurações do chat do localStorage uma única vez no boot.
    // Fora do ChatView para não re-hidratar a cada vez que a view remonta.
    useChatStore.getState().loadChatSettings();

    if (!isAuthenticated) {
      // Não autenticado — marca como pronto e deixa LoginView aparecer
      set({ isAppReady: true });
      return;
    }

    try {
      // Passo 2: busca personas (atualiza activePersona com o valor do backend)
      await usePersonaStore.getState().fetchPersonas();

      // Passo 3: busca sessões para a persona confirmada pelo backend
      // Lê o estado *após* o fetchPersonas() ter resolvido
      const activePersona = usePersonaStore.getState().activePersona;
      await useChatStore.getState().fetchSessions(activePersona);
    } catch {
      // Erros são tratados internamente em cada action — apenas marcamos como pronto
    }

    set({ isAppReady: true });
  },

  postLogin: async () => {
    // Mesmo fluxo do initApp pós-autenticação, mas sem o tryRestore
    try {
      await usePersonaStore.getState().fetchPersonas();
      const activePersona = usePersonaStore.getState().activePersona;
      await useChatStore.getState().fetchSessions(activePersona);
    } catch {
      // Erros tratados internamente
    }
  },
}));
