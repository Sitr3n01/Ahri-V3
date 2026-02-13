import { usePersonaStore } from '@/stores/persona-store';

interface MessageProps {
  role: string;
  content: string;
  timestamp: string;
  images?: string[];
  isStreaming?: boolean;
}

export function Message({ role, content, timestamp, images, isStreaming }: MessageProps) {
  const isUser = role === 'user';
  const isError = content.startsWith('[Erro]') || content.startsWith('[Error]');
  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);

  const currentPersona = personas.find((p) => p.name === activePersona);
  const personaAvatar = currentPersona?.theme.avatar || 'default.png';

  return (
    <div className="message-enter mb-5">
      {/* Message Row */}
      <div className={`flex items-end gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar (assistant only) */}
        {!isUser && (
          <div className="flex-shrink-0 mb-5">
            <div className="w-9 h-9 rounded-full overflow-hidden persona-avatar-ring">
              <img
                src={`/${personaAvatar}`}
                alt={currentPersona?.display_name || 'Persona'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.style.background = 'var(--persona-primary)';
                }}
              />
            </div>
          </div>
        )}

        {/* Bubble Container */}
        <div className={`flex flex-col gap-1 max-w-[65%] ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Persona Name (assistant only) */}
          {!isUser && (
            <span className="text-xs font-medium ml-1" style={{ color: 'var(--persona-primary)' }}>
              {currentPersona?.display_name || 'Assistant'}
            </span>
          )}

          {/* Message Bubble */}
          <div
            className={`
              ${isError
                ? 'chat-bubble-error'
                : isUser
                  ? 'chat-bubble-user'
                  : 'chat-bubble-assistant'
              }
            `}
          >
            {/* Images */}
            {images && images.length > 0 && (
              <div className={`grid gap-2 mb-3 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {images.map((img_b64, idx) => (
                  <img
                    key={idx}
                    src={`data:image/jpeg;base64,${img_b64}`}
                    alt={`Attachment ${idx + 1}`}
                    className="rounded-xl w-full object-cover max-h-48"
                  />
                ))}
              </div>
            )}

            {/* Error icon */}
            {isError && (
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" style={{ color: 'var(--agent-error)' }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="text-xs font-mono" style={{ color: 'var(--agent-error)' }}>Error</span>
              </div>
            )}

            {/* Content */}
            <div
              className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${isStreaming ? 'streaming-cursor' : ''}`}
              style={{ color: isError ? 'var(--agent-error)' : 'var(--agent-text-primary)' }}
              dangerouslySetInnerHTML={{ __html: formatContent(content) }}
            />
          </div>

          {/* Timestamp (below bubble) */}
          {timestamp && (
            <span className={`text-xs font-mono px-2 ${isUser ? 'text-right' : 'text-left'}`} style={{ color: 'var(--agent-text-tertiary)' }}>
              {timestamp}
            </span>
          )}

          {/* Streaming indicator */}
          {isStreaming && (
            <span className="text-xs font-mono px-2 animate-pulse" style={{ color: 'var(--persona-primary)' }}>
              typing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Formata conteudo com markdown basico para HTML.
 * Suporta: **bold**, *italic*, `code`, ```code blocks```, links
 */
function formatContent(text: string): string {
  let html = escapeHtml(text);

  // Code blocks (```...```)
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match, lang, code) => {
      return `
        <div class="relative my-3 group">
          <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onclick="navigator.clipboard.writeText(${JSON.stringify(code.trim())})"
              style="background: var(--agent-bg-tertiary); color: var(--agent-text-secondary); border: 1px solid var(--agent-border); padding: 4px 8px; border-radius: 8px; font-size: 11px; cursor: pointer;"
              title="Copy code"
            >
              COPY
            </button>
          </div>
          <pre style="background: var(--agent-code-bg); border: 1px solid var(--agent-code-border); padding: 12px; border-radius: 12px; overflow-x: auto; font-size: 12px; font-family: var(--font-mono);">${lang ? `<div style="color: var(--agent-text-tertiary); font-size: 10px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">${lang}</div>` : ''}<code>${code.trim()}</code></pre>
        </div>
      `;
    }
  );

  // Inline code (`...`)
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background: var(--agent-bg-tertiary); padding: 2px 6px; border-radius: 6px; font-size: 12px; font-family: var(--font-mono); border: 1px solid var(--agent-border);">$1</code>',
  );

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 600; color: var(--agent-text-primary);">$1</strong>');

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em style="font-style: italic;">$1</em>');

  // Links
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: var(--persona-primary); text-decoration: underline; text-underline-offset: 2px;">$1</a>'
  );

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Export tambem como MessageBubble para compatibilidade
export { Message as MessageBubble };
