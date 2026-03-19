"""
Configuração centralizada via Pydantic Settings.
Substitui o ConfigManager do brain.py (linhas 66-145).
"""
import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM Keys ---
    gemini_api_key_paid: str = ""
    gemini_api_key_free: str = ""
    openrouter_api_key: str = ""
    openrouter_model_name: str = "deepseek/deepseek-r1:free"

    # --- Search ---
    cse_api_key: str = ""
    cse_cx: str = ""
    google_api_key_search: str = ""
    google_api_key_search_b: str = ""

    # --- Vision Keys ---
    google_api_key_vision_a: str = ""
    google_api_key_vision_b: str = ""

    # --- Memory Manager Key ---
    google_api_key_manager: str = ""

    # --- Spotify ---
    spotipy_client_id: str = ""
    spotipy_client_secret: str = ""
    spotipy_redirect_uri: str = "http://localhost:8888/callback"

    # --- Auth ---
    auth_password: str = "ahri"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    # --- Backend ---
    backend_port: int = 8742
    database_url: str = ""
    chroma_path: str = ""

    # --- Mobile Access ---
    gh_token: str = ""
    gist_id: str = ""

    # --- Google OAuth ---
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""

    # --- Agent Mode ---
    agent_mode_enabled: bool = True
    agent_mode_orchestrator: str = "gemini-2.5-pro-preview-06-05"  # PRO for planning
    agent_mode_default_workers: str = "gemini-2.5-flash,gemma-3-27b-it"  # Flash primary, Gemma backup
    agent_mode_use_oauth: bool = True  # Prefer OAuth credentials for agent mode
    google_ai_studio_api_key: str = ""  # For Gemma 3 workers (free tier)
    google_ai_studio_tpm_limit: int = 15000
    deepinfra_api_key: str = ""  # Fallback for Gemma 3
    ollama_base_url: str = "http://localhost:11434"  # Local self-hosted option

    @property
    def root_dir(self) -> Path:
        """Raiz do monorepo (ahri-v3/)."""
        return Path(__file__).resolve().parent.parent.parent.parent

    @property
    def data_dir(self) -> Path:
        return self.root_dir / "data"

    @property
    def personas_dir(self) -> Path:
        return self.data_dir / "personas"

    @property
    def assets_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def db_path(self) -> Path:
        if self.database_url:
            # Extrai o path do sqlite:///...
            return Path(self.database_url.replace("sqlite:///", ""))
        return self.data_dir / "db" / "ahri.db"

    @property
    def vector_db_path(self) -> Path:
        if self.chroma_path:
            return Path(self.chroma_path)
        return self.data_dir / "vector_db"

    @property
    def sqlite_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{self.db_path}"

    @property
    def gemini_primary_key(self) -> str:
        return self.gemini_api_key_paid or self.gemini_api_key_free

    @property
    def gemini_fallback_key(self) -> str:
        return self.gemini_api_key_free or self.gemini_api_key_paid

    @property
    def memory_key(self) -> str:
        return self.google_api_key_manager or self.gemini_fallback_key

    @property
    def search_keys(self) -> list[str]:
        keys = [k for k in [self.google_api_key_search, self.google_api_key_search_b] if k]
        return keys or [self.gemini_fallback_key]

    @property
    def vision_keys(self) -> list[str]:
        keys = [k for k in [self.google_api_key_vision_a, self.google_api_key_vision_b] if k]
        return keys or [self.gemini_fallback_key]


@lru_cache
def get_settings() -> Settings:
    return Settings()
