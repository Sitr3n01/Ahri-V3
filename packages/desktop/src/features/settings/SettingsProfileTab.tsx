import { useState } from 'react';
import { Activity, Brain, Code, Globe, Plus, Sparkles, Terminal, User, X } from 'lucide-react';

import { useI18nStore, useT } from '@/stores/i18n-store';

import { ProfileFilesPanel } from './ProfileFilesPanel';
import { TagInput } from './TagInput';
import type { ProfileFlattened } from './settingsTypes';

// ── Profile Tab ───────────────────────────────────────────────
export function ProfileTab({
  config,
  onChange,
}: {
  config: ProfileFlattened;
  onChange: (c: ProfileFlattened) => void;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Identity Card */}
      <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <User size={120} />
        </div>
        
        <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
          <User size={16} className="text-purple-400" />
          {t('profile.identity')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{t('profile.name')}</label>
            <input
              type="text"
              className="settings-input w-full"
              value={config.name}
              onChange={(e) => onChange({ ...config, name: e.target.value })}
              placeholder="Ex: Sitr3n"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{t('profile.archetype')}</label>
            <input
              type="text"
              className="settings-input w-full"
              value={config.archetype}
              onChange={(e) => onChange({ ...config, archetype: e.target.value })}
              placeholder="Ex: Humanista"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              {locale === 'pt' ? 'Ocupação' : 'Occupation'}
            </label>
            <input
              type="text"
              className="settings-input w-full"
              value={config.occupation}
              onChange={(e) => onChange({ ...config, occupation: e.target.value })}
              placeholder={locale === 'pt' ? 'Ex: Desenvolvedor, Estudante' : 'Ex: Developer, Student'}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{t('profile.learning_style')}</label>
            <input
              type="text"
              className="settings-input w-full"
              value={config.learning_style}
              onChange={(e) => onChange({ ...config, learning_style: e.target.value })}
            />
          </div>
          <div className="col-span-full space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              {locale === 'pt' ? 'Sobre Mim' : 'About Me'}
            </label>
            <textarea
              className="settings-input w-full min-h-[80px] resize-none"
              value={config.bio}
              onChange={(e) => onChange({ ...config, bio: e.target.value })}
              placeholder={locale === 'pt' ? 'Uma breve descrição sobre você...' : 'A brief description about yourself...'}
            />
          </div>
        </div>

        {/* Personality Traits */}
        <div className="mt-6">
          <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2 block">
            {locale === 'pt' ? 'Traços de Personalidade' : 'Personality Traits'}
          </label>
          <TagInput
            tags={config.personality}
            onChange={(tags) => onChange({ ...config, personality: tags })}
            placeholder={locale === 'pt' ? 'Ex: introvertido, criativo, curioso...' : 'Ex: introverted, creative, curious...'}
          />
        </div>
      </div>

      {/* Preferences & Interests Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
            <Brain size={16} className="text-blue-400" />
            {t('profile.interests')}
          </h3>
          <TagInput 
            tags={config.interests} 
            onChange={(tags) => onChange({ ...config, interests: tags })}
            placeholder={t('profile.interests_hint')}
          />
        </div>

        <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
            <Terminal size={16} className="text-emerald-400" />
            {t('profile.tech_stack')}
          </h3>
          <TagInput 
            tags={config.tech_stack} 
            onChange={(tags) => onChange({ ...config, tech_stack: tags })}
            placeholder={t('profile.tech_stack_hint')}
          />
        </div>

        <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
            <Activity size={16} className="text-pink-400" />
            {t('profile.music_preferences')}
          </h3>
          <TagInput 
            tags={config.music} 
            onChange={(tags) => onChange({ ...config, music: tags })}
            placeholder={t('profile.music_hint')}
          />
        </div>

        <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
            <X size={16} className="text-red-400" />
            {t('profile.dislikes')}
          </h3>
          <TagInput
            tags={config.dislikes}
            onChange={(tags) => onChange({ ...config, dislikes: tags })}
            placeholder={t('profile.dislikes_hint')}
          />
        </div>

        <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
            <Sparkles size={16} className="text-orange-400" />
            {locale === 'pt' ? 'Comidas Favoritas' : 'Favorite Foods'}
          </h3>
          <TagInput
            tags={config.foods}
            onChange={(tags) => onChange({ ...config, foods: tags })}
            placeholder={locale === 'pt' ? 'Ex: sushi, pizza, açaí...' : 'Ex: sushi, pizza, pasta...'}
          />
        </div>
      </div>

      {/* Languages Section */}
      <div className="settings-section-card p-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-solid)]">
        <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-[var(--text-primary)]">
          <Globe size={16} className="text-amber-400" />
          {t('profile.languages')}
        </h3>
        <div className="space-y-3">
          {Object.entries(config.languages).map(([lang, level]) => (
            <div key={lang} className="flex items-center gap-3">
              <input
                type="text"
                className="settings-input flex-1"
                value={lang}
                onChange={(e) => {
                  const newLangs = { ...config.languages };
                  delete newLangs[lang];
                  newLangs[e.target.value] = level;
                  onChange({ ...config, languages: newLangs });
                }}
                placeholder="Ex: Japanese"
              />
              <input
                type="text"
                className="settings-input w-24"
                value={level}
                onChange={(e) => {
                  const newLangs = { ...config.languages };
                  newLangs[lang] = e.target.value;
                  onChange({ ...config, languages: newLangs });
                }}
                placeholder="Ex: N5"
              />
              <button
                onClick={() => {
                  const newLangs = { ...config.languages };
                  delete newLangs[lang];
                  onChange({ ...config, languages: newLangs });
                }}
                className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newLangs = { ...config.languages, '': '' };
              onChange({ ...config, languages: newLangs });
            }}
            className="flex items-center gap-2 text-[10px] font-semibold text-amber-400/80 hover:text-amber-400 transition-colors px-2 py-1"
          >
            <Plus size={12} />
            {locale === 'pt' ? 'Adicionar idioma' : 'Add language'}
          </button>
        </div>
      </div>

      {/* Advanced File Editor Toggle */}
      <div className="mt-4 pt-6 border-t border-[var(--glass-border)]">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Code size={12} />
          {showAdvanced 
            ? (locale === 'pt' ? 'Esconder Editor Avançado' : 'Hide Advanced Editor')
            : (locale === 'pt' ? 'Modo de Edição Avançada (JSON)' : 'Advanced Editing Mode (JSON)')}
        </button>
        
        {showAdvanced && (
          <div className="mt-4">
            <ProfileFilesPanel 
              config={config} 
              onSync={onChange} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
