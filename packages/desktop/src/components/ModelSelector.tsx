import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import type { AvailableModel } from '@ahri/shared/types/llm.js';

// Fallback non-Ollama models shown before API responds (no Ollama entry — handled separately)
const FALLBACK_ENGINES: AvailableModel[] = [
  { id: 'LITE', display_name: 'Gemini Flash Lite', provider: 'google_gemini', group: 'google_gemini', is_local: false, supports_vision: false, supports_thinking: true, color: '#60A5FA' },
  { id: 'DEEPSEEK', display_name: 'DeepSeek R1', provider: 'openrouter', group: 'openrouter', is_local: false, supports_vision: false, supports_thinking: true, color: '#22c55e' },
];

const GROUP_LABELS: Record<string, string> = {
  google_gemini: 'Google Gemini',
  google_gemma:  'Google Gemma 4',
  openrouter:    'OpenRouter',
  ollama:        'Ollama Local',
};

// How often to poll for new Ollama models (ms)
const OLLAMA_POLL_MS = 30_000;

function shortLabel(displayName: string): string {
  if (displayName.startsWith('Gemini ')) return displayName.replace('Gemini ', '');
  if (displayName.startsWith('Gemma ')) return displayName;
  return displayName.split(' ')[0];
}

/** Group models preserving backend order. Returns [[groupKey, models[]], ...] */
function groupModels(models: AvailableModel[]): [string, AvailableModel[]][] {
  const map: Record<string, AvailableModel[]> = {};
  const order: string[] = [];
  for (const m of models) {
    const g = m.group || m.provider;
    if (!map[g]) { map[g] = []; order.push(g); }
    map[g].push(m);
  }
  return order.map(g => [g, map[g]]);
}

// SVG refresh icon (reusable)
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

interface ModelSelectorProps {
  compact?: boolean;
}

export function ModelSelector({ compact = false }: ModelSelectorProps) {
  const model = useChatStore((s) => s.model);
  const setModel = useChatStore((s) => s.setModel);
  const availableModels = useChatStore((s) => s.availableModels);
  const fetchAvailableModels = useChatStore((s) => s.fetchAvailableModels);
  const refreshOllamaModels = useChatStore((s) => s.refreshOllamaModels);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Split Ollama from the rest so we can always render the Ollama section
  const nonOllamaModels = (availableModels.length > 0 ? availableModels : FALLBACK_ENGINES)
    .filter(m => (m.group || m.provider) !== 'ollama');
  const ollamaModels = availableModels.filter(m => (m.group || m.provider) === 'ollama');
  const isOllamaOnline = ollamaModels.length > 0;

  const allEngines = [...nonOllamaModels, ...ollamaModels];
  const currentEngine = allEngines.find(e => e.id === model) || allEngines[0];
  const groups = groupModels(nonOllamaModels);

  // Initial fetch + periodic poll so Ollama models appear as soon as server starts
  useEffect(() => {
    fetchAvailableModels();
    const interval = setInterval(fetchAvailableModels, OLLAMA_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAvailableModels]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.model-selector-container')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRefreshOllama = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try { await refreshOllamaModels(); } finally { setRefreshing(false); }
  };

  // Dropdown content shared between compact and full variants
  const dropdownContent = (
    <div
      className="rounded-lg overflow-hidden z-50 animate-fade-in"
      style={{
        background: 'var(--surface-solid)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        minWidth: '210px',
      }}
    >
      {/* ── Cloud model groups (Gemini, Gemma, OpenRouter) ── */}
      {groups.map(([groupKey, groupModels], gi) => (
        <div key={groupKey}>
          <div
            className="flex items-center justify-between px-3 pt-2 pb-1"
            style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}
          >
            <span>{GROUP_LABELS[groupKey] || groupKey}</span>
          </div>

          {groupModels.map((engine) => (
            <button
              key={engine.id}
              onClick={() => { setModel(engine.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors duration-100"
              style={{
                color: engine.id === model ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: engine.id === model ? 'var(--surface-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (engine.id !== model) e.currentTarget.style.background = 'var(--surface-hover)'; }}
              onMouseLeave={(e) => { if (engine.id !== model) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: engine.color }} />
              <span className="flex-1 text-left truncate">{engine.display_name}</span>
              {engine.id === model && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}

          <div className="mx-2 my-1" style={{ height: '1px', background: 'var(--glass-border)' }} />
        </div>
      ))}

      {/* ── Ollama section — always visible ── */}
      <div>
        <div
          className="flex items-center justify-between px-3 pt-2 pb-1"
          style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}
        >
          <div className="flex items-center gap-1.5">
            <span>Ollama Local</span>
            {/* Online/offline dot */}
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: isOllamaOnline ? '#22c55e' : '#ef4444' }}
              title={isOllamaOnline ? 'Servidor conectado' : 'Servidor offline'}
            />
          </div>
          <button
            onClick={handleRefreshOllama}
            title="Atualizar lista Ollama"
            className="hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <RefreshIcon spinning={refreshing} />
          </button>
        </div>

        {isOllamaOnline ? (
          ollamaModels.map((engine) => (
            <button
              key={engine.id}
              onClick={() => { setModel(engine.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors duration-100"
              style={{
                color: engine.id === model ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: engine.id === model ? 'var(--surface-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (engine.id !== model) e.currentTarget.style.background = 'var(--surface-hover)'; }}
              onMouseLeave={(e) => { if (engine.id !== model) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: engine.color }} />
              <span className="flex-1 text-left truncate">{engine.display_name}</span>
              {engine.id === model && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))
        ) : (
          <div
            className="px-3 py-2 text-xs"
            style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
          >
            Servidor offline — inicie o Ollama e clique em atualizar
          </div>
        )}
      </div>
    </div>
  );

  // ── Compact variant (used inside ChatInput pill) ──────────────────────────
  if (compact) {
    return (
      <div className="relative model-selector-container">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-300 hover:bg-white/5 active:scale-95 border border-transparent"
          style={{ background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--text-secondary)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: currentEngine?.color ?? '#60A5FA' }} />
          <span>{shortLabel(currentEngine?.display_name ?? 'Flash Lite')}</span>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
            className={`opacity-40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 bottom-full mb-2">
            {dropdownContent}
          </div>
        )}
      </div>
    );
  }

  // ── Default variant (full-width, for sidebar or standalone) ──────────────
  return (
    <div className="relative model-selector-container">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors duration-150"
        style={{ background: 'var(--button-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: currentEngine?.color ?? '#60A5FA' }} />
        <span className="flex-1 text-left font-mono truncate">{shortLabel(currentEngine?.display_name ?? 'Flash Lite')}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`opacity-40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1"
          style={{ zIndex: 50 }}>
          {dropdownContent}
        </div>
      )}
    </div>
  );
}
