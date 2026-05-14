import { useEffect, useRef, useState } from 'react';
import type { AvailableModel } from '@ahri/shared/types/llm.js';

import { useChatStore } from '@/stores/chat-store';

const LEVEL_LABELS: Record<string, string> = {
  off: 'Desligado',
  none: 'Desligado',
  minimal: 'Minimo',
  low: 'Baixo',
  medium: 'Medio',
  high: 'Alto',
  xhigh: 'Maximo',
};

function fallbackReasoningProfile(modelId: string): Pick<AvailableModel, 'reasoning_control' | 'reasoning_levels' | 'default_reasoning_level' | 'supports_thinking'> {
  if (modelId === 'DEEPSEEK' || modelId.includes('/')) {
    return { supports_thinking: true, reasoning_control: 'effort', reasoning_levels: ['none', 'low', 'medium', 'high'], default_reasoning_level: 'medium' };
  }
  if (modelId === 'LITE' || (modelId.startsWith('gemini-') && modelId.includes('lite'))) {
    return { supports_thinking: true, reasoning_control: 'thinking_level', reasoning_levels: ['minimal', 'low', 'medium', 'high'], default_reasoning_level: 'minimal' };
  }
  if (!modelId.startsWith('gemini-') && !modelId.startsWith('gemma-')) {
    return { supports_thinking: true, reasoning_control: 'boolean', reasoning_levels: ['off', 'on'], default_reasoning_level: 'off' };
  }
  return { supports_thinking: false, reasoning_control: 'none', reasoning_levels: [], default_reasoning_level: 'off' };
}

function ThinkingToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-300 hover:bg-white/5 border border-transparent hover:border-white/10"
      style={{ fontSize: '0.8rem', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--text-secondary)' }}
      title="Raciocinio Ativo/Desativado"
    >
      <span>Pensamento: {enabled ? 'Ligado' : 'Desligado'}</span>
    </button>
  );
}

export function SpeedModeSelector() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const model = useChatStore((s) => s.model);
  const availableModels = useChatStore((s) => s.availableModels);
  const reasoningLevel = useChatStore((s) => s.reasoningLevel);
  const setReasoningLevel = useChatStore((s) => s.setReasoningLevel);
  const enableThinking = useChatStore((s) => s.enableThinking);
  const setEnableThinking = useChatStore((s) => s.setEnableThinking);
  const profile = availableModels.find((m) => m.id === model) ?? fallbackReasoningProfile(model);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!profile.supports_thinking || profile.reasoning_control === 'none') {
    return null;
  }

  if (profile.reasoning_control === 'boolean') {
    return <ThinkingToggle enabled={enableThinking} onToggle={() => setEnableThinking(!enableThinking)} />;
  }

  const selectableLevels = (profile.reasoning_levels ?? []).filter((level) => level !== 'on');
  if (selectableLevels.length > 0) {
    const currentLevel = selectableLevels.includes(reasoningLevel) ? reasoningLevel : (profile.default_reasoning_level ?? selectableLevels[0]);
    const currentLabel = LEVEL_LABELS[currentLevel] ?? currentLevel;

    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-300 hover:bg-white/5 border border-transparent hover:border-white/10"
          style={{ fontSize: '0.8rem', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--text-secondary)' }}
        >
          <span>Pensamento: {currentLabel}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {open && (
          <div
            className="absolute right-0 bottom-full mb-2 rounded-lg overflow-hidden z-50 min-w-[130px] animate-fade-in"
            style={{ background: 'var(--surface-solid)', border: '1px solid var(--glass-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
          >
            {selectableLevels.map((level) => (
              <button
                key={level}
                onClick={() => { setReasoningLevel(level); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs transition-colors duration-100"
                style={{
                  color: currentLevel === level ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: currentLevel === level ? 'var(--surface-hover)' : 'transparent',
                }}
              >
                {LEVEL_LABELS[level] ?? level}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
