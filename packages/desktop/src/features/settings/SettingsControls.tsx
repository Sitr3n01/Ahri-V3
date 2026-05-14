import { useState, type ReactNode } from 'react';
import { Activity, CheckCircle, FlaskConical } from 'lucide-react';

import { api } from '@/api/client';
import { useI18nStore, useT } from '@/stores/i18n-store';

export function SettingsSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="bg-white/60 dark:bg-[rgba(255,255,255,0.02)] backdrop-blur-xl border rounded-[24px] p-7 transition-all duration-300"
      style={{
        borderColor: 'var(--glass-border)',
        boxShadow: '0 8px 32px -8px color-mix(in srgb, var(--persona-shadow) 25%, rgba(0,0,0,0.08))',
      }}
    >
      <div className="mb-6 flex items-start gap-4">
        {icon && (
          <div className="p-2.5 rounded-2xl bg-[var(--surface-hover)] border border-[var(--glass-border)] flex-shrink-0 shadow-sm">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function KeyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch (e) {
      console.error('Failed to paste', e);
    }
  };

  const isConfigured = value && value.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="settings-label mb-0">{label}</label>
        {isConfigured && (
          <span className="text-[10px] flex items-center gap-1 text-emerald-400 font-medium">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Configured
          </span>
        )}
      </div>
      <div className="flex gap-1 mt-1">
        <input type={visible ? 'text' : 'password'} className="settings-input flex-1 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />

        <button onClick={() => setVisible(!visible)} className="settings-key-toggle" title={visible ? 'Hide' : 'Show'} type="button">
          {visible ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>

        <button onClick={handlePaste} className="settings-key-toggle text-[var(--persona-primary)]" title="Paste clipboard" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
        </button>

        {isConfigured && (
          <button
            onClick={() => {
              if (window.ahri?.agent?.writeClipboard) {
                window.ahri.agent.writeClipboard(value);
              } else {
                navigator.clipboard.writeText(value);
              }
            }}
            className="settings-key-toggle text-[var(--persona-primary)]"
            title="Copy to clipboard"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}

        {isConfigured && (
          <button onClick={() => onChange('')} className="settings-key-toggle text-red-400 hover:text-red-300" title="Clear key" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>}
    </div>
  );
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-toggle-row">
      <div className="flex-1">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)} className={`settings-toggle-switch ${checked ? 'active' : ''}`}>
        <div className="settings-toggle-knob" />
      </button>
    </label>
  );
}

export function ModelTesterSection({ apiKey }: { apiKey: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedModel, setCopiedModel] = useState<string | null>(null);
  const t = useT();
  const locale = useI18nStore((s) => s.locale);

  const handleCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.checkGoogleModels(apiKey);
      setModels(res.models);
      if (res.models.length === 0) {
        setError(locale === 'pt' ? 'Nenhum modelo compativel encontrado.' : 'No compatible models found.');
      }
    } catch (e: any) {
      console.error('Failed to check models:', e);
      setError(e.message || 'Error connecting to Google');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (window.ahri?.agent?.writeClipboard) {
      window.ahri.agent.writeClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopiedModel(text);
    setTimeout(() => setCopiedModel(null), 2000);
  };

  return (
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--glass-border)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--persona-primary)]/10 text-[var(--persona-primary)]">
            <FlaskConical size={16} />
          </div>
          <div className="text-left">
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              {t('api.tester.title' as any)}
            </h4>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {t('api.tester.desc' as any)}
            </p>
          </div>
        </div>
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all bg-[var(--glass-bg)] border border-[var(--glass-border)] ${isOpen ? 'rotate-180' : ''}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="mt-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <div className="flex-1">
              <p className="text-[11px] leading-relaxed max-w-sm" style={{ color: 'var(--text-tertiary)' }}>
                {t('api.tester.desc' as any)}
              </p>
            </div>
            <button
              onClick={handleCheck}
              disabled={loading || !apiKey}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
                loading
                  ? 'bg-amber-500/20 text-amber-500 cursor-not-allowed opacity-50'
                  : 'bg-[var(--persona-primary)] text-white hover:opacity-90 active:scale-95 shadow-[var(--persona-shadow)]'
              }`}
            >
              {loading ? (
                <>
                  <Activity size={14} />
                  {t('api.tester.checking' as any)}
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  {t('api.tester.check' as any)}
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] flex items-center gap-2">
              <Activity size={14} />
              {error}
            </div>
          )}

          {models.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar p-1">
              {models.map((model) => {
                const modelId = model.name.replace('models/', '');
                return (
                  <button
                    key={model.name}
                    onClick={() => copyToClipboard(modelId)}
                    className="group relative flex flex-row items-center justify-between p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--persona-primary)]/5 hover:border-[var(--persona-primary)]/40 transition-all text-left overflow-hidden gap-3"
                    title={t('api.tester.copy_hint' as any)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {model.display_name}
                      </span>
                      <code className="text-[9px] font-mono mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {modelId}
                      </code>
                    </div>

                    <div className={`flex-shrink-0 transition-all p-1.5 rounded-lg shadow-sm ${
                      copiedModel === modelId
                        ? 'bg-emerald-500 text-white'
                        : 'opacity-0 group-hover:opacity-100 bg-[var(--persona-primary)] text-white'
                    }`}>
                      {copiedModel === modelId ? (
                        <CheckCircle size={12} />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--persona-primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
