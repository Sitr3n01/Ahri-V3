/**
 * Types para modelos LLM disponíveis e OAuth status.
 */

export interface AvailableModel {
  id: string;
  display_name: string;
  provider: 'google_oauth' | 'google_apikey' | 'openrouter' | 'ollama';
  color: string;
  description?: string;
  input_token_limit?: number;
  output_token_limit?: number;
}

export interface OAuthStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  models: AvailableModel[];
}
