/**
 * MessageBubble - Mobile-optimized message bubble with markdown
 */

import type { ChatMessage } from '@ahri/shared';
import ReactMarkdown from 'react-markdown';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent)] text-white rounded-br-sm'
            : 'glass-dark text-white/90 rounded-bl-sm'
        }`}
      >
        {/* Markdown Content */}
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              // Custom markdown renderers for mobile
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: ({ inline, children }: any) =>
                inline ? (
                  <code className="bg-black/30 px-1.5 py-0.5 rounded text-sm">
                    {children}
                  </code>
                ) : (
                  <code className="block bg-black/50 p-3 rounded-lg text-sm overflow-x-auto">
                    {children}
                  </code>
                ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-1">{children}</ol>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-blue-400 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              )
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-white/60' : 'text-white/40'
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
}
