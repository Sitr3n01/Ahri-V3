import { api } from '@/api/client';
import { useChatStore } from '@/stores/chat-store';

export async function runSlashCommand(cmd: string) {
  const userMsg = {
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: cmd,
    images: [] as string[],
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    meta: {},
  };
  useChatStore.getState().addMessage(userMsg);

  try {
    if (cmd === '/memoria') {
      const profile = await api.getProfile();
      useChatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[SYSTEM] Memory State:\n\`\`\`json\n${JSON.stringify(profile.attributes || {}, null, 2)}\n\`\`\``,
        images: [],
        timestamp: '',
        meta: { system: true },
      });
      return;
    }

    useChatStore.getState().addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Comando desconhecido: ${cmd}`,
      images: [],
      timestamp: '',
      meta: { error: true },
    });
  } catch (e) {
    useChatStore.getState().addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `[Erro] ${e}`,
      images: [],
      timestamp: '',
      meta: { error: true },
    });
  }
}
