import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore, type Attachment } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { ModelSelector } from '@/components/ModelSelector';
import { SpeedModeSelector } from './ComposerModeControls';
import { runSlashCommand } from './slashCommands';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE_LABEL = '10MB';

interface ChatInputProps {
  /** Callback chamado quando o usuario envia — ativa smooth scroll no ChatView */
  onSend?: () => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isPendingNewChat = useChatStore((s) => s.isPendingNewChat);
  const drafts = useChatStore((s) => s.drafts);
  const saveDraft = useChatStore((s) => s.saveDraft);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingEnabled = useChatStore((s) => s.streamingEnabled);
  const sendMessageStreaming = useChatStore((s) => s.sendMessageStreaming);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const sendMessageHttp = useChatStore((s) => s.sendMessage);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const personas = usePersonaStore((s) => s.personas);
  const currentPersona = personas.find((p) => p.name === activePersona);

  /** Chave do rascunho: 'new' para chat pendente, String(id) para sessao existente */
  const draftKey = isPendingNewChat || activeSessionId === null ? 'new' : String(activeSessionId);

  const [text, setText] = useState(() => drafts[draftKey] ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ msg: string; id: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  /**
   * Lock anti-double submit via ref (nao state para nao causar re-render).
   *
   * Por que ref e nao apenas checar isStreaming?
   * Entre o clique em Enviar e o momento em que set({isStreaming:true}) executa,
   * ha um await _ensureSession() assincrono. Dois cliques rapidos passam pelo
   * guard do isStreaming antes do estado atualizar. O ref e setado sincronamente
   * antes do primeiro await, bloqueando o segundo clique imediatamente.
   */
  const isSendingRef = useRef(false);

  // Quando a sessao muda, carrega o rascunho correspondente
  useEffect(() => {
    const draft = drafts[draftKey] ?? '';
    setText(draft);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      if (draft) {
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
      }
    }
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escuta evento das sugestoes de prompt do empty state
  useEffect(() => {
    const handler = (e: Event) => {
      const suggestion = (e as CustomEvent<string>).detail;
      setText(suggestion);
      saveDraft(draftKey, suggestion);
      textareaRef.current?.focus();
    };
    window.addEventListener('ahri:fill-input', handler);
    return () => window.removeEventListener('ahri:fill-input', handler);
  }, [draftKey, saveDraft]);

  // Fecha plus menu ao clicar fora
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target) && !target.closest('#attach-btn')) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [plusMenuOpen]);

  const handleSend = useCallback(async () => {
    // Guard 1: lock sincrono — bloqueia antes de qualquer await
    if (isSendingRef.current) return;

    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    const { globalEnableThinking, enableThinking, model } = useChatStore.getState();
    if (model === 'LOCAL' && enableThinking && !globalEnableThinking) {
      setErrorBanner({
        msg: 'Raciocinio bloqueado. Habilite "Raciocinio (Modelos Locais)" nas Configuracoes.',
        id: Date.now(),
      });
      return;
    }

    setErrorBanner(null);

    // Slash commands (sem dynamic imports — modulos ja estao no bundle)
    if (trimmed.startsWith('/')) {
      void runSlashCommand(trimmed);
      setText('');
      saveDraft(draftKey, '');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Adquire lock antes do primeiro await
    isSendingRef.current = true;

    // Limpa UI imediatamente (otimista)
    setText('');
    saveDraft(draftKey, ''); // Limpa rascunho apos envio
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Ativa smooth scroll no ChatView
    onSend?.();

    try {
      const send = streamingEnabled ? sendMessageStreaming : sendMessageHttp;
      await send(trimmed, attachments);
    } finally {
      // Libera o lock independente de sucesso ou erro
      isSendingRef.current = false;
    }
  }, [text, attachments, isStreaming, streamingEnabled, sendMessageStreaming, sendMessageHttp, draftKey, saveDraft, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Valida e processa arquivo antes de converter para base64.
   * Rejeita arquivos acima de MAX_FILE_SIZE_BYTES para evitar OOM
   * e timeouts no WebSocket com payloads gigantes.
   */
  const processFile = useCallback(async (file: File): Promise<void> => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorBanner({
        msg: `Arquivo muito grande: "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: ${MAX_FILE_SIZE_LABEL}.`,
        id: Date.now(),
      });
      return;
    }

    const reader = new FileReader();
    return new Promise<void>((resolve) => {
      reader.onload = (e) => {
        const result = e.target?.result as string;
        let type: 'image' | 'video' | 'pdf' | null = null;
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type === 'application/pdf') type = 'pdf';

        if (type) {
          setAttachments((prev) => [
            ...prev,
            { type: type!, data: result, name: file.name, preview: type === 'image' ? result : undefined },
          ]);
        }
        resolve();
      };
      reader.onerror = () => {
        setErrorBanner({ msg: `Erro ao ler arquivo: ${file.name}`, id: Date.now() });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await Promise.all(Array.from(e.target.files).map(processFile));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  /**
   * DragLeave corrigido: verifica se o mouse realmente saiu do container.
   * Sem essa verificacao, passar o cursor por elementos filhos dentro da
   * dropzone dispara dragleave no pai, causando flickering do overlay.
   */
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) {
      await Promise.all(Array.from(e.dataTransfer.files).map(processFile));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].kind === 'file') {
        const file = e.clipboardData.items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await Promise.all(files.map(processFile));
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    saveDraft(draftKey, value); // Persiste rascunho sincronamente
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

  return (
    <div
      className="px-4 pb-4 pt-2 max-w-3xl mx-auto w-full animate-fade-in-up"
      style={{ animationDuration: '0.4s' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`relative ${isDragging ? 'opacity-50' : ''}`}>

        {/* Banner de erro */}
        {errorBanner && (
          <div
            key={errorBanner.id}
            className="absolute bottom-full left-0 right-0 mb-3 px-3 py-2 rounded-xl flex items-center justify-between text-[11px] font-semibold animate-shake shadow-lg z-50 backdrop-blur-md"
            style={{
              background: 'color-mix(in srgb, var(--error) 15%, var(--surface-elevated))',
              border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
              color: 'var(--error)',
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{errorBanner.msg}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="hover:opacity-70 transition-opacity p-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Plus Menu */}
        {plusMenuOpen && (
          <div ref={plusMenuRef} className="absolute bottom-full left-0 mb-2 plus-menu animate-fade-in z-50 w-[220px]">
            <div className="plus-menu-section-title">Attachments</div>
            <div className="flex flex-col gap-1">
              <button onClick={() => handleFileSelect('image/*')} className="plus-menu-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--success)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Image</span>
              </button>
              <button onClick={() => handleFileSelect('video/*')} className="plus-menu-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--warning)' }}>
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <span>Video</span>
              </button>
              <button onClick={() => handleFileSelect('application/pdf')} className="plus-menu-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--error)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Composer Pill */}
        <div className={`flex flex-col bg-[var(--sidebar-bg)] rounded-2xl p-2 shadow-lg backdrop-blur-xl transition-all duration-300 ease-out border ${
          isFocused
            ? 'border-[var(--persona-primary)] shadow-[0_16px_48px_rgba(0,0,0,0.25)] -translate-y-2'
            : 'border-[var(--glass-border)] translate-y-0'
        }`}>

          {/* Previews de attachment */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap px-2 pt-2">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-xl overflow-hidden border flex-shrink-0 animate-fade-in-up"
                  style={{ borderColor: 'var(--glass-border)', background: 'var(--surface-hover)', animationDuration: '0.3s', animationFillMode: 'both' }}
                >
                  {att.type === 'image' && att.preview ? (
                    <img src={att.preview} alt={att.name} className="w-14 h-14 object-cover" />
                  ) : (
                    <div className="w-14 h-14 flex flex-col items-center justify-center p-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: att.type === 'pdf' ? 'var(--error)' : 'var(--warning)' }}>
                        {att.type === 'pdf' ? (
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        ) : (
                          <polygon points="23 7 16 12 23 17 23 7" />
                        )}
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="text-[8px] font-mono mt-1 opacity-70 truncate max-w-full px-1">
                        {att.type.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="px-2 pt-2 pb-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={`Converse com ${currentPersona?.display_name || activePersona}...`}
              rows={1}
              className="w-full bg-transparent text-[0.95rem] resize-none outline-none max-h-32 placeholder:font-sans placeholder:text-gray-500"
              style={{ color: 'var(--text-primary)', caretColor: 'var(--persona-primary)' }}
              disabled={isStreaming}
            />
          </div>

          {/* Actions Row */}
          <div className="flex justify-between items-center px-1 mt-1">
            <div className="flex items-center gap-1.5">
              <button
                id="attach-btn"
                onClick={(e) => { e.stopPropagation(); setPlusMenuOpen(!plusMenuOpen); }}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                  plusMenuOpen ? 'bg-white/10 text-white' : 'text-[var(--text-tertiary)] hover:bg-white/5 hover:text-white'
                }`}
                title="Attachments"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div className="ml-1">
                <ModelSelector compact />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SpeedModeSelector />
              <button
                onClick={isStreaming ? stopStreaming : handleSend}
                disabled={(!text.trim() && attachments.length === 0) && !isStreaming}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                  (text.trim() || attachments.length > 0 || isStreaming)
                    ? 'bg-[var(--persona-primary)] text-white scale-100 hover:scale-110 shadow-md'
                    : 'bg-[var(--surface-hover)] text-[var(--text-tertiary)] opacity-60 pointer-events-none cursor-default'
                }`}
                style={{ background: isStreaming ? 'var(--error)' : undefined }}
                title={isStreaming ? 'Parar Geracao' : 'Enviar'}
              >
                {isStreaming ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Input file oculto */}
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
