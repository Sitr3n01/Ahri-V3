import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { usePersonaTheme } from '@/hooks/usePersonaTheme';
import { Message } from './Message';
import { ChatInput } from './ChatInput';

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const memoryNotifications = useChatStore((s) => s.memoryNotifications);
  const clearMemoryNotifications = useChatStore((s) => s.clearMemoryNotifications);

  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);
  const personaTheme = usePersonaTheme();
  const personaData = personas.find((p) => p.name === activePersona);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Controle de comportamento do scroll.
   *
   * 'instant' — usado ao trocar de sessão ou na montagem inicial.
   *   Evita o efeito de "queda" quando 40+ mensagens de histórico são carregadas.
   * 'smooth' — usado quando o usuário envia uma mensagem ou durante streaming.
   *   Só ativa no próximo update do array de mensagens, depois volta para 'instant'.
   *
   * O ref é mutado diretamente para não causar re-render ao alterar o comportamento.
   */
  const scrollBehaviorRef = useRef<ScrollBehavior>('instant');

  /**
   * Auto-follow: para de rolar automaticamente se o usuário scrollou para cima.
   * Retoma quando o usuário volta ao fundo ou envia uma mensagem.
   */
  const shouldAutoFollowRef = useRef(true);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoFollowRef.current = distanceFromBottom < 120;
  };

  // Ao trocar de sessão: scroll instantâneo e reativa auto-follow
  useEffect(() => {
    scrollBehaviorRef.current = 'instant';
    shouldAutoFollowRef.current = true;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    });
  }, [activeSessionId]);

  // Ao receber nova mensagem ou chunk: scroll se auto-follow estiver ativo
  useEffect(() => {
    if (!shouldAutoFollowRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current });
    // Após o primeiro scroll da sessão, muda para smooth para mensagens seguintes
    scrollBehaviorRef.current = 'smooth';
  }, [messages]);

  // Ativa smooth ao enviar mensagem (mesmo se usuário estava scrollado para cima)
  const activateSmoothScroll = () => {
    shouldAutoFollowRef.current = true;
    scrollBehaviorRef.current = 'smooth';
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Área de mensagens */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth chat-messages-area"
      >
        <div className="max-w-3xl mx-auto w-full">
          {isEmpty ? (
            /**
             * Empty state: orienta o usuário e contextualiza a persona ativa.
             * Anteriormente era apenas um <div className="flex-1" />.
             */
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-6 animate-fade-in">
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-full overflow-hidden border-2"
                  style={{ borderColor: personaTheme.primary, boxShadow: `0 0 20px ${personaTheme.shadow}` }}
                >
                  <img
                    src={`/${personaTheme.avatar}`}
                    alt={personaData?.display_name || activePersona}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <p className="text-lg font-semibold" style={{ color: personaTheme.primary }}>
                  {personaData?.display_name || activePersona}
                </p>
                <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {personaData?.description || 'Como posso te ajudar hoje?'}
                </p>
              </div>

              {/* Sugestões de prompt */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {[
                  'Me conta sobre você',
                  'Vamos conversar em japonês',
                  'Me recomende algo',
                  'Quais são seus interesses?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      // Preenche o input via evento customizado capturado pelo ChatInput
                      window.dispatchEvent(
                        new CustomEvent('ahri:fill-input', { detail: suggestion }),
                      );
                    }}
                    className="text-left px-3 py-2 rounded-xl text-xs transition-all duration-200"
                    style={{
                      background: 'var(--glass-bg)',
                      border: `1px solid var(--glass-border)`,
                      color: 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = personaTheme.primary;
                      (e.currentTarget as HTMLElement).style.color = personaTheme.primary;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                /**
                 * Key estável via msg.id (UUID gerado na criação).
                 * Substituiu key={`${i}-${msg.timestamp}`} que usava índice de array,
                 * quebrando o algoritmo de reconciliação ao remover mensagens do meio.
                 *
                 * Dados de tema passados como props — Message não acessa mais o store,
                 * permitindo que React.memo funcione corretamente.
                 */
                <Message
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                  images={msg.images}
                  isStreaming={msg.isStreaming}
                  showTimestamp={showTimestamps}
                  personaName={personaData?.display_name || activePersona}
                  personaAvatar={personaTheme.avatar}
                  personaPrimary={personaTheme.primary}
                  personaSecondary={personaTheme.secondary}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Banner de Memory Notifications */}
      {memoryNotifications.length > 0 && (
        <div
          className="mx-6 mb-2 px-3 py-2 rounded-xl flex items-center justify-between text-[11px] animate-fade-in"
          style={{
            background: `color-mix(in srgb, ${personaTheme.primary} 8%, var(--glass-bg))`,
            border: `1px solid color-mix(in srgb, ${personaTheme.primary} 25%, transparent)`,
          }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" className="flex-shrink-0"
              style={{ color: personaTheme.primary }}
            >
              <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12A10 10 0 0 1 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span
              className="truncate"
              style={{ color: personaTheme.primary }}
              title={memoryNotifications.join(' · ')}
            >
              Memória: {memoryNotifications.join(' · ')}
            </span>
          </div>
          <button
            onClick={clearMemoryNotifications}
            className="ml-2 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: personaTheme.primary }}
            title="Fechar"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area — recebe callback para ativar smooth scroll ao enviar */}
      <ChatInput onSend={activateSmoothScroll} />
    </div>
  );
}
