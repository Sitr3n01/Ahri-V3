import React, { useState, useEffect } from 'react';
import { usePersonaStore } from '@/stores/persona-store';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { useI18nStore, useT } from '@/stores/i18n-store';
import { api } from '@/api/client';
import { getPersonaTheme } from '@ahri/shared';
import { ImageUpload } from './ImageUpload';
import { PersonaFilesPanel } from './PersonaFilesPanel';

// ── Types ──────────────────────────────────────────────────────
type SettingsTab = 'api-keys' | 'chat' | 'agent' | 'profile' | 'personas';

interface ApiKeysConfig {
  gemini_api_key_paid: string;
  gemini_api_key_free: string;
  openrouter_api_key: string;
  openrouter_model_name: string;
  google_api_key_search: string;
  google_api_key_search_b: string;
  cse_api_key: string;
  cse_cx: string;
  google_api_key_vision_a: string;
  google_api_key_vision_b: string;
  google_api_key_manager: string;
  spotipy_client_id: string;
  spotipy_client_secret: string;
  spotipy_redirect_uri: string;
  google_ai_studio_api_key: string;
  deepinfra_api_key: string;
  gh_token: string;
  gist_id: string;
}

interface ChatConfig {
  default_engine: 'PRO' | 'GOOGLE' | 'DEEPSEEK' | 'LOCAL';
  streaming_enabled: boolean;
  max_history_messages: number;
  auto_save_tags: boolean;
  show_timestamps: boolean;
  japanese_mode: boolean;
}

interface AgentConfig {
  agent_mode_enabled: boolean;
  orchestrator_model: string;
  tpm_limit: number;
  ollama_base_url: string;
  auto_approve_tasks: boolean;
  max_parallel_workers: number;
}

interface UserProfile {
  name: string;
  archetype: string;
  learning_style: string;
  interests: string[];
  tech_stack: string[];
  music: string[];
  dislikes: string[];
  languages: Record<string, string>;
}

interface EditablePersona {
  displayName: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  avatarFile?: File;
  backgroundFile?: File;
}

// Storage helpers
const STORAGE_PREFIX = 'ahri_settings_';

function loadFromStorage<T>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaults;
}

function saveToStorage(key: string, data: unknown) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
}

// ── Default Values ────────────────────────────────────────────
const DEFAULT_API_KEYS: ApiKeysConfig = {
  gemini_api_key_paid: '',
  gemini_api_key_free: '',
  openrouter_api_key: '',
  openrouter_model_name: 'deepseek/deepseek-r1:free',
  google_api_key_search: '',
  google_api_key_search_b: '',
  cse_api_key: '',
  cse_cx: '',
  google_api_key_vision_a: '',
  google_api_key_vision_b: '',
  google_api_key_manager: '',
  spotipy_client_id: '',
  spotipy_client_secret: '',
  spotipy_redirect_uri: 'http://localhost:8888/callback',
  google_ai_studio_api_key: '',
  deepinfra_api_key: '',
  gh_token: '',
  gist_id: '',
};

const DEFAULT_CHAT: ChatConfig = {
  default_engine: 'PRO',
  streaming_enabled: true,
  max_history_messages: 50,
  auto_save_tags: true,
  show_timestamps: true,
  japanese_mode: false,
};

const DEFAULT_AGENT: AgentConfig = {
  agent_mode_enabled: true,
  orchestrator_model: 'gemini-2.5-flash',
  tpm_limit: 15000,
  ollama_base_url: 'http://localhost:11434',
  auto_approve_tasks: false,
  max_parallel_workers: 4,
};

const DEFAULT_PROFILE: UserProfile = {
  name: 'Sitr3n',
  archetype: 'Humanista Melancólico',
  learning_style: 'Associação com Lore/Narrativa',
  interests: [
    'Anime (Violet Evergarden, Frieren, Diários de uma Apotecária)',
    'Lore de Jogos (HSR, Genshin, LoL, Valorant, WuWa)',
    'Audiofilia', 'Antropologia', 'Sociologia', 'Cosplay',
    'Hardware avançado', 'Software', 'História', 'Filosofia',
    'Aviação', 'Fotografia', 'Filmografia',
  ],
  tech_stack: ['Unity', 'Python', 'Internet'],
  music: ['MPB', 'Bossa Nova', 'Eletrônica', 'J-pop', 'K-pop', 'Orquestra', 'Lo-fi'],
  dislikes: ['Respostas secas', 'Falta de profundidade'],
  languages: { 'Japanese': 'N5' },
};

// ── Main Component ────────────────────────────────────────────
export function SettingsView() {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const personas = usePersonaStore((s) => s.personas);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const fetchPersonas = usePersonaStore((s) => s.fetchPersonas);
  const logout = useAuthStore((s) => s.logout);
  const appTheme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const [activeTab, setActiveTab] = useState<SettingsTab>('api-keys');
  const [apiKeys, setApiKeys] = useState<ApiKeysConfig>(() => loadFromStorage('api_keys', DEFAULT_API_KEYS));
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => loadFromStorage('chat', DEFAULT_CHAT));
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(() => loadFromStorage('agent', DEFAULT_AGENT));
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadFromStorage('profile', DEFAULT_PROFILE));
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Persona editor state
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<EditablePersona | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from API on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [settings, profile] = await Promise.all([
          api.getSettings(),
          api.getProfile()
        ]);

        // Map API settings to ApiKeysConfig
        setApiKeys({
          gemini_api_key_paid: settings.gemini_api_key_paid || '',
          gemini_api_key_free: settings.gemini_api_key_free || '',
          openrouter_api_key: settings.openrouter_api_key || '',
          openrouter_model_name: settings.openrouter_model_name || 'deepseek/deepseek-r1:free',
          google_api_key_search: settings.google_api_key_search || '',
          google_api_key_search_b: settings.google_api_key_search_b || '',
          cse_api_key: settings.cse_api_key || '',
          cse_cx: settings.cse_cx || '',
          google_api_key_vision_a: settings.google_api_key_vision_a || '',
          google_api_key_vision_b: settings.google_api_key_vision_b || '',
          google_api_key_manager: settings.google_api_key_manager || '',
          spotipy_client_id: settings.spotipy_client_id || '',
          spotipy_client_secret: settings.spotipy_client_secret || '',
          spotipy_redirect_uri: settings.spotipy_redirect_uri || 'http://localhost:8888/callback',
          google_ai_studio_api_key: settings.google_ai_studio_api_key || '',
          deepinfra_api_key: settings.deepinfra_api_key || '',
          gh_token: settings.gh_token || '',
          gist_id: settings.gist_id || '',
        });

        // Map Profile preferences to ChatConfig
        const prefs = profile.preferences || {};
        if (prefs.chat) {
          setChatConfig({ ...DEFAULT_CHAT, ...prefs.chat });
        }

        // Map Settings + Preferences to AgentConfig
        const agentPrefs = (prefs.agent || {}) as Record<string, any>;
        setAgentConfig({
          agent_mode_enabled: settings.agent_mode_enabled ?? true,
          orchestrator_model: settings.agent_mode_orchestrator || 'gemini-2.5-flash',
          tpm_limit: settings.google_ai_studio_tpm_limit || 15000,
          ollama_base_url: settings.ollama_base_url || 'http://localhost:11434',
          auto_approve_tasks: agentPrefs.auto_approve_tasks ?? false,
          max_parallel_workers: agentPrefs.max_parallel_workers ?? 4,
        });

        // Map Profile
        setUserProfile({
          name: profile.name || '',
          archetype: profile.archetype || '',
          learning_style: profile.learning_style || '',
          interests: (profile.attributes?.interests as string[]) || DEFAULT_PROFILE.interests,
          tech_stack: (profile.attributes?.tech_stack as string[]) || DEFAULT_PROFILE.tech_stack,
          music: (profile.attributes?.music as string[]) || DEFAULT_PROFILE.music,
          dislikes: (profile.attributes?.dislikes as string[]) || DEFAULT_PROFILE.dislikes,
          languages: (profile.attributes?.languages as Record<string, string>) || DEFAULT_PROFILE.languages,
        });

        // Correct previous assumptions:
        // UserProfileSchema defines 'name', 'archetype' at top level.
        // But MemoryService.get_profile returns dict with 'user_profile' key then MemoryService converts it to Schema.
        // So 'profile' object here IS UserProfileSchema shape.
        // So 'profile' variable here IS UserProfileSchema shape.
        // profile.name, profile.attributes, etc.


      } catch (e) {
        console.error('Failed to load settings:', e);
        showFeedback((t('error.load_failed' as any) || 'Failed to load settings') as any);
      }
    };
    loadSettings();
  }, []);

  const currentPersona = personas.find((p) => p.name === (selectedPersona || activePersona));
  const currentTheme = selectedPersona ? getPersonaTheme(selectedPersona) : getPersonaTheme(activePersona);

  // Initialize persona editable data
  useEffect(() => {
    if (activeTab === 'personas' && currentPersona) {
      const personaTheme = getPersonaTheme(currentPersona.name);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.archetype,
        primaryColor: personaTheme.primary,
        secondaryColor: personaTheme.secondary,
      });
      setHasChanges(false);
    }
  }, [currentPersona, activeTab]);

  const showFeedback = (msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 2500);
  };

  const handleSaveApiKeys = async () => {
    saveToStorage('api_keys', apiKeys);
    try {
      await api.updateSettings(apiKeys);
      showFeedback(locale === 'pt' ? 'Chaves API salvas' : 'API keys saved');
    } catch {
      showFeedback('Error saving API keys');
    }
  };

  const handleSaveChatConfig = async () => {
    saveToStorage('chat', chatConfig);
    try {
      // Get current profile first to not overwrite other prefs
      const profile = await api.getProfile();
      await api.saveProfile({
        ...profile,
        preferences: {
          ...profile.preferences,
          chat: chatConfig
        }
      });
      showFeedback(locale === 'pt' ? 'Config. chat salva' : 'Chat settings saved');
    } catch {
      showFeedback('Error saving chat config');
    }
  };

  const handleSaveAgentConfig = async () => {
    saveToStorage('agent', agentConfig);
    try {
      // 1. Save Environment Settings
      await api.updateSettings({
        agent_mode_enabled: agentConfig.agent_mode_enabled,
        agent_mode_orchestrator: agentConfig.orchestrator_model,
        google_ai_studio_tpm_limit: agentConfig.tpm_limit,
        ollama_base_url: agentConfig.ollama_base_url,
      });

      // 2. Save Profile Preferences
      const profile = await api.getProfile();
      await api.saveProfile({
        ...profile,
        preferences: {
          ...profile.preferences,
          agent: {
            auto_approve_tasks: agentConfig.auto_approve_tasks,
            max_parallel_workers: agentConfig.max_parallel_workers
          }
        }
      });

      showFeedback(locale === 'pt' ? 'Config. agente salva' : 'Agent settings saved');
    } catch {
      showFeedback('Error saving agent config');
    }
  };

  const handleSaveProfile = async () => {
    saveToStorage('profile', userProfile);
    try {
      // Construct full profile object including attributes
      const current = await api.getProfile();
      await api.saveProfile({
        ...current,
        name: userProfile.name,
        archetype: userProfile.archetype,
        learning_style: userProfile.learning_style,
        attributes: {
          ...current.attributes,
          interests: userProfile.interests,
          tech_stack: userProfile.tech_stack,
          music: userProfile.music,
          dislikes: userProfile.dislikes,
          languages: userProfile.languages,
        }
      });
      showFeedback(locale === 'pt' ? 'Perfil salvo' : 'Profile saved');
    } catch {
      showFeedback('Error saving profile');
    }
  };

  const handlePersonaFieldChange = (field: keyof EditablePersona, value: string | File) => {
    if (!editedData) return;
    setEditedData({ ...editedData, [field]: value });
    setHasChanges(true);
  };

  const handlePersonaSave = async () => {
    if (!currentPersona || !editedData) return;
    try {
      await api.updatePersona(currentPersona.name, {
        display_name: editedData.displayName,
        archetype: editedData.description,
        primary_color: editedData.primaryColor,
        secondary_color: editedData.secondaryColor,
        // Assuming image handling is separate or not implemented yet for basic save
        // logic here doesn't seem to upload files, just update metadata
      });
      showFeedback(locale === 'pt' ? 'Persona salva' : 'Persona saved');
      setHasChanges(false);
      await fetchPersonas();
    } catch (e) {
      console.error('Failed to save persona:', e);
      showFeedback('Error saving persona');
    }
  };

  const handlePersonaCancel = () => {
    if (currentPersona) {
      const personaTheme = getPersonaTheme(currentPersona.name);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.archetype,
        primaryColor: personaTheme.primary,
        secondaryColor: personaTheme.secondary,
      });
      setHasChanges(false);
    }
  };

  // ── Tabs config ────────────────────────────────────────────
  const tabs: { id: SettingsTab; label: string; icon: React.ReactElement }[] = [
    {
      id: 'api-keys',
      label: t('tab.api_keys'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      ),
    },
    {
      id: 'chat',
      label: t('tab.chat'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'agent',
      label: t('tab.agent'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'profile',
      label: t('tab.profile'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      ),
    },
    {
      id: 'personas',
      label: t('tab.personas'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full w-full">
      {/* Utility bar (replaces sidebar in settings mode) */}
      <div className="settings-utility-bar">
        <div className="settings-utility-inner">
        <div className="flex items-center gap-2">
          <span
            className="text-base font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, var(--persona-primary) 0%, var(--persona-secondary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
            }}
          >
            Ahri
          </span>
          <span className="text-[10px] font-mono opacity-35">v3</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="chat-sidebar-icon-btn"
            title={appTheme === 'dark' ? t('common.theme_light') : t('common.theme_dark')}
          >
            {appTheme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {/* Logout */}
          <button onClick={logout} className="chat-sidebar-icon-btn" title={t('nav.logout')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
        </div>
      </div>

      {/* Header with tabs */}
      <div className="settings-header">
        <div className="settings-header-inner">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-lg font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--persona-primary) 0%, var(--persona-secondary) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t('settings.title')}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('settings.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Language switcher */}
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setLocale('pt')}
                className="px-2 py-1 rounded text-xs font-medium transition-all"
                style={locale === 'pt'
                  ? { background: 'var(--surface-active)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-tertiary)' }
                }
              >
                PT
              </button>
              <span style={{ color: 'var(--text-tertiary)' }}>|</span>
              <button
                onClick={() => setLocale('en')}
                className="px-2 py-1 rounded text-xs font-medium transition-all"
                style={locale === 'en'
                  ? { background: 'var(--surface-active)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-tertiary)' }
                }
              >
                EN
              </button>
            </div>

            {savedFeedback && (
              <div className="settings-saved-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {savedFeedback}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="settings-tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              style={activeTab === tab.id ? { '--tab-color': 'var(--persona-primary)' } as React.CSSProperties : undefined}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto settings-content">
        {activeTab === 'api-keys' && (
          <ApiKeysTab config={apiKeys} onChange={setApiKeys} onSave={handleSaveApiKeys} />
        )}
        {activeTab === 'chat' && (
          <ChatTab config={chatConfig} onChange={setChatConfig} onSave={handleSaveChatConfig} />
        )}
        {activeTab === 'agent' && (
          <AgentTab config={agentConfig} onChange={setAgentConfig} onSave={handleSaveAgentConfig} />
        )}
        {activeTab === 'profile' && (
          <ProfileTab config={userProfile} onChange={setUserProfile} onSave={handleSaveProfile} />
        )}
        {activeTab === 'personas' && (
          <PersonasTab
            personas={personas}
            selectedPersona={selectedPersona}
            activePersona={activePersona}
            editedData={editedData}
            hasChanges={hasChanges}
            currentTheme={currentTheme}
            onSelectPersona={(name) => {
              if (hasChanges && !confirm(t('persona.unsaved_confirm'))) return;
              setSelectedPersona(name);
            }}
            onFieldChange={handlePersonaFieldChange}
            onSave={handlePersonaSave}
            onCancel={handlePersonaCancel}
          />
        )}
      </div>
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────
function ApiKeysTab({
  config,
  onChange,
  onSave,
}: {
  config: ApiKeysConfig;
  onChange: (c: ApiKeysConfig) => void;
  onSave: () => void;
}) {
  const t = useT();
  const updateField = (field: keyof ApiKeysConfig, value: string) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="settings-panel">
      <GoogleOAuthSection />

      <SettingsSection title={t('api.google_gemini')} description={t('api.google_gemini_desc')}>
        <KeyInput label={t('api.gemini_paid')} value={config.gemini_api_key_paid} onChange={(v) => updateField('gemini_api_key_paid', v)} placeholder="AIza..." />
        <KeyInput label={t('api.gemini_free')} value={config.gemini_api_key_free} onChange={(v) => updateField('gemini_api_key_free', v)} placeholder="AIza..." />
        <KeyInput label={t('api.ai_studio')} value={config.google_ai_studio_api_key} onChange={(v) => updateField('google_ai_studio_api_key', v)} placeholder="AIza..." hint={t('api.ai_studio_hint')} />
      </SettingsSection>

      <SettingsSection title={t('api.openrouter')} description={t('api.openrouter_desc')}>
        <KeyInput label={t('api.openrouter_key')} value={config.openrouter_api_key} onChange={(v) => updateField('openrouter_api_key', v)} placeholder="sk-or-..." />
        <div>
          <label className="settings-label">{t('api.model_name')}</label>
          <input type="text" className="settings-input" value={config.openrouter_model_name} onChange={(e) => updateField('openrouter_model_name', e.target.value)} placeholder="deepseek/deepseek-r1:free" />
        </div>
      </SettingsSection>

      <SettingsSection title={t('api.google_search')} description={t('api.google_search_desc')}>
        <KeyInput label={t('api.cse_key')} value={config.cse_api_key} onChange={(v) => updateField('cse_api_key', v)} placeholder="AIza..." />
        <div>
          <label className="settings-label">{t('api.cse_cx')}</label>
          <input type="text" className="settings-input" value={config.cse_cx} onChange={(e) => updateField('cse_cx', e.target.value)} placeholder="abc123:xyz" />
        </div>
        <KeyInput label={t('api.search_key_a')} value={config.google_api_key_search} onChange={(v) => updateField('google_api_key_search', v)} placeholder="AIza..." />
        <KeyInput label={t('api.search_key_b')} value={config.google_api_key_search_b} onChange={(v) => updateField('google_api_key_search_b', v)} placeholder="AIza..." hint={t('api.backup_key_hint')} />
      </SettingsSection>

      <SettingsSection title={t('api.vision')} description={t('api.vision_desc')}>
        <KeyInput label={t('api.vision_key_a')} value={config.google_api_key_vision_a} onChange={(v) => updateField('google_api_key_vision_a', v)} placeholder="AIza..." />
        <KeyInput label={t('api.vision_key_b')} value={config.google_api_key_vision_b} onChange={(v) => updateField('google_api_key_vision_b', v)} placeholder="AIza..." hint={t('api.backup_key_hint')} />
      </SettingsSection>

      <SettingsSection title={t('api.memory_manager')} description={t('api.memory_manager_desc')}>
        <KeyInput label={t('api.memory_manager_key')} value={config.google_api_key_manager} onChange={(v) => updateField('google_api_key_manager', v)} placeholder="AIza..." hint={t('api.memory_manager_hint')} />
      </SettingsSection>

      <SettingsSection title={t('api.spotify')} description={t('api.spotify_desc')}>
        <KeyInput label={t('api.client_id')} value={config.spotipy_client_id} onChange={(v) => updateField('spotipy_client_id', v)} placeholder="your-spotify-client-id" />
        <KeyInput label={t('api.client_secret')} value={config.spotipy_client_secret} onChange={(v) => updateField('spotipy_client_secret', v)} placeholder="your-spotify-client-secret" />
        <div>
          <label className="settings-label">{t('api.redirect_uri')}</label>
          <input type="text" className="settings-input" value={config.spotipy_redirect_uri} onChange={(e) => updateField('spotipy_redirect_uri', e.target.value)} />
        </div>
      </SettingsSection>

      <SettingsSection title={t('api.other')} description={t('api.other_desc')}>
        <KeyInput label={t('api.deepinfra_key')} value={config.deepinfra_api_key} onChange={(v) => updateField('deepinfra_api_key', v)} placeholder="di_..." hint={t('api.deepinfra_hint')} />
        <KeyInput label={t('api.github_token')} value={config.gh_token} onChange={(v) => updateField('gh_token', v)} placeholder="ghp_..." hint={t('api.github_hint')} />
        <div>
          <label className="settings-label">{t('api.gist_id')}</label>
          <input type="text" className="settings-input" value={config.gist_id} onChange={(e) => updateField('gist_id', e.target.value)} placeholder="abc123..." />
        </div>
      </SettingsSection>

      <div className="settings-actions">
        <button onClick={onSave} className="settings-save-btn">{t('api.save')}</button>
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          {t('api.save_note')}
        </p>
      </div>
    </div>
  );
}

// ── Chat Settings Tab ─────────────────────────────────────────
function ChatTab({
  config,
  onChange,
  onSave,
}: {
  config: ChatConfig;
  onChange: (c: ChatConfig) => void;
  onSave: () => void;
}) {
  const t = useT();
  const engines = [
    { value: 'PRO', label: t('chat.pro_label'), desc: t('chat.pro_desc') },
    { value: 'GOOGLE', label: t('chat.google_label'), desc: t('chat.google_desc') },
    { value: 'DEEPSEEK', label: t('chat.deepseek_label'), desc: t('chat.deepseek_desc') },
    { value: 'LOCAL', label: t('chat.local_label'), desc: t('chat.local_desc') },
  ];

  return (
    <div className="settings-panel">
      <SettingsSection title={t('chat.engine')} description={t('chat.engine_desc')}>
        <div className="space-y-2">
          {engines.map((e) => (
            <label key={e.value} className={`settings-radio-card ${config.default_engine === e.value ? 'active' : ''}`}>
              <input type="radio" name="engine" value={e.value} checked={config.default_engine === e.value} onChange={() => onChange({ ...config, default_engine: e.value as ChatConfig['default_engine'] })} className="hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.label}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{e.desc}</p>
                </div>
                <div className={`settings-radio-dot ${config.default_engine === e.value ? 'active' : ''}`} />
              </div>
            </label>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('chat.behavior')} description={t('chat.behavior_desc')}>
        <SettingsToggle label={t('chat.streaming')} description={t('chat.streaming_desc')} checked={config.streaming_enabled} onChange={(v) => onChange({ ...config, streaming_enabled: v })} />
        <SettingsToggle label={t('chat.auto_tags')} description={t('chat.auto_tags_desc')} checked={config.auto_save_tags} onChange={(v) => onChange({ ...config, auto_save_tags: v })} />
        <SettingsToggle label={t('chat.timestamps')} description={t('chat.timestamps_desc')} checked={config.show_timestamps} onChange={(v) => onChange({ ...config, show_timestamps: v })} />
        <SettingsToggle label={t('chat.japanese')} description={t('chat.japanese_desc')} checked={config.japanese_mode} onChange={(v) => onChange({ ...config, japanese_mode: v })} />
      </SettingsSection>

      <SettingsSection title={t('chat.history')} description={t('chat.history_desc')}>
        <div>
          <label className="settings-label">{t('chat.max_history')}</label>
          <input type="number" className="settings-input" value={config.max_history_messages} onChange={(e) => onChange({ ...config, max_history_messages: Number(e.target.value) })} min={5} max={200} step={5} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('chat.max_history_hint')}</p>
        </div>
      </SettingsSection>

      <div className="settings-actions">
        <button onClick={onSave} className="settings-save-btn">{t('chat.save')}</button>
      </div>
    </div>
  );
}

// ── Agent Settings Tab ────────────────────────────────────────
function AgentTab({
  config,
  onChange,
  onSave,
}: {
  config: AgentConfig;
  onChange: (c: AgentConfig) => void;
  onSave: () => void;
}) {
  const t = useT();

  return (
    <div className="settings-panel">
      <SettingsSection title={t('agent.general')} description={t('agent.general_desc')}>
        <SettingsToggle label={t('agent.enabled')} description={t('agent.enabled_desc')} checked={config.agent_mode_enabled} onChange={(v) => onChange({ ...config, agent_mode_enabled: v })} />
        <SettingsToggle label={t('agent.auto_approve')} description={t('agent.auto_approve_desc')} checked={config.auto_approve_tasks} onChange={(v) => onChange({ ...config, auto_approve_tasks: v })} />
      </SettingsSection>

      <SettingsSection title={t('agent.orchestrator')} description={t('agent.orchestrator_desc')}>
        <div>
          <label className="settings-label">{t('agent.orchestrator_model')}</label>
          <select className="settings-input" value={config.orchestrator_model} onChange={(e) => onChange({ ...config, orchestrator_model: e.target.value })}>
            <option value="gemini-2.5-pro-preview">Gemini 2.5 Pro (Best, slower)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
            <option value="gemma-3-27b">Gemma 3 27B (Free tier)</option>
          </select>
        </div>
      </SettingsSection>

      <SettingsSection title={t('agent.workers')} description={t('agent.workers_desc')}>
        <div>
          <label className="settings-label">{t('agent.max_workers')}</label>
          <input type="number" className="settings-input" value={config.max_parallel_workers} onChange={(e) => onChange({ ...config, max_parallel_workers: Number(e.target.value) })} min={1} max={8} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('agent.max_workers_hint')}</p>
        </div>
        <div>
          <label className="settings-label">{t('agent.tpm_limit')}</label>
          <input type="number" className="settings-input" value={config.tpm_limit} onChange={(e) => onChange({ ...config, tpm_limit: Number(e.target.value) })} min={1000} max={100000} step={1000} />
        </div>
        <div>
          <label className="settings-label">{t('agent.ollama_url')}</label>
          <input type="text" className="settings-input" value={config.ollama_base_url} onChange={(e) => onChange({ ...config, ollama_base_url: e.target.value })} placeholder="http://localhost:11434" />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('agent.ollama_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('agent.available_workers')} description={t('agent.available_workers_desc')}>
        <div className="settings-workers-grid">
          {[
            { name: 'RAG', icon: '🔍', key: 'worker.rag' as const },
            { name: 'Code', icon: '💻', key: 'worker.code' as const },
            { name: 'Shell', icon: '⚡', key: 'worker.shell' as const },
            { name: 'Memory', icon: '🧠', key: 'worker.memory' as const },
            { name: 'Web', icon: '🌐', key: 'worker.web' as const },
            { name: 'Vision', icon: '👁️', key: 'worker.vision' as const },
            { name: 'Browser', icon: '🌍', key: 'worker.browser' as const },
            { name: 'Router', icon: '🔀', key: 'worker.router' as const },
          ].map((w) => (
            <div key={w.name} className="settings-worker-card">
              <span className="text-lg">{w.icon}</span>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{w.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t(w.key)}</p>
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <div className="settings-actions">
        <button onClick={onSave} className="settings-save-btn">{t('agent.save')}</button>
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────
function ProfileTab({
  config,
  onChange,
  onSave,
}: {
  config: UserProfile;
  onChange: (c: UserProfile) => void;
  onSave: () => void;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);

  return (
    <div className="settings-panel">
      <SettingsSection title={t('profile.identity')} description={t('profile.identity_desc')}>
        <div>
          <label className="settings-label">{t('profile.name')}</label>
          <input type="text" className="settings-input" value={config.name} onChange={(e) => onChange({ ...config, name: e.target.value })} placeholder="Sitr3n" />
        </div>
        <div>
          <label className="settings-label">{t('profile.archetype')}</label>
          <input type="text" className="settings-input" value={config.archetype} onChange={(e) => onChange({ ...config, archetype: e.target.value })} placeholder="Humanista Melancólico" />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.archetype_hint')}</p>
        </div>
        <div>
          <label className="settings-label">{t('profile.learning_style')}</label>
          <input type="text" className="settings-input" value={config.learning_style} onChange={(e) => onChange({ ...config, learning_style: e.target.value })} />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.learning_style_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('profile.interests')} description={t('profile.interests_desc')}>
        <div>
          <textarea
            className="settings-input font-mono text-xs"
            rows={6}
            value={config.interests.join('\n')}
            onChange={(e) => onChange({ ...config, interests: e.target.value.split('\n').filter((s) => s.trim()) })}
            style={{ resize: 'vertical' }}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.interests_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('profile.tech_stack')} description={t('profile.tech_stack_desc')}>
        <div>
          <input
            type="text"
            className="settings-input"
            value={config.tech_stack.join(', ')}
            onChange={(e) => onChange({ ...config, tech_stack: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.tech_stack_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('profile.music_preferences')} description={t('profile.music_desc')}>
        <div>
          <textarea
            className="settings-input font-mono text-xs"
            rows={4}
            value={config.music.join('\n')}
            onChange={(e) => onChange({ ...config, music: e.target.value.split('\n').filter((s) => s.trim()) })}
            style={{ resize: 'vertical' }}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.music_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('profile.dislikes')} description={t('profile.dislikes_desc')}>
        <div>
          <textarea
            className="settings-input font-mono text-xs"
            rows={3}
            value={config.dislikes.join('\n')}
            onChange={(e) => onChange({ ...config, dislikes: e.target.value.split('\n').filter((s) => s.trim()) })}
            style={{ resize: 'vertical' }}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('profile.dislikes_hint')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('profile.languages')} description={t('profile.languages_desc')}>
        <div className="space-y-2">
          {Object.entries(config.languages).map(([lang, level]) => (
            <div key={lang} className="flex items-center gap-2">
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
                placeholder="Japanese"
              />
              <input
                type="text"
                className="settings-input flex-1"
                value={level}
                onChange={(e) => {
                  const newLangs = { ...config.languages };
                  newLangs[lang] = e.target.value;
                  onChange({ ...config, languages: newLangs });
                }}
                placeholder="N5"
              />
              <button
                onClick={() => {
                  const newLangs = { ...config.languages };
                  delete newLangs[lang];
                  onChange({ ...config, languages: newLangs });
                }}
                className="settings-key-toggle"
                style={{ width: 32, height: 32 }}
                title="Remove"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newLangs = { ...config.languages, '': '' };
              onChange({ ...config, languages: newLangs });
            }}
            className="settings-cancel-btn text-xs"
          >
            + {locale === 'pt' ? 'Adicionar idioma' : 'Add language'}
          </button>
        </div>
      </SettingsSection>

      <div className="settings-actions">
        <button onClick={onSave} className="settings-save-btn">{t('profile.save')}</button>
      </div>
    </div>
  );
}


// ── Personas Tab ───────────────────────────────────────────────
function PersonasTab({
  personas,
  selectedPersona,
  activePersona,
  editedData,
  hasChanges,
  currentTheme,
  onSelectPersona,
  onFieldChange,
  onSave,
  onCancel,
}: {
  personas: any[];
  selectedPersona: string | null;
  activePersona: string;
  editedData: EditablePersona | null;
  hasChanges: boolean;
  currentTheme: any;
  onSelectPersona: (name: string) => void;
  onFieldChange: (field: keyof EditablePersona, value: string | File) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const currentPersona = personas.find((p) => p.name === (selectedPersona || activePersona));
  const personaName = currentPersona?.name || activePersona;

  const previewTheme = editedData
    ? { ...currentTheme, primary: editedData.primaryColor, secondary: editedData.secondaryColor }
    : currentTheme;

  return (
    <div className="flex h-full">
      {/* Persona list */}
      <aside className="w-56 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="p-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {personas.length} {t('persona.count')}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {personas.map((p) => {
            const isSelected = selectedPersona === p.name || (!selectedPersona && p.name === activePersona);
            const pTheme = getPersonaTheme(p.name);
            return (
              <button
                key={p.name}
                onClick={() => onSelectPersona(p.name)}
                className={`settings-persona-item ${isSelected ? 'active' : ''}`}
                style={isSelected ? { borderLeftColor: pTheme.primary } : undefined}
              >
                <div className="w-7 h-7 rounded-full overflow-hidden border-2 flex-shrink-0" style={{ borderColor: pTheme.primary + '40' }}>
                  <img src={`/${pTheme.avatar}`} alt={p.display_name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium truncate">{p.display_name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{p.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {currentPersona && editedData ? (
          <div className="max-w-xl">
            {/* Persona header */}
            <div className="mb-5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2" style={{ borderColor: previewTheme.primary + '40' }}>
                <img src={`/${currentTheme.avatar}`} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{editedData.displayName}</h2>
                <p className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>@{currentPersona.name}</p>
              </div>
              {hasChanges && (
                <span className="px-2 py-0.5 text-[10px] bg-amber-500/15 text-amber-500 border border-amber-500/20 rounded font-mono ml-auto">
                  {t('persona.unsaved')}
                </span>
              )}
            </div>

            {/* Persona files section - THE NEW FEATURE */}
            <SettingsSection title={t('persona.files')} description={t('persona.files_desc')}>
              <PersonaFilesPanel
                personaName={personaName}
                basePath={`data/personas/${personaName}`}
              />
            </SettingsSection>

            {/* Basic info */}
            <SettingsSection title={t('persona.basic_info')} description={t('persona.basic_info_desc')}>
              <div>
                <label className="settings-label">{t('persona.display_name')}</label>
                <input type="text" className="settings-input" value={editedData.displayName} onChange={(e) => onFieldChange('displayName', e.target.value)} />
              </div>
              <div>
                <label className="settings-label">{t('persona.description')}</label>
                <textarea className="settings-input" rows={3} value={editedData.description} onChange={(e) => onFieldChange('description', e.target.value)} style={{ resize: 'none' }} />
              </div>
            </SettingsSection>

            {/* Assets */}
            <SettingsSection title={t('persona.assets')} description={t('persona.assets_desc')}>
              <ImageUpload label={t('persona.avatar')} currentImage={currentTheme.avatar} onImageSelect={(file) => onFieldChange('avatarFile', file)} previewShape="circle" previewSize={{ width: 56, height: 56 }} />
              <ImageUpload label={t('persona.background')} currentImage={currentTheme.background} onImageSelect={(file) => onFieldChange('backgroundFile', file)} previewShape="rectangle" previewSize={{ width: 120, height: 68 }} />
            </SettingsSection>

            {/* Theme colors */}
            <SettingsSection title={t('persona.theme_colors')} description={t('persona.theme_colors_desc')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="settings-label">{t('persona.primary')}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={editedData.primaryColor} onChange={(e) => onFieldChange('primaryColor', e.target.value)} className="w-10 h-10 rounded border cursor-pointer" style={{ borderColor: 'var(--glass-border)' }} />
                    <input type="text" className="settings-input flex-1 font-mono text-xs uppercase" value={editedData.primaryColor} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onFieldChange('primaryColor', e.target.value); }} maxLength={7} />
                  </div>
                </div>
                <div>
                  <label className="settings-label">{t('persona.secondary')}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={editedData.secondaryColor} onChange={(e) => onFieldChange('secondaryColor', e.target.value)} className="w-10 h-10 rounded border cursor-pointer" style={{ borderColor: 'var(--glass-border)' }} />
                    <input type="text" className="settings-input flex-1 font-mono text-xs uppercase" value={editedData.secondaryColor} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onFieldChange('secondaryColor', e.target.value); }} maxLength={7} />
                  </div>
                </div>
              </div>
            </SettingsSection>

            <div className="settings-actions">
              <button onClick={onSave} disabled={!hasChanges} className="settings-save-btn" style={!hasChanges ? { opacity: 0.4 } : undefined}>{t('persona.save_changes')}</button>
              <button onClick={onCancel} disabled={!hasChanges} className="settings-cancel-btn" style={!hasChanges ? { opacity: 0.4 } : undefined}>{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p style={{ color: 'var(--text-tertiary)' }}>{t('persona.select')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────
// ── Google OAuth Section ──────────────────────────────────────
function GoogleOAuthSection() {
  const [oauthStatus, setOauthStatus] = useState<{ configured: boolean; connected: boolean; email: string | null; models: any[] }>({
    configured: false, connected: false, email: null, models: []
  });
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check OAuth status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Poll while waiting for callback
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getOAuthStatus();
        setOauthStatus(status);
        if (status.connected) {
          setPolling(false);
          // Refresh available models in chat store
          const { useChatStore } = await import('@/stores/chat-store');
          useChatStore.getState().fetchAvailableModels();
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling]);

  const checkStatus = async () => {
    try {
      const status = await api.getOAuthStatus();
      setOauthStatus(status);
    } catch { /* ignore */ }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const { auth_url } = await api.initiateGoogleOAuth();
      // Open in system browser
      if ((window as any).ahri?.agent?.openUrl) {
        (window as any).ahri.agent.openUrl(auth_url);
      } else {
        window.open(auth_url, '_blank');
      }
      setPolling(true);
    } catch (e: any) {
      console.error('OAuth initiation failed:', e);
      const msg = e?.response?.data?.detail || e?.message || 'Falha ao iniciar OAuth';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await api.disconnectGoogleOAuth();
      setOauthStatus({ configured: false, connected: false, email: null, models: [] });
      // Refresh available models
      const { useChatStore } = await import('@/stores/chat-store');
      useChatStore.getState().fetchAvailableModels();
    } catch (e) {
      console.error('OAuth disconnect failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-section" style={{ borderColor: oauthStatus.connected ? 'rgba(34, 197, 94, 0.3)' : undefined }}>
      <div className="settings-section-header">
        <div className="flex items-center gap-2">
          <h3 className="settings-section-title">Google Account (OAuth)</h3>
          {oauthStatus.connected && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
              Conectado
            </span>
          )}
        </div>
        <p className="settings-section-desc">
          Conecte sua conta Google para usar todos os modelos do seu plano Gemini.
        </p>
      </div>
      <div className="settings-section-body space-y-3">
        {oauthStatus.connected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--button-bg)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {oauthStatus.email || 'Google Account'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {oauthStatus.models?.length || 0} modelos disponíveis
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                Desconectar
              </button>
            </div>

            {/* Model list */}
            {oauthStatus.models && oauthStatus.models.length > 0 && (
              <div className="p-3 rounded-lg space-y-1" style={{ background: 'var(--button-bg)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Modelos do seu plano:
                </p>
                <div className="flex flex-wrap gap-1">
                  {oauthStatus.models.slice(0, 12).map((m: any) => (
                    <span key={m.id} className="px-2 py-0.5 rounded text-[10px] font-mono" style={{
                      background: 'var(--button-bg)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--glass-border)',
                    }}>
                      {m.display_name || m.id}
                    </span>
                  ))}
                  {oauthStatus.models.length > 12 && (
                    <span className="px-2 py-0.5 rounded text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      +{oauthStatus.models.length - 12} mais
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleConnect}
              disabled={loading || polling}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
            >
              {polling ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Aguardando login no browser...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Login com Google
                </>
              )}
            </button>
            {error && (
              <p className="text-[10px]" style={{ color: 'rgba(239, 68, 68, 0.8)' }}>
                {error}
              </p>
            )}
            {polling && (
              <p className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
                Uma janela do browser foi aberta. Faça login e autorize o Ahri.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h3 className="settings-section-title">{title}</h3>
        <p className="settings-section-desc">{description}</p>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function KeyInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="settings-label">{label}</label>
      <div className="flex gap-2">
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
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>}
    </div>
  );
}

function SettingsToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
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
