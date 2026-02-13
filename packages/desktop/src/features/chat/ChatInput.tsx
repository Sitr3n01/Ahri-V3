import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore, type Attachment } from '@/stores/chat-store';

type SearchMode = 'default' | 'web_search' | 'lore_search';

export function ChatInput() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('default');
  const [geminiMode, setGeminiMode] = useState<'flash' | 'pro'>('flash');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessageStreaming = useChatStore((s) => s.sendMessageStreaming);
  const model = useChatStore((s) => s.model);

  const isGemini = model === 'PRO';

  // Close plus menu on click outside
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [plusMenuOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    // Slash commands
    if (trimmed.startsWith('/')) {
      await handleSlashCommand(trimmed);
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    sendMessageStreaming(trimmed, attachments, searchMode);
    setText('');
    setAttachments([]);
    setSearchMode('default');

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, attachments, searchMode, isStreaming, sendMessageStreaming]);

  const handleSlashCommand = async (cmd: string) => {
    const { api } = await import('@/api/client');
    const { useChatStore } = await import('@/stores/chat-store');

    const userMsg = {
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
        const response = `[SYSTEM] Memory State: ${JSON.stringify(profile.attributes || {}, null, 2)}`;
        useChatStore.getState().addMessage({
          role: 'assistant', content: response, images: [], timestamp: '', meta: { system: true }
        });
      } else {
        useChatStore.getState().addMessage({
          role: 'assistant', content: `Unknown command: ${cmd}`, images: [], timestamp: '', meta: { error: true }
        });
      }
    } catch (e) {
      useChatStore.getState().addMessage({
        role: 'assistant', content: `Error: ${e}`, images: [], timestamp: '', meta: { error: true }
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  };

  const handleFileSelect = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
    setPlusMenuOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // File handling logic (simplified for now)
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Paste handling logic
  };

  const selectTool = (mode: SearchMode) => {
    setSearchMode(mode === searchMode ? 'default' : mode);
    setPlusMenuOpen(false);
  };

  return (
    <div
      className="p-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachment preview chips (above input) */}
      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2 px-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{
              background: 'var(--agent-bg-tertiary)',
              border: '1px solid var(--agent-border)',
              color: 'var(--agent-text-secondary)',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="font-mono truncate max-w-[120px]">{att.name}</span>
              <button
                onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                className="hover:opacity-70 transition-opacity"
                style={{ color: 'var(--agent-error)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Input Container */}
      <div className={`relative ${isDragging ? 'opacity-50' : ''}`}>
        {/* Plus Menu Popup (floating above input) */}
        {plusMenuOpen && (
          <div ref={plusMenuRef} className="absolute bottom-full left-0 mb-2 plus-menu z-50 w-[280px]">
            {/* Tools Section */}
            <div className="plus-menu-section-title">Tools</div>
            <div className="flex gap-2 mb-1">
              <button
                onClick={() => selectTool('web_search')}
                className={`plus-menu-item flex-1 ${searchMode === 'web_search' ? 'active' : ''}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--agent-info)' }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span>Web Search</span>
              </button>
              <button
                onClick={() => selectTool('lore_search')}
                className={`plus-menu-item flex-1 ${searchMode === 'lore_search' ? 'active' : ''}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--agent-working)' }}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  <line x1="8" y1="7" x2="16" y2="7"/>
                  <line x1="8" y1="11" x2="13" y2="11"/>
                </svg>
                <span>Lore Search</span>
              </button>
            </div>

            <div className="plus-menu-divider" />

            {/* Attachments Section */}
            <div className="plus-menu-section-title">Attachments</div>
            <div className="flex gap-2">
              <button
                onClick={() => handleFileSelect('image/*')}
                className="plus-menu-item flex-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--agent-success)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Image</span>
              </button>
              <button
                onClick={() => handleFileSelect('video/*')}
                className="plus-menu-item flex-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--agent-warning)' }}>
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <span>Video</span>
              </button>
              <button
                onClick={() => handleFileSelect('application/pdf')}
                className="plus-menu-item flex-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--agent-error)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Input Pill */}
        <div className="chat-input-container flex items-end gap-2 p-3">
          {/* Plus Button */}
          <button
            onClick={() => setPlusMenuOpen(!plusMenuOpen)}
            className={`chat-plus-button ${plusMenuOpen ? 'active' : ''}`}
            style={plusMenuOpen ? {
              borderColor: 'var(--persona-primary)',
              color: 'var(--persona-primary)',
              background: 'color-mix(in srgb, var(--persona-primary) 8%, transparent)',
            } : undefined}
            title="Tools & Attachments"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`transition-transform ${plusMenuOpen ? 'rotate-45' : ''}`}
            >
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {/* Active Tool Badge */}
          {searchMode !== 'default' && (
            <div className={`tool-badge ${searchMode === 'web_search' ? 'tool-badge-web' : 'tool-badge-lore'}`}>
              {searchMode === 'web_search' ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                  </svg>
                  <span>Web</span>
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <span>Lore</span>
                </>
              )}
              <button
                onClick={() => setSearchMode('default')}
                className="hover:opacity-70 transition-opacity ml-0.5"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type your message..."
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none max-h-32 py-1.5 placeholder:font-sans"
            style={{
              color: 'var(--agent-text-primary)',
              caretColor: 'var(--persona-primary)',
            }}
            disabled={isStreaming}
          />

          {/* Flash/Pro Toggle (Gemini only, design-only) */}
          {isGemini && (
            <button
              onClick={() => setGeminiMode(geminiMode === 'flash' ? 'pro' : 'flash')}
              className={`mode-toggle flex-shrink-0 ${geminiMode === 'flash' ? 'mode-toggle-flash' : 'mode-toggle-pro'}`}
              title={geminiMode === 'flash' ? 'Switch to Pro mode' : 'Switch to Flash mode'}
            >
              {geminiMode === 'flash' ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline mr-1">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  Flash
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline mr-1">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  Pro
                </>
              )}
            </button>
          )}

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={(!text.trim() && attachments.length === 0) || isStreaming}
            className="chat-send-button"
            title="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
