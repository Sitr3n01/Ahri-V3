import { useState } from 'react';

import { useI18nStore, useT } from '@/stores/i18n-store';

import { KeyInput, ModelTesterSection, SettingsSection, SettingsToggle } from './SettingsControls';
import type { ApiKeysConfig, ChatConfig } from './settingsTypes';

// ── API Keys Tab ──────────────────────────────────────────────
export function ApiKeysTab({
  config,
  onChange,
}: {
  config: ApiKeysConfig;
  onChange: (c: ApiKeysConfig) => void;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const [activeCategory, setActiveCategory] = useState<'llm' | 'vision' | 'integrations'>('llm');

  const updateField = <K extends keyof ApiKeysConfig>(field: K, value: ApiKeysConfig[K]) => {
    onChange({ ...config, [field]: value });
  };

  const categories = [
    { id: 'llm', label: t('api.category.llm') },
    { id: 'vision', label: t('api.category.vision') },
    { id: 'integrations', label: t('api.category.integrations') },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b pb-4 mb-4" style={{ borderColor: 'var(--glass-border)' }}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeCategory === cat.id ? 'active' : ''}`}
            style={activeCategory === cat.id
              ? { background: 'var(--persona-primary)', color: '#fff', boxShadow: '0 2px 8px color-mix(in srgb, var(--persona-shadow) 40%, transparent)' }
              : { background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)', border: '1px solid var(--glass-border)' }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="space-y-6 mt-4">
        {activeCategory === 'llm' && (
          <>
            <SettingsSection title={t('api.google_gemini')} description={t('api.google_gemini_desc')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.gemini_paid')} value={config.gemini_api_key_paid} onChange={(v) => updateField('gemini_api_key_paid', v)} placeholder="AIza..." />
                <div>
                  <label className="settings-label">{t('api.model_flash' as any)}</label>
                  <input type="text" className="settings-input" value={config.google_model_flash || ''} onChange={(e) => updateField('google_model_flash', e.target.value)} placeholder="gemini-2.5-flash" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <KeyInput label={t('api.gemini_free')} value={config.gemini_api_key_free} onChange={(v) => updateField('gemini_api_key_free', v)} placeholder="AIza..." />
                <div>
                  <label className="settings-label">{t('api.model_lite' as any)}</label>
                  <input type="text" className="settings-input" value={config.google_model_lite || ''} onChange={(e) => updateField('google_model_lite', e.target.value)} placeholder="gemini-3.1-flash-lite-preview" />
                </div>
              </div>

            </SettingsSection>

            <SettingsSection
              title={locale === 'pt' ? 'Google Gemma 4 (AI Studio)' : 'Google Gemma 4 (AI Studio)'}
              description={locale === 'pt' ? 'Modelos Gemma 4 via Google AI Studio — usam a mesma chave Gemini. Não aparecem no seletor se desabilitados.' : 'Gemma 4 models via Google AI Studio — share the same Gemini API key. Hidden in selector when disabled.'}
            >
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => updateField('gemma4_enabled', !config.gemma4_enabled)}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  style={{ background: config.gemma4_enabled ? 'var(--persona-primary)' : 'var(--surface-hover)' }}
                >
                  <span
                    className="pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out"
                    style={{
                      background: 'white',
                      transform: config.gemma4_enabled ? 'translateX(16px)' : 'translateX(0)',
                    }}
                  />
                </button>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {locale === 'pt' ? 'Habilitar modelos Gemma 4 no seletor de chat' : 'Show Gemma 4 models in chat selector'}
                </span>
              </div>
              {config.gemma4_enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="settings-label">{locale === 'pt' ? 'Gemma 4 31B (Dense)' : 'Gemma 4 31B (Dense)'}</label>
                    <input type="text" className="settings-input" value={config.gemma4_model_31b || ''} onChange={(e) => updateField('gemma4_model_31b', e.target.value)} placeholder="gemma-4-31b-it" />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>256K ctx · visão · 30.7B params</p>
                  </div>
                  <div>
                    <label className="settings-label">{locale === 'pt' ? 'Gemma 4 26B (MoE)' : 'Gemma 4 26B (MoE)'}</label>
                    <input type="text" className="settings-input" value={config.gemma4_model_26b || ''} onChange={(e) => updateField('gemma4_model_26b', e.target.value)} placeholder="gemma-4-26b-a4b" />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>256K ctx · visão · MoE 3.8B ativos</p>
                  </div>
                </div>
              )}
            </SettingsSection>

            <SettingsSection title={t('api.openrouter')} description={t('api.openrouter_desc')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.openrouter_key')} value={config.openrouter_api_key} onChange={(v) => updateField('openrouter_api_key', v)} placeholder="sk-or-..." />
                <div>
                  <label className="settings-label">{t('api.model_name')}</label>
                  <input type="text" className="settings-input" value={config.openrouter_model_name} onChange={(e) => updateField('openrouter_model_name', e.target.value)} placeholder="deepseek/deepseek-r1:free" />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title={locale === 'pt' ? 'Catalogo de Capacidades' : 'Capability Catalog'}
              description={locale === 'pt' ? 'Overrides JSON opcionais para modelos novos ou provedores ainda nao inferidos.' : 'Optional JSON overrides for new models or providers not inferred yet.'}
            >
              <textarea
                className="settings-input min-h-[120px] font-mono text-xs"
                value={config.model_capabilities_overrides}
                onChange={(e) => updateField('model_capabilities_overrides', e.target.value)}
                spellCheck={false}
                placeholder='{"models":{"provider/model":{"supports_vision":true,"reasoning":{"control":"effort","levels":["low","medium","high"]}}}}'
              />
            </SettingsSection>
            
            <SettingsSection title={t('api.other')} description={t('api.other_desc')}>
              <KeyInput label={t('api.deepinfra_key')} value={config.deepinfra_api_key} onChange={(v) => updateField('deepinfra_api_key', v)} placeholder="di_..." hint={t('api.deepinfra_hint')} />
            </SettingsSection>

            <SettingsSection title={"Ollama (Local Models)"} description={locale === 'pt' ? 'Configurações de modelos open-source locais via Ollama. A lista é obtida dinamicamente do servidor Ollama.' : 'Local open-source models via Ollama. Model list is fetched dynamically from the Ollama server.'}>
              <div>
                <label className="settings-label">{locale === 'pt' ? 'URL do Servidor Ollama' : 'Ollama Server URL'}</label>
                <input type="text" className="settings-input" value={config.ollama_base_url || 'http://localhost:11434'} onChange={(e) => updateField('ollama_base_url', e.target.value)} placeholder="http://localhost:11434" />
              </div>
            </SettingsSection>

            <SettingsSection title={t('api.memory_manager')} description={t('api.memory_manager_desc')}>
              <KeyInput label={t('api.memory_manager_key')} value={config.google_api_key_manager} onChange={(v) => updateField('google_api_key_manager', v)} placeholder="AIza..." hint={t('api.memory_manager_hint')} />
              <div className="mt-4">
                <label className="settings-label">{locale === 'pt' ? 'Modelo Exato de Memória' : 'Exact Memory Model'}</label>
                <input 
                  type="text" 
                  className="settings-input" 
                  value={config.google_model_memory || ''} 
                  onChange={(e) => updateField('google_model_memory', e.target.value)} 
                  placeholder="gemini-3.1-flash-lite-preview" 
                />
                <p className="text-[10px] mt-1 pr-2 leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                  {locale === 'pt' ? 'Modelo para compactação de histórico e extração de fatos (Background).' : 'Model for history compaction and fact extraction (Background).'}
                </p>
              </div>
            </SettingsSection>

            <ModelTesterSection apiKey={config.gemini_api_key_paid || config.google_ai_studio_api_key} />
          </>
        )}

        {activeCategory === 'vision' && (
          <>
            <SettingsSection title={t('api.google_search')} description={t('api.google_search_desc')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.cse_key')} value={config.cse_api_key} onChange={(v) => updateField('cse_api_key', v)} placeholder="AIza..." />
                <div>
                  <label className="settings-label">{t('api.cse_cx')}</label>
                  <input type="text" className="settings-input" value={config.cse_cx} onChange={(e) => updateField('cse_cx', e.target.value)} placeholder="abc123:xyz" />
                </div>
                <KeyInput label={t('api.search_key_a')} value={config.google_api_key_search} onChange={(v) => updateField('google_api_key_search', v)} placeholder="AIza..." />
                <KeyInput label={t('api.search_key_b')} value={config.google_api_key_search_b} onChange={(v) => updateField('google_api_key_search_b', v)} placeholder="AIza..." hint={t('api.backup_key_hint')} />
                <div className="md:col-span-2 mt-2">
                  <label className="settings-label">{locale === 'pt' ? 'Modelo Exato de Busca (Síntese)' : 'Exact Search Model (Synthesis)'}</label>
                  <input 
                    type="text" 
                    className="settings-input" 
                    value={config.google_model_search || ''} 
                    onChange={(e) => updateField('google_model_search', e.target.value)} 
                    placeholder="gemini-3.1-flash-lite-preview" 
                  />
                  <p className="text-[10px] mt-1 pr-2 leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                    {locale === 'pt' ? 'Modelo para sintetizar resultados de busca na web.' : 'Model for synthesizing web search results.'}
                  </p>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title={t('api.vision')} description={t('api.vision_desc')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.vision_key_a')} value={config.google_api_key_vision_a} onChange={(v) => updateField('google_api_key_vision_a', v)} placeholder="AIza..." />
                <KeyInput label={t('api.vision_key_b')} value={config.google_api_key_vision_b} onChange={(v) => updateField('google_api_key_vision_b', v)} placeholder="AIza..." hint={t('api.backup_key_hint')} />
                <div className="md:col-span-2 mt-2">
                  <label className="settings-label">{locale === 'pt' ? 'Modelo Exato de Visão' : 'Exact Vision Model'}</label>
                  <input 
                    type="text" 
                    className="settings-input" 
                    value={config.google_model_vision || ''} 
                    onChange={(e) => updateField('google_model_vision', e.target.value)} 
                    placeholder="gemini-2.5-flash" 
                  />
                  <p className="text-[10px] mt-1 pr-2 leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                    {locale === 'pt' ? 'Modelo para análise de imagens e OCR no Modo Agente.' : 'Model for image analysis and OCR in Agent Mode.'}
                  </p>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title={t('api.memory_manager')} description={t('api.memory_manager_desc')}>
              <KeyInput label={t('api.memory_manager_key')} value={config.google_api_key_manager} onChange={(v) => updateField('google_api_key_manager', v)} placeholder="AIza..." hint={t('api.memory_manager_hint')} />
              <div className="mt-4">
                <label className="settings-label">{locale === 'pt' ? 'Modelo Exato de Memória' : 'Exact Memory Model'}</label>
                <input 
                  type="text" 
                  className="settings-input" 
                  value={config.google_model_memory || ''} 
                  onChange={(e) => updateField('google_model_memory', e.target.value)} 
                  placeholder="gemini-3.1-flash-lite-preview" 
                />
                <p className="text-[10px] mt-1 pr-2 leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                  {locale === 'pt' ? 'Modelo para análise e síntese de memória.' : 'Model for memory analysis and synthesis.'}
                </p>
              </div>
            </SettingsSection>
          </>
        )}

        {activeCategory === 'integrations' && (
          <>
            <SettingsSection title={t('api.spotify')} description={t('api.spotify_desc')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.client_id')} value={config.spotipy_client_id} onChange={(v) => updateField('spotipy_client_id', v)} placeholder="your-spotify-client-id" />
                <KeyInput label={t('api.client_secret')} value={config.spotipy_client_secret} onChange={(v) => updateField('spotipy_client_secret', v)} placeholder="your-spotify-client-secret" />
              </div>
              <div className="mt-4">
                <label className="settings-label">{t('api.redirect_uri')}</label>
                <input type="text" className="settings-input" value={config.spotipy_redirect_uri} onChange={(e) => updateField('spotipy_redirect_uri', e.target.value)} />
              </div>
            </SettingsSection>
            
            <SettingsSection title="GitHub & Gist" description="Tokens for saving code or accessing remote repositories.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KeyInput label={t('api.github_token')} value={config.gh_token} onChange={(v) => updateField('gh_token', v)} placeholder="ghp_..." hint={t('api.github_hint')} />
                <div>
                  <label className="settings-label">{t('api.gist_id')}</label>
                  <input type="text" className="settings-input" value={config.gist_id} onChange={(e) => updateField('gist_id', e.target.value)} placeholder="abc123..." />
                </div>
              </div>
            </SettingsSection>
          </>
        )}
      </div>
    </div>
  );
}

// ── Chat Settings Tab ─────────────────────────────────────────
export function ChatTab({
  config,
  onChange,
}: {
  config: ChatConfig;
  onChange: (c: ChatConfig) => void;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);

  return (
    <div className="flex flex-col gap-6">
      {/* Settings Panel for Motor/Engine was removed because the user sets this dynamically straight from ChatInput UI */}

      <SettingsSection title={t('chat.behavior')} description={t('chat.behavior_desc')}>
        <SettingsToggle label={t('chat.streaming')} description={t('chat.streaming_desc')} checked={config.streaming_enabled} onChange={(v) => onChange({ ...config, streaming_enabled: v })} />
        <SettingsToggle label={t('chat.auto_tags')} description={t('chat.auto_tags_desc')} checked={config.auto_save_tags} onChange={(v) => onChange({ ...config, auto_save_tags: v })} />
        <SettingsToggle label={t('chat.timestamps')} description={t('chat.timestamps_desc')} checked={config.show_timestamps} onChange={(v) => onChange({ ...config, show_timestamps: v })} />
        {/* Reasoning level — 4-option segmented control */}
        <div className="flex flex-col gap-2 py-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {locale === 'pt' ? 'Nível de Raciocínio' : 'Reasoning Level'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {locale === 'pt' ? 'Aplicado conforme o catalogo do modelo selecionado.' : 'Applied according to the selected model capability catalog.'}
              </p>
            </div>
          </div>
          <div className="flex gap-1 mt-1">
            {(['off', 'low', 'medium', 'high'] as const).map((level) => {
              const labels: Record<string, string> = {
                off: locale === 'pt' ? 'Desativado' : 'Off',
                low: locale === 'pt' ? 'Baixo' : 'Low',
                medium: locale === 'pt' ? 'Médio' : 'Medium',
                high: locale === 'pt' ? 'Alto' : 'High',
              };
              const isActive = (config.reasoning_level || 'off') === level;
              return (
                <button
                  key={level}
                  onClick={() => onChange({ ...config, reasoning_level: level })}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--persona-primary)' : 'var(--glass-bg)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${isActive ? 'var(--persona-primary)' : 'var(--glass-border)'}`,
                  }}
                >
                  {labels[level]}
                </button>
              );
            })}
          </div>
        </div>
        <SettingsToggle label={t('chat.web_search')} description={t('chat.web_search_desc')} checked={config.internet_search_enabled || false} onChange={(v) => onChange({ ...config, internet_search_enabled: v })} />
      </SettingsSection>

      {/* Legacy History section removed. Relying solely on Compaction Service algorithms dynamically. */}

      <SettingsSection
        title={t('chat.compaction')}
        description={t('chat.compaction_desc')}
      >
        <div className="space-y-4">
          <div>
            <label className="settings-label">{t('chat.compaction_threshold')}</label>
            <input type="number" className="settings-input" value={config.compaction_threshold} onChange={(e) => onChange({ ...config, compaction_threshold: Number(e.target.value) })} min={10} max={200} step={5} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {t('chat.compaction_threshold_desc')}
            </p>
          </div>
          <div>
            <label className="settings-label">{t('chat.compaction_window')}</label>
            <input type="number" className="settings-input" value={config.compaction_recent_window} onChange={(e) => onChange({ ...config, compaction_recent_window: Number(e.target.value) })} min={5} max={100} step={5} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {t('chat.compaction_window_desc')}
            </p>
          </div>
          
          <div className="pt-2 border-t" style={{ borderColor: 'var(--glass-border)' }}>
            <p className="text-[10px] leading-tight flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {t('chat.compaction_model_hint')}
            </p>
          </div>
        </div>
      </SettingsSection>

    </div>
  );
}
