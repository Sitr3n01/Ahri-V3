/**
 * Tipos para o sistema de memória.
 */

export interface UserProfile {
  name: string;
  archetype: string;
  learning_style: string;
  attributes: {
    languages?: Record<string, string>;
    tech_stack?: string[];
    interests?: string[];
    [key: string]: unknown;
  };
  preferences: {
    foods?: string[];
    music?: string[];
    dislikes?: string[];
    [key: string]: unknown;
  };
  knowledge_tracker: {
    vocabulary_recent?: string[];
    concepts_mastered?: string[];
    [key: string]: unknown;
  };
  active_quests: Record<string, LearningQuest>;
  session_log: string[];
}

export interface LearningQuest {
  status: 'In Progress' | 'Completed' | 'Paused';
  current_stage: string;
  progress: Record<string, string>;
}

export interface SpotifyContext {
  is_playing: boolean;
  track_name: string;
  artist_name: string;
  album_name: string;
  genres: string[];
  suggested_persona: string;
}

export interface SyncState {
  active_persona: string;
  active_session_id: number | null;
  user_profile: UserProfile;
  recent_messages: import('./chat.js').ChatMessage[];
  spotify_context: SpotifyContext | null;
}
