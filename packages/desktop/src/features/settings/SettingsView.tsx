import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { usePersonaStore } from '@/stores/persona-store';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { useI18nStore, useT } from '@/stores/i18n-store';
import { api } from '@/api/client';
import { usePersonaTheme } from '@/hooks/usePersonaTheme';
import { MemoryTab } from './MemoryTab';
import { InstrucoesTab } from './InstrucoesTab';
import { DEFAULT_API_KEYS, DEFAULT_CHAT, DEFAULT_PROFILE } from './settingsDefaults';
import { loadFromStorage, saveToStorage } from './settingsStorage';
import type { ApiKeysConfig, ChatConfig, EditablePersona, ProfileFlattened, SettingsTab } from './settingsTypes';
import { personaDisplayTheme } from './personaDisplay';
import { ApiKeysTab, ChatTab } from './SettingsApiChatTabs';
import { ProfileTab } from './SettingsProfileTab';
import { PersonasTab } from './SettingsPersonasTab';

// ── Main Component ────────────────────────────────────────────
export function SettingsView({ onClose }: { onClose?: () => void }) {
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
  const [userProfile, setUserProfile] = useState<ProfileFlattened>(() => loadFromStorage('profile', DEFAULT_PROFILE));
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Persona editor state
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<EditablePersona | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Auto-save prev state tracking
  const lastApiKeys = useRef<ApiKeysConfig>(apiKeys);
  const lastChatConfig = useRef<ChatConfig>(chatConfig);
  const lastUserProfile = useRef<ProfileFlattened>(userProfile);
  const isInitialLoad = useRef(true);

  const showFeedback = useCallback((msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 2500);
  }, []);

  // Load settings from API on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [settings, profile] = await Promise.all([
          api.getSettings(),
          api.getProfile()
        ]);

        // Helper: pick first defined (non-null/undefined) value.
        // Unlike ||, this preserves empty strings "" as valid values.
        const pick = (...values: any[]) => {
          for (const v of values) {
            if (v !== undefined && v !== null) return v;
          }
          return '';
        };

        // Map API settings to ApiKeysConfig
        // Backend values (from .env) take priority over localStorage
        const mergedApiKeys: ApiKeysConfig = {
          gemini_api_key_paid: pick(settings.gemini_api_key_paid, ''),
          gemini_api_key_free: pick(settings.gemini_api_key_free, ''),
          openrouter_api_key: pick(settings.openrouter_api_key, ''),
          openrouter_model_name: pick(settings.openrouter_model_name, DEFAULT_API_KEYS.openrouter_model_name),
          model_capabilities_overrides: pick(settings.model_capabilities_overrides, DEFAULT_API_KEYS.model_capabilities_overrides),
          google_model_flash: pick(settings.google_model_flash, DEFAULT_API_KEYS.google_model_flash),
          google_model_lite: pick(settings.google_model_lite, DEFAULT_API_KEYS.google_model_lite),
          google_model_vision: pick(settings.google_model_vision, DEFAULT_API_KEYS.google_model_vision),
          google_model_search: pick(settings.google_model_search, DEFAULT_API_KEYS.google_model_search),
          google_model_memory: pick(settings.google_model_memory, DEFAULT_API_KEYS.google_model_memory),
          ollama_chat_model: pick(settings.ollama_chat_model, DEFAULT_API_KEYS.ollama_chat_model),
          ollama_vision_patterns: pick((settings as any).ollama_vision_patterns, DEFAULT_API_KEYS.ollama_vision_patterns),
          gemma4_enabled: (settings as any).gemma4_enabled ?? DEFAULT_API_KEYS.gemma4_enabled,
          gemma4_model_31b: pick((settings as any).gemma4_model_31b, DEFAULT_API_KEYS.gemma4_model_31b),
          gemma4_model_26b: pick((settings as any).gemma4_model_26b, DEFAULT_API_KEYS.gemma4_model_26b),
          google_api_key_search: pick(settings.google_api_key_search, ''),
          google_api_key_search_b: pick(settings.google_api_key_search_b, ''),
          cse_api_key: pick(settings.cse_api_key, ''),
          cse_cx: pick(settings.cse_cx, ''),
          google_api_key_vision_a: pick(settings.google_api_key_vision_a, ''),
          google_api_key_vision_b: pick(settings.google_api_key_vision_b, ''),
          google_api_key_manager: pick(settings.google_api_key_manager, ''),
          spotipy_client_id: pick(settings.spotipy_client_id, ''),
          spotipy_client_secret: pick(settings.spotipy_client_secret, ''),
          spotipy_redirect_uri: pick(settings.spotipy_redirect_uri, DEFAULT_API_KEYS.spotipy_redirect_uri),
          google_ai_studio_api_key: pick(settings.google_ai_studio_api_key, ''),
          deepinfra_api_key: pick(settings.deepinfra_api_key, ''),
          gh_token: pick(settings.gh_token, ''),
          gist_id: pick(settings.gist_id, ''),
        };
        setApiKeys(mergedApiKeys);

        // Also save to localStorage as cache
        saveToStorage('api_keys', mergedApiKeys);
        lastApiKeys.current = mergedApiKeys;

        // Map Profile preferences to ChatConfig + compaction from settings
        const prefs = profile.preferences || {};
        const chatPrefs = (prefs.chat || {}) as Record<string, any>;
        const mergedChat: ChatConfig = {
          default_engine: chatPrefs.default_engine ?? DEFAULT_CHAT.default_engine,
          streaming_enabled: chatPrefs.streaming_enabled ?? DEFAULT_CHAT.streaming_enabled,
          max_history_messages: chatPrefs.max_history_messages ?? DEFAULT_CHAT.max_history_messages,
          auto_save_tags: chatPrefs.auto_save_tags ?? DEFAULT_CHAT.auto_save_tags,
          show_timestamps: chatPrefs.show_timestamps ?? DEFAULT_CHAT.show_timestamps,
          compaction_threshold: settings.compaction_threshold ?? DEFAULT_CHAT.compaction_threshold,
          compaction_recent_window: settings.compaction_recent_window ?? DEFAULT_CHAT.compaction_recent_window,
          reasoning_level: chatPrefs.reasoning_level ?? DEFAULT_CHAT.reasoning_level,
          internet_search_enabled: chatPrefs.internet_search_enabled ?? DEFAULT_CHAT.internet_search_enabled,
        };
        setChatConfig(mergedChat);
        saveToStorage('chat', mergedChat);
        lastChatConfig.current = mergedChat;

        // Map Profile
        const mergedProfile: ProfileFlattened = {
          name: pick(profile.name, DEFAULT_PROFILE.name),
          archetype: pick(profile.archetype, DEFAULT_PROFILE.archetype),
          learning_style: pick(profile.learning_style, DEFAULT_PROFILE.learning_style),
          bio: (profile.attributes?.bio as string) ?? DEFAULT_PROFILE.bio,
          personality: (profile.attributes?.personality as string[]) ?? DEFAULT_PROFILE.personality,
          occupation: (profile.attributes?.occupation as string) ?? DEFAULT_PROFILE.occupation,
          interests: (profile.attributes?.interests as string[]) ?? DEFAULT_PROFILE.interests,
          tech_stack: (profile.attributes?.tech_stack as string[]) ?? DEFAULT_PROFILE.tech_stack,
          music: (profile.attributes?.music as string[]) ?? DEFAULT_PROFILE.music,
          dislikes: (profile.attributes?.dislikes as string[]) ?? DEFAULT_PROFILE.dislikes,
          foods: (profile.preferences?.foods as string[]) ?? DEFAULT_PROFILE.foods,
          languages: (profile.attributes?.languages as Record<string, string>) ?? DEFAULT_PROFILE.languages,
        };
        setUserProfile(mergedProfile);
        saveToStorage('profile', mergedProfile);
        lastUserProfile.current = mergedProfile;

      } catch (e) {
        console.error('Failed to load settings from API, using localStorage cache:', e);
        // On API failure, keep the localStorage-loaded defaults (already set in useState)
        showFeedback('Failed to load settings');
      }
    };
    loadSettings().then(() => {
      // Delay disabling initial load flag to avoid triggering auto-saves on mount variations
      setTimeout(() => { isInitialLoad.current = false; }, 1000);
    });
  }, [showFeedback]);

  const currentPersona = personas.find((p) => p.name === (selectedPersona || activePersona));
  const currentTheme = personaDisplayTheme(currentPersona);

  // Initialize persona editable data
  useEffect(() => {
    if (activeTab === 'personas' && currentPersona) {
      const displayTheme = personaDisplayTheme(currentPersona);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.archetype,
        primaryColor: displayTheme.primary,
        secondaryColor: displayTheme.secondary,
      });
      setHasChanges(false);
    }
  }, [currentPersona, activeTab]);

  const handleSaveApiKeys = useCallback(async (): Promise<boolean> => {
    saveToStorage('api_keys', apiKeys);
    try {
      await api.updateSettings(apiKeys);
      return true;
    } catch (e) {
      console.error('Failed to save API keys:', e);
      showFeedback('Error saving API keys');
      return false;
    }
  }, [apiKeys, showFeedback]);

  const handleSaveChatConfig = useCallback(async (): Promise<boolean> => {
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
      // Save compaction settings to .env via settings API
      await api.updateSettings({
        compaction_threshold: chatConfig.compaction_threshold,
        compaction_recent_window: chatConfig.compaction_recent_window,
      });
      return true;
    } catch (e) {
      console.error('Failed to save chat config:', e);
      showFeedback('Error saving chat config');
      return false;
    }
  }, [chatConfig, showFeedback]);

  const handleSaveProfile = useCallback(async (): Promise<boolean> => {
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
          bio: userProfile.bio,
          personality: userProfile.personality,
          occupation: userProfile.occupation,
          interests: userProfile.interests,
          tech_stack: userProfile.tech_stack,
          music: userProfile.music,
          dislikes: userProfile.dislikes,
          languages: userProfile.languages,
        },
        preferences: {
          ...current.preferences,
          foods: userProfile.foods,
        },
      });
      return true;
    } catch (e) {
      console.error('Failed to save profile:', e);
      showFeedback('Error saving profile');
      return false;
    }
  }, [showFeedback, userProfile]);

  // ── Auto-save Hooks ──────────────────────────────────────────
  useEffect(() => {
    const currentStr = JSON.stringify(apiKeys);
    if (currentStr !== JSON.stringify(lastApiKeys.current)) {
      // Immediate local persistence
      saveToStorage('api_keys', apiKeys);
      // Debounced server sync
      const t = setTimeout(async () => {
        if (isInitialLoad.current) return;
        const ok = await handleSaveApiKeys();
        if (ok) lastApiKeys.current = apiKeys;
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [apiKeys, handleSaveApiKeys]);

  useEffect(() => {
    const currentStr = JSON.stringify(chatConfig);
    if (currentStr !== JSON.stringify(lastChatConfig.current)) {
      // Safely register settings instantly guaranteeing they are never lost
      saveToStorage('chat', chatConfig);
      useChatStore.getState().loadChatSettings();
      // Debounce the complex server syncing
      const t = setTimeout(async () => {
        if (isInitialLoad.current) return;
        const ok = await handleSaveChatConfig();
        if (ok) lastChatConfig.current = chatConfig;
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [chatConfig, handleSaveChatConfig]);

  useEffect(() => {
    const currentStr = JSON.stringify(userProfile);
    if (currentStr !== JSON.stringify(lastUserProfile.current)) {
      // Immediate local persistence
      saveToStorage('profile', userProfile);
      // Debounced server sync
      const t = setTimeout(async () => {
        if (isInitialLoad.current) return;
        const ok = await handleSaveProfile();
        if (ok) lastUserProfile.current = userProfile;
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [userProfile, handleSaveProfile]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handlePersonaFieldChange = (field: keyof EditablePersona, value: string | File) => {
    if (!editedData) return;
    setEditedData({ ...editedData, [field]: value });
    setHasChanges(true);
  };

  const handlePersonaSave = async () => {
    if (!currentPersona || !editedData) return;
    try {
      const updateData: any = {
        display_name: editedData.displayName,
        archetype: editedData.description,
        primary_color: editedData.primaryColor,
        secondary_color: editedData.secondaryColor,
      };

      if (editedData.avatarFile) {
        updateData.avatar_base64 = await fileToBase64(editedData.avatarFile);
      }
      if (editedData.backgroundFile) {
        updateData.background_base64 = await fileToBase64(editedData.backgroundFile);
      }

      await api.updatePersona(currentPersona.name, updateData);
      showFeedback(locale === 'pt' ? 'Persona salva' : 'Persona saved');
      setHasChanges(false);
      await fetchPersonas();
      // Rebuild editedData from fresh store so colors reflect what was just saved
      const freshPersona = usePersonaStore.getState().personas.find(p => p.name === currentPersona.name);
      if (freshPersona) {
        const freshTheme = personaDisplayTheme(freshPersona);
        setEditedData(prev => prev ? {
          ...prev,
          primaryColor: freshTheme.primary,
          secondaryColor: freshTheme.secondary,
          avatarFile: undefined,
          backgroundFile: undefined,
        } : prev);
      }
    } catch (e) {
      console.error('Failed to save persona:', e);
      showFeedback('Error saving persona');
    }
  };

  const handlePersonaCancel = () => {
    if (currentPersona) {
      const displayTheme = personaDisplayTheme(currentPersona);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.archetype,
        primaryColor: displayTheme.primary,
        secondaryColor: displayTheme.secondary,
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
      id: 'instrucoes',
      label: locale === 'pt' ? 'Instruções' : 'Instructions',
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
      id: 'memory',
      label: locale === 'pt' ? 'Memória' : 'Memory',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
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
    <div className="flex h-full w-full bg-[var(--surface-solid)] text-[var(--text-primary)] relative" style={{ background: 'var(--surface-solid)' }}>
      {onClose && (
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-50 shadow-sm border bg-[var(--sidebar-bg)]" style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }} title={t('common.close' as any)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r relative z-10 shadow-sm" style={{ borderColor: 'var(--glass-border)', background: 'var(--sidebar-bg)' }}>
        {/* Sidebar Header */}
        <div className="p-6 pb-2">
          <h1
            className="text-2xl font-bold tracking-tight mb-1"
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

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'active' : ''}`}
              style={activeTab === tab.id 
                ? { background: 'var(--persona-primary)', color: '#fff', boxShadow: '0 4px 12px color-mix(in srgb, var(--persona-shadow) 30%, transparent)' } 
                : { color: 'var(--text-secondary)' }
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Utilities Footer */}
        <div className="p-4 border-t flex flex-col gap-4" style={{ borderColor: 'var(--glass-border)', background: 'var(--sidebar-bg)' }}>
          {savedFeedback && (
            <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium px-2 animate-fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              {savedFeedback}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center p-0.5 rounded-lg border" style={{ borderColor: 'var(--glass-border)', background: 'rgba(128, 128, 128, 0.05)' }}>
              <button 
                onClick={() => setLocale('pt')} 
                className="px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all" 
                style={locale === 'pt' ? { background: 'var(--persona-primary)', color: '#fff' } : { color: 'var(--text-tertiary)' }}
              >
                PT
              </button>
              <button 
                onClick={() => setLocale('en')} 
                className="px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all" 
                style={locale === 'en' ? { background: 'var(--persona-primary)', color: '#fff' } : { color: 'var(--text-tertiary)' }}
              >
                EN
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }} title={appTheme === 'dark' ? t('common.theme_light') : t('common.theme_dark')}>
                {appTheme === 'dark' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                )}
              </button>
              
              <button onClick={logout} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors" title={t('nav.logout')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        <div key={activeTab} className="flex-1 overflow-y-auto w-full animate-fade-in p-6 lg:p-12" style={{ animationDuration: '0.35s' }}>
          <div className="max-w-6xl w-full mx-auto pb-24">
            {activeTab === 'api-keys' && <ApiKeysTab config={apiKeys} onChange={setApiKeys} />}
            {activeTab === 'chat' && <ChatTab config={chatConfig} onChange={setChatConfig} />}
            {activeTab === 'instrucoes' && <InstrucoesTab />}
            {activeTab === 'memory' && <MemoryTab />}
            {activeTab === 'personas' && (
              <PersonasTab
                personas={personas}
                selectedPersona={selectedPersona}
                activePersona={activePersona}
                editedData={editedData}
                hasChanges={hasChanges}
                onSelectPersona={(name: string) => {
                  if (hasChanges && !confirm(t('persona.unsaved_confirm'))) return;
                  setSelectedPersona(name);
                  // Sync app theme immediately
                  const personaStore = usePersonaStore.getState();
                  personaStore.activatePersona(name);
                }}
                onFieldChange={handlePersonaFieldChange}
                onSave={handlePersonaSave}
                onCancel={handlePersonaCancel}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
