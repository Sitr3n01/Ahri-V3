import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { getPersonaTheme } from '@ahri/shared';
import { Message as MessageBubble } from './Message';
import { ChatInput } from './ChatInput';

const ENGINE_OPTIONS = [
  { value: 'PRO' as const, label: 'Gemini Pro', short: 'Gemini', color: '#8b5cf6' },
  { value: 'GOOGLE' as const, label: 'Gemma 27B', short: 'Gemma', color: '#3b82f6' },
  { value: 'DEEPSEEK' as const, label: 'DeepSeek R1', short: 'DeepSeek', color: '#22c55e' },
  { value: 'LOCAL' as const, label: 'Local (Ollama)', short: 'Ollama', color: '#f59e0b' },
];

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);
  const model = useChatStore((s) => s.model);
  const setModel = useChatStore((s) => s.setModel);
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);

  const currentPersona = personas.find((p) => p.name === activePersona);
  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const currentEngine = ENGINE_OPTIONS.find((e) => e.value === model) || ENGINE_OPTIONS[0];
  const theme = getPersonaTheme(activePersona);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Close engine dropdown on click outside
  useEffect(() => {
    if (!engineDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.engine-dropdown-container')) {
        setEngineDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [engineDropdownOpen]);

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Chat Header */}
      <div className="chat-header">
        {/* Left: Avatar + Persona Info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden persona-avatar-ring flex-shrink-0">
            <img
              src={`/${theme.avatar}`}
              alt={currentPersona?.display_name || activePersona}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.style.background = 'var(--persona-primary)';
              }}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold capitalize" style={{ color: 'var(--agent-text-primary)' }}>
              {currentPersona?.display_name || activePersona}
            </h2>
            <p className="text-xs font-mono truncate max-w-[200px]" style={{ color: 'var(--agent-text-tertiary)' }}>
              {currentSession?.title || 'New Chat'}
            </p>
          </div>
        </div>

        {/* Right: Engine Selector */}
        <div className="relative engine-dropdown-container">
          <button
            onClick={() => setEngineDropdownOpen(!engineDropdownOpen)}
            className="engine-selector"
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: currentEngine.color }}
            />
            <span className="font-mono">{currentEngine.short}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-50">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* Engine Dropdown */}
          {engineDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 engine-dropdown z-50 min-w-[180px]">
              {ENGINE_OPTIONS.map((engine) => (
                <button
                  key={engine.value}
                  onClick={() => {
                    setModel(engine.value);
                    setEngineDropdownOpen(false);
                  }}
                  className={`engine-dropdown-item w-full ${engine.value === model ? 'active' : ''}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: engine.color }}
                  />
                  <span className="flex-1 text-left">{engine.label}</span>
                  {engine.value === model && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 scroll-smooth chat-messages-area">
        {messages.length === 0 && !isStreaming ? (
          /* Empty State - Friendly Welcome */
          <div className="flex items-center justify-center h-full">
            <div className="text-center fade-in">
              {/* Large Avatar with Glow */}
              <div className="w-20 h-20 mx-auto mb-5 rounded-full overflow-hidden persona-avatar-large">
                <img
                  src={`/${theme.avatar}`}
                  alt={currentPersona?.display_name || activePersona}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.style.background = 'var(--persona-primary)';
                  }}
                />
              </div>

              {/* Persona Name */}
              <h3 className="text-lg font-semibold mb-2 capitalize" style={{ color: 'var(--agent-text-primary)' }}>
                {currentPersona?.display_name || activePersona}
              </h3>

              {/* Archetype/Universe */}
              {currentPersona && (
                <p className="text-sm mb-4 max-w-[320px] mx-auto leading-relaxed" style={{ color: 'var(--agent-text-secondary)' }}>
                  {currentPersona.archetype}{currentPersona.universe ? ` \u2022 ${currentPersona.universe}` : ''}
                </p>
              )}

              {/* CTA */}
              <p className="text-xs font-mono" style={{ color: 'var(--agent-text-tertiary)' }}>
                Send a message to start chatting...
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={`${i}-${msg.timestamp}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                images={msg.images}
              />
            ))}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <MessageBubble
                role="assistant"
                content={streamingContent}
                timestamp=""
                isStreaming
              />
            )}

            {/* Loading indicator (no content yet) */}
            {isStreaming && !streamingContent && (
              <div className="message-enter mb-5">
                <div className="flex items-end gap-3">
                  <div className="flex-shrink-0 mb-5">
                    <div className="w-9 h-9 rounded-full overflow-hidden persona-avatar-ring">
                      <img
                        src={`/${theme.avatar}`}
                        alt="typing"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="chat-bubble-assistant">
                    <div className="typing-indicator">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput />
    </div>
  );
}
