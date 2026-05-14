import React, { useRef, useState } from 'react';
import { BookOpen, Image as ImageIcon, Palette, Plus, Save, Sparkles, Trash2, User } from 'lucide-react';

import { ColorPicker } from '@/components/ColorPicker';
import { useT } from '@/stores/i18n-store';

import { ImageUpload } from './ImageUpload';
import { PersonaFilesPanel } from './PersonaFilesPanel';
import { getImagePosition, personaDisplayTheme } from './personaDisplay';
import type { EditablePersona } from './settingsTypes';

// ── Personas Tab ───────────────────────────────────────────────
export function PersonasTab({
  personas,
  activePersona,
  selectedPersona,
  onSelectPersona,
  onSave,
  onCancel,
  onFieldChange,
  editedData,
  hasChanges
}: PersonasTabProps) {
  const t = useT();
  const [activePicker, setActivePicker] = useState<'primary' | 'secondary' | null>(null);
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const currentPersona = personas.find((p: any) => p.name === (selectedPersona || activePersona));
  const currentTheme = personaDisplayTheme(currentPersona, 'ahri');
  const personaName = currentPersona?.name || activePersona;

  const previewTheme = editedData
    ? { ...currentTheme, primary: editedData.primaryColor, secondary: editedData.secondaryColor }
    : currentTheme;

  return (
    <div className="flex h-full">
      {/* Persona list */}
      <aside className="w-72 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--glass-border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-primary)' }}>
            {personas.length} {t('persona.count')}
          </p>
          <button
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-all border border-transparent hover:border-[var(--glass-border)]"
            title="Criar nova persona"
            style={{ color: 'var(--text-primary)' }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto settings-persona-list custom-scrollbar">
          {personas.map((p: any) => {
            const isSelected = selectedPersona === p.name || (!selectedPersona && p.name === activePersona);
            const pTheme = personaDisplayTheme(p);
            return (
              <button
                key={p.name}
                onClick={() => onSelectPersona(p.name)}
                className={`settings-persona-card ${isSelected ? 'active' : ''}`}
                style={{ '--persona-color': pTheme.primary } as React.CSSProperties}
              >
                {isSelected && <div className="settings-persona-active-indicator" />}
                <div className="settings-persona-image-container">
                  <img
                    src={`/${pTheme.background}`}
                    alt={p.display_name}
                    className="settings-persona-image"
                    style={{ objectPosition: getImagePosition(p.name) }}
                    draggable={false}
                  />
                  <div className="settings-persona-overlay" />
                  <div className="settings-persona-info">
                    <span className="settings-persona-name truncate">{p.display_name}</span>
                    <span className="settings-persona-id truncate opacity-70">@{p.name}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-6 pb-32 relative custom-scrollbar">
        {currentPersona && editedData ? (
          <div className="max-w-3xl mx-auto">
            {/* Persona Premium Header (Banner) */}
            <div className="mb-8 rounded-3xl overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-2xl relative group h-48 sm:h-56">
              <img
                src={`/${currentTheme.background}`}
                alt=""
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                style={{ objectPosition: getImagePosition(currentPersona.name) }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-white/10 shadow-xl backdrop-blur-md flex-shrink-0">
                  <img src={`/${currentTheme.avatar}`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-lg">
                      {editedData.displayName}
                    </h2>
                    {hasChanges && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-bold backdrop-blur-md animate-pulse">
                        <Sparkles size={10} />
                        {t('persona.unsaved')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-white/60 mt-1">@{currentPersona.name}</p>
                </div>

                <button
                  className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all mb-1"
                  title="Excluir persona"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="settings-unified-container">
              {/* Basic info */}
              <div className="settings-unified-section">
                <div className="settings-unified-section-header">
                  <User size={20} className="text-[#8B5CF6]" />
                  <div>
                    <h3 className="settings-unified-section-title">{t('persona.basic_info')}</h3>
                    <p className="settings-unified-section-desc">{t('persona.basic_info_desc')}</p>
                  </div>
                </div>
                <div className="settings-inner-grid">
                  <div>
                    <label className="settings-label">{t('persona.display_name')}</label>
                    <input
                      type="text"
                      className="settings-input"
                      value={editedData.displayName}
                      onChange={(e) => onFieldChange('displayName', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Persona Lore/Files section */}
              <div className="settings-unified-section">
                <div className="settings-unified-section-header">
                  <BookOpen size={20} className="text-[#EC4899]" />
                  <div>
                    <h3 className="settings-unified-section-title">{t('persona.files')}</h3>
                    <p className="settings-unified-section-desc">{t('persona.files_desc')}</p>
                  </div>
                </div>
                <PersonaFilesPanel
                  personaName={personaName}
                  basePath={`data/personas/${personaName}`}
                />
              </div>

              {/* Assets */}
              <div className="settings-unified-section">
                <div className="settings-unified-section-header">
                  <ImageIcon size={20} className="text-[#10B981]" />
                  <div>
                    <h3 className="settings-unified-section-title">{t('persona.assets')}</h3>
                    <p className="settings-unified-section-desc">{t('persona.assets_desc')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <ImageUpload
                    label={t('persona.avatar')}
                    currentImage={currentTheme.avatar}
                    onImageSelect={(file) => onFieldChange('avatarFile', file)}
                    previewShape="circle"
                    previewSize={{ width: 64, height: 64 }}
                  />
                  <ImageUpload
                    label={t('persona.background')}
                    currentImage={currentTheme.background}
                    onImageSelect={(file) => onFieldChange('backgroundFile', file)}
                    previewShape="rectangle"
                    previewSize={{ width: 140, height: 80 }}
                  />
                </div>
              </div>

              {/* Theme colors */}
              <div className="settings-unified-section">
                <div className="settings-unified-section-header">
                  <Palette size={20} className="text-[#F59E0B]" />
                  <div>
                    <h3 className="settings-unified-section-title">{t('persona.theme_colors')}</h3>
                    <p className="settings-unified-section-desc">{t('persona.theme_colors_desc')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 rounded-2xl bg-[var(--surface-hover)] border border-[var(--glass-border)] transition-colors hover:bg-white/[0.03]">
                    <label className="settings-label mb-3">{t('persona.primary')}</label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            if (activePicker === 'primary') {
                              setActivePicker(null);
                            } else {
                              setActivePicker('primary');
                            }
                          }}
                          className={`w-12 h-12 rounded-xl border-2 cursor-pointer shadow-lg overflow-hidden transition-all duration-300 ${activePicker === 'primary' ? 'scale-110 border-white/40 ring-4 ring-white/5' : 'border-white/10 hover:border-white/20'}`}
                          style={{ backgroundColor: editedData.primaryColor }}
                        />
                        {activePicker === 'primary' && (
                          <ColorPicker 
                            color={editedData.primaryColor}
                            onChange={(hex) => onFieldChange('primaryColor', hex)}
                            onClose={() => setActivePicker(null)}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        className="settings-input flex-1 font-mono text-sm uppercase text-center"
                        value={editedData.primaryColor}
                        onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onFieldChange('primaryColor', e.target.value); }}
                        maxLength={7}
                      />
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--surface-hover)] border border-[var(--glass-border)] transition-colors hover:bg-white/[0.03]">
                    <label className="settings-label mb-3">{t('persona.secondary')}</label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            if (activePicker === 'secondary') {
                              setActivePicker(null);
                            } else {
                              setActivePicker('secondary');
                            }
                          }}
                          className={`w-12 h-12 rounded-xl border-2 cursor-pointer shadow-lg overflow-hidden transition-all duration-300 ${activePicker === 'secondary' ? 'scale-110 border-white/40 ring-4 ring-white/5' : 'border-white/10 hover:border-white/20'}`}
                          style={{ backgroundColor: editedData.secondaryColor }}
                        />
                        {activePicker === 'secondary' && (
                          <ColorPicker 
                            color={editedData.secondaryColor}
                            onChange={(hex) => onFieldChange('secondaryColor', hex)}
                            onClose={() => setActivePicker(null)}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        className="settings-input flex-1 font-mono text-sm uppercase text-center"
                        value={editedData.secondaryColor}
                        onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onFieldChange('secondaryColor', e.target.value); }}
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Float Action Bar */}
            <div className={`fixed bottom-8 left-[calc(18rem+24rem)] right-16 flex justify-center transition-all duration-500 transform ${hasChanges ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
              <div className="px-6 py-4 rounded-2xl border border-[var(--glass-border)] bg-[#1a1a24]/80 backdrop-blur-2xl shadow-2xl flex items-center gap-4 min-w-[400px]">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{t('persona.unsaved')}</p>
                  <p className="text-[11px] text-white/50">Clique em salvar para aplicar todas as mudanças</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onCancel}
                    className="px-5 py-2.5 rounded-xl hover:bg-white/5 text-white/70 transition-all font-medium border border-transparent hover:border-white/10"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={onSave}
                    className="px-6 py-2.5 rounded-xl bg-[var(--persona-primary)] text-white shadow-lg shadow-[var(--persona-primary)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold flex items-center gap-2"
                  >
                    <Save size={18} />
                    {t('persona.save_changes')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Sparkles size={48} className="mb-4 text-[var(--persona-primary)] opacity-20" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('persona.select')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface PersonasTabProps {
  personas: any[];
  activePersona: string;
  selectedPersona: string | null;
  onSelectPersona: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onFieldChange: (field: keyof EditablePersona, value: string | File) => void;
  editedData: EditablePersona | null;
  hasChanges: boolean;
}
