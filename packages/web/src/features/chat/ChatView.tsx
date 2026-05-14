/**
 * ChatView - Mobile chat interface with touch-optimized UX
 */

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { Send, Image as ImageIcon, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ChatHeader } from './ChatHeader';

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const createSession = useChatStore((s) => s.createSession);
  const activePersona = usePersonaStore((s) => s.activePersona);

  const [input, setInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Create session if none active
  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isStreaming) return;

    const messageText = input.trim();
    // Clear input immediately
    setInput('');
    setSelectedImages([]);

    // Send message
    await sendMessage(messageText, selectedImages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedImages((prev) => [...prev, ...files]);
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <ChatHeader />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-accent)] flex items-center justify-center mb-4">
              <span className="text-3xl">✨</span>
            </div>
            <h2 className="text-white/70 text-lg font-light mb-2">
              Converse com {activePersona?.name || 'Ahri'}
            </h2>
            <p className="text-white/40 text-sm">
              Digite uma mensagem para começar
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <MessageBubble key={msg.id ?? `${msg.role}-${msg.timestamp}-${index}`} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <Loader2 size={16} className="animate-spin" />
                <span>Gerando resposta...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-white/10 bg-black/40 backdrop-blur-xl p-4">
        {/* Image Previews */}
        {selectedImages.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={URL.createObjectURL(img)}
                  alt="Preview"
                  className="w-16 h-16 object-cover rounded-lg"
                />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Row */}
        <div className="flex items-end gap-2">
          {/* Image Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 flex items-center justify-center transition-all active:scale-95"
          >
            <ImageIcon size={20} className="text-white/70" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Text Input */}
          <div className="flex-1 glass rounded-2xl px-4 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Converse com ${activePersona?.name || 'Ahri'}...`}
              disabled={isStreaming}
              rows={1}
              className="w-full bg-transparent text-white placeholder:text-white/40 resize-none outline-none max-h-[120px]"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={isStreaming || (!input.trim() && selectedImages.length === 0)}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent)] disabled:opacity-50 flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-[var(--theme-glow)]"
          >
            {isStreaming ? (
              <Loader2 size={20} className="text-white animate-spin" />
            ) : (
              <Send size={20} className="text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
