import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore, type Attachment } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { ModelSelector } from '@/components/ModelSelector';

type SearchMode = 'default' | 'web_search' | 'lore_search';

export function ChatInput() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('default');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessageStreaming = useChatStore((s) => s.sendMessageStreaming);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);

  const currentPersona = personas.find((p) => p.name === activePersona);

  // Close menus on click outside
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
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

  const processFile = useCallback(async (file: File) => {
    const reader = new FileReader();
    return new Promise<void>((resolve) => {
      reader.onload = (e) => {
        const result = e.target?.result as string;
        let type: 'image' | 'video' | 'pdf' | null = null;
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type === 'application/pdf') type = 'pdf';

        if (type) {
          setAttachments(prev => [...prev, {
            type: type!,
            data: result,
            name: file.name,
            preview: type === 'image' ? result : undefined
          }]);
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await Promise.all(files.map(processFile));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await Promise.all(files.map(processFile));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await Promise.all(files.map(processFile));
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

  const selectTool = (mode: SearchMode) => {
    setSearchMode(mode === searchMode ? 'default' : mode);
    setPlusMenuOpen(false);
  };

  return (
    <div
      className="px-4 pb-4 pt-2 max-w-4xl mx-auto w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachment preview chips (above composer) */}
      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2 px-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{
              background: 'var(--button-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-secondary)',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="font-mono truncate max-w-[120px]">{att.name}</span>
              <button
                onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                className="hover:opacity-70 transition-opacity"
                style={{ color: 'var(--error)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer Area */}
      <div className={`relative ${isDragging ? 'opacity-50' : ''}`}>
        {/* Plus Menu Popup (floating above, anchored right) */}
        {plusMenuOpen && (
          <div ref={plusMenuRef} className="absolute bottom-full left-0 mb-2 plus-menu z-50 w-[220px]">
            {/* Tools Section */}
            <div className="plus-menu-section-title">Tools</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => selectTool('web_search')}
                className={`plus-menu-item ${searchMode === 'web_search' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--info)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>Web Search</span>
              </button>
              <button
                onClick={() => selectTool('lore_search')}
                className={`plus-menu-item ${searchMode === 'lore_search' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--status-working)' }}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="8" y1="7" x2="16" y2="7" />
                  <line x1="8" y1="11" x2="13" y2="11" />
                </svg>
                <span>Lore Search</span>
              </button>
            </div>

            <div className="plus-menu-divider" />

            {/* Attachments Section */}
            <div className="plus-menu-section-title">Attachments</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleFileSelect('image/*')}
                className="plus-menu-item"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--success)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Image</span>
              </button>
              <button
                onClick={() => handleFileSelect('video/*')}
                className="plus-menu-item"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--warning)' }}>
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <span>Video</span>
              </button>
              <button
                onClick={() => handleFileSelect('application/pdf')}
                className="plus-menu-item"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--error)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Composer Pill */}
        <div className="composer-pill">
          {/* LEFT: Attach button (paperclip) — opens plus menu with tools + attachments */}
          <button
            onClick={() => setPlusMenuOpen(!plusMenuOpen)}
            className={`composer-icon-btn ${plusMenuOpen ? 'active' : ''}`}
            title="Tools & Attachments"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* CENTER: Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Converse com ${currentPersona?.display_name || activePersona}...`}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none max-h-32 py-2 px-2 placeholder:font-sans placeholder:text-gray-500"
            style={{
              color: 'var(--text-primary)',
              caretColor: 'var(--persona-primary)',
            }}
            disabled={isStreaming}
          />

          {/* RIGHT: Send button (icon) */}
          <button
            onClick={handleSend}
            disabled={(!text.trim() && attachments.length === 0) || isStreaming}
            className="composer-send"
            title="Enviar"
          >
            {isStreaming ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Meta Bar (below composer) */}
        <div className="composer-meta">
          {/* Left: Model selector + tool badge */}
          <div className="flex items-center gap-3">
            <ModelSelector compact />
            {searchMode !== 'default' && (
              <div className={`tool-badge ${searchMode === 'web_search' ? 'tool-badge-web' : 'tool-badge-lore'}`}>
                {searchMode === 'web_search' ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                    </svg>
                    <span>Web</span>
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    <span>Lore</span>
                  </>
                )}
                <button
                  onClick={() => setSearchMode('default')}
                  className="hover:opacity-70 transition-opacity ml-0.5"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>
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
