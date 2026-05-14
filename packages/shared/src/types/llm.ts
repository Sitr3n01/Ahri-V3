/**
 * Types para modelos LLM disponíveis.
 */

export interface AvailableModel {
  id: string;
  actual_model_id?: string;
  display_name: string;
  /** Provider identifier — used for grouping in the UI. */
  provider: 'google_gemini' | 'google_gemma' | 'openrouter' | 'ollama' | string;
  provider_family?: string;
  /** UI group label (same as provider). */
  group: string;
  /** True for Ollama local models. */
  is_local: boolean;
  /** Model supports image/multimodal inputs natively. */
  supports_vision: boolean;
  /** Model supports extended thinking / reasoning mode. */
  supports_thinking: boolean;
  supports_tools?: boolean;
  supports_json_mode?: boolean;
  supports_streaming?: boolean;
  color: string;
  description?: string;
  input_token_limit?: number;
  output_token_limit?: number;
  reasoning_control?: 'none' | 'effort' | 'budget_tokens' | 'thinking_budget' | 'thinking_level' | 'adaptive_effort' | 'native_trace' | 'boolean' | string;
  reasoning_levels?: string[];
  default_reasoning_level?: string;
  reasoning_budget_tokens?: Record<string, number>;
  capability_source?: 'inferred' | 'override' | string;
}

export interface GoogleModelInfo {
  name: string;
  display_name: string;
  supported_generation_methods: string[];
}

export interface GoogleModelCheckResponse {
  models: GoogleModelInfo[];
}
