export type SettingsTab = 'api-keys' | 'chat' | 'instrucoes' | 'memory' | 'personas';

export interface ApiKeysConfig {
  gemini_api_key_paid: string;
  gemini_api_key_free: string;
  openrouter_api_key: string;
  openrouter_model_name: string;
  model_capabilities_overrides: string;
  google_model_flash: string;
  google_model_lite: string;
  google_model_vision: string;
  google_model_search: string;
  google_model_memory: string;
  ollama_base_url?: string;
  ollama_chat_model: string;
  ollama_vision_patterns: string;
  gemma4_enabled: boolean;
  gemma4_model_31b: string;
  gemma4_model_26b: string;
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

export interface ChatConfig {
  default_engine: 'LITE' | 'DEEPSEEK' | 'LOCAL';
  streaming_enabled: boolean;
  max_history_messages: number;
  auto_save_tags: boolean;
  show_timestamps: boolean;
  compaction_threshold: number;
  compaction_recent_window: number;
  reasoning_level: string;
  internet_search_enabled?: boolean;
}

export interface ProfileFlattened {
  name: string;
  archetype: string;
  learning_style: string;
  bio: string;
  personality: string[];
  occupation: string;
  interests: string[];
  tech_stack: string[];
  music: string[];
  dislikes: string[];
  foods: string[];
  languages: Record<string, string>;
}

export interface EditablePersona {
  displayName: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  avatarFile?: File;
  backgroundFile?: File;
}
