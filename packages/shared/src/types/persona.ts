/**
 * Tipos para o sistema de personas.
 */
import type { PersonaTheme } from '../themes/index.js';

export interface PersonaSummary {
  name: string;
  display_name: string;
  archetype: string;
  universe: string;
  theme: PersonaTheme;
}

export interface PersonaDetail extends PersonaSummary {
  identity_text: string;
  spotify_genres: string[];
  has_lore: boolean;
  knowledge_count: number;
  session_count: number;
}

export interface PersonaListResponse {
  personas: PersonaSummary[];
  active: string;
}

export interface UpdatePersonaRequest {
  display_name?: string;
  archetype?: string;
  universe?: string;
  voice_language?: string;
  primary_color?: string;
  secondary_color?: string;
  identity_text?: string;
}
