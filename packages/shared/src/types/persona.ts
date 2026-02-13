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
