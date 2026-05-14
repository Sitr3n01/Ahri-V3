export interface SettingsConfig {
  gemini_api_key_paid: string;
  gemini_api_key_free: string;
  openrouter_api_key: string;
  openrouter_model_name: string;
  model_capabilities_overrides: string;
  google_model_pro: string;
  google_model_flash: string;
  google_model_lite: string;
  google_model_vision?: string | null;
  google_model_search?: string | null;
  google_model_memory?: string | null;
  ollama_chat_model: string;
  ollama_vision_patterns: string;
  gemma4_enabled: boolean;
  gemma4_model_31b: string;
  gemma4_model_26b: string;
  cse_api_key: string;
  cse_cx: string;
  spotipy_client_id: string;
  spotipy_client_secret: string;
  spotipy_redirect_uri: string;
  ollama_base_url: string;
  google_api_key_vision_a: string;
  google_api_key_vision_b: string;
  google_api_key_manager: string;
  google_api_key_search: string;
  google_api_key_search_b: string;
  google_ai_studio_api_key: string;
  deepinfra_api_key: string;
  gh_token: string;
  gist_id: string;
  compaction_threshold: number;
  compaction_recent_window: number;
}

export type UpdateSettingsRequest = Partial<SettingsConfig>;
