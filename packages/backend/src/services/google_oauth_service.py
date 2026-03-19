"""
Google OAuth Service - Gerencia autenticação OAuth 2.0 com Google
para usar o plano Pro do Gemini com limites pessoais do usuário.
"""
import json
import logging
from pathlib import Path
from typing import Optional

import google.auth.transport.requests
import google.generativeai as genai
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from src.config import get_settings

logger = logging.getLogger("ahri.google_oauth")

SCOPES = [
    "https://www.googleapis.com/auth/generative-language",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

# Modelos que não são de geração (filtrar da lista)
_SKIP_MODEL_PREFIXES = ("models/embedding", "models/aqa", "models/text-embedding")


class GoogleOAuthService:
    """Serviço singleton para Google OAuth 2.0."""

    def __init__(self):
        self.settings = get_settings()
        self._token_path = self.settings.data_dir / "google_oauth_token.json"
        self._credentials: Optional[Credentials] = None
        self._cached_models: list[dict] = []
        self._user_email: Optional[str] = None

        # Tenta carregar tokens existentes
        self._load_credentials()

    @property
    def redirect_uri(self) -> str:
        return f"http://localhost:{self.settings.backend_port}/oauth/google/callback"

    @property
    def is_configured(self) -> bool:
        """Checa se OAuth client ID e secret estão configurados."""
        return bool(self.settings.google_oauth_client_id and self.settings.google_oauth_client_secret)

    @property
    def is_connected(self) -> bool:
        """Checa se tem credentials válidas."""
        if not self._credentials:
            return False
        if self._credentials.expired and self._credentials.refresh_token:
            try:
                self._refresh_credentials()
                return True
            except Exception:
                return False
        return self._credentials.valid

    def _get_client_config(self) -> dict:
        """Retorna config OAuth no formato 'installed' (Desktop Application)."""
        return {
            "installed": {
                "client_id": self.settings.google_oauth_client_id,
                "client_secret": self.settings.google_oauth_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [self.redirect_uri, "http://localhost"],
            }
        }

    def get_authorize_url(self, state: str = "ahri_oauth") -> str:
        """Gera URL de autorização do Google OAuth."""
        if not self.is_configured:
            raise ValueError("Google OAuth client_id and client_secret not configured")

        flow = Flow.from_client_config(
            self._get_client_config(),
            scopes=SCOPES,
            redirect_uri=self.redirect_uri,
        )
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return auth_url

    def exchange_code(self, code: str) -> bool:
        """Troca authorization code por access+refresh tokens."""
        try:
            flow = Flow.from_client_config(
                self._get_client_config(),
                scopes=SCOPES,
                redirect_uri=self.redirect_uri,
            )
            flow.fetch_token(code=code)
            self._credentials = flow.credentials
            self._save_credentials()
            self._fetch_user_email()
            logger.info(f"Google OAuth connected: {self._user_email}")
            return True
        except Exception as e:
            logger.error(f"OAuth code exchange failed: {e}")
            return False

    def get_credentials(self) -> Optional[Credentials]:
        """Retorna credentials válidas, com auto-refresh."""
        if not self._credentials:
            return None

        if self._credentials.expired and self._credentials.refresh_token:
            try:
                self._refresh_credentials()
            except Exception as e:
                logger.error(f"Failed to refresh credentials: {e}")
                return None

        return self._credentials if self._credentials.valid else None

    def list_models(self) -> list[dict]:
        """Lista modelos disponíveis via OAuth credentials."""
        creds = self.get_credentials()
        if not creds:
            return []

        try:
            genai.configure(credentials=creds)
            models = []
            for m in genai.list_models():
                # Filtra modelos que não são de geração
                if any(m.name.startswith(prefix) for prefix in _SKIP_MODEL_PREFIXES):
                    continue
                if "generateContent" not in (m.supported_generation_methods or []):
                    continue

                # Extrai ID limpo (remove "models/" prefix)
                model_id = m.name.replace("models/", "")
                models.append({
                    "id": model_id,
                    "display_name": m.display_name or model_id,
                    "provider": "google_oauth",
                    "description": m.description or "",
                    "input_token_limit": getattr(m, "input_token_limit", 0),
                    "output_token_limit": getattr(m, "output_token_limit", 0),
                })

            self._cached_models = models
            logger.info(f"Discovered {len(models)} models via OAuth")
            return models
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return self._cached_models

    def revoke(self) -> bool:
        """Revoga tokens e limpa arquivo."""
        try:
            if self._credentials and self._credentials.token:
                import requests
                requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": self._credentials.token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10,
                )
        except Exception as e:
            logger.warning(f"Token revocation request failed (may already be invalid): {e}")

        self._credentials = None
        self._cached_models = []
        self._user_email = None

        if self._token_path.exists():
            self._token_path.unlink()
            logger.info("OAuth token file deleted")

        return True

    def get_status(self) -> dict:
        """Retorna status atual do OAuth."""
        return {
            "configured": self.is_configured,
            "connected": self.is_connected,
            "email": self._user_email,
            "models": self._cached_models if self.is_connected else [],
        }

    def get_agent_credentials(self) -> Optional[Credentials]:
        """Retorna credentials para agent mode com auto-refresh.

        Idêntico a get_credentials() mas com logging específico para agent mode.
        """
        creds = self.get_credentials()
        if creds:
            logger.debug("Agent mode using OAuth credentials")
        else:
            logger.debug("No OAuth credentials available for agent mode")
        return creds

    def get_tpm_limit(self) -> int:
        """Retorna o TPM limit baseado no tipo de conta.

        Free tier: 15k TPM
        Pay-as-you-go: 1M+ TPM (retorna 1_000_000 como estimate)
        """
        if not self.is_connected:
            return self.settings.google_ai_studio_tpm_limit  # Default 15k

        # Se tem modelos PRO disponíveis, assume pay-as-you-go
        has_pro = any(
            "pro" in m.get("id", "").lower()
            for m in self._cached_models
        )
        return 1_000_000 if has_pro else self.settings.google_ai_studio_tpm_limit

    def get_agent_status(self) -> dict:
        """Retorna status específico para agent mode."""
        return {
            "oauth_available": self.is_connected,
            "email": self._user_email,
            "tpm_limit": self.get_tpm_limit(),
            "orchestrator_model": self.settings.agent_mode_orchestrator,
            "worker_models": self.settings.agent_mode_default_workers.split(","),
        }

    # ─── Private ────────────────────────────────────────────

    def _refresh_credentials(self):
        """Refresh do access token."""
        request = google.auth.transport.requests.Request()
        self._credentials.refresh(request)
        self._save_credentials()
        logger.debug("OAuth credentials refreshed")

    def _fetch_user_email(self):
        """Busca email do usuário autenticado."""
        if not self._credentials or not self._credentials.token:
            return
        try:
            import requests
            resp = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {self._credentials.token}"},
                timeout=10,
            )
            if resp.ok:
                self._user_email = resp.json().get("email")
        except Exception as e:
            logger.warning(f"Failed to fetch user email: {e}")

    def _save_credentials(self):
        """Salva credentials em JSON."""
        if not self._credentials:
            return
        self._token_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "token": self._credentials.token,
            "refresh_token": self._credentials.refresh_token,
            "token_uri": self._credentials.token_uri,
            "client_id": self._credentials.client_id,
            "client_secret": self._credentials.client_secret,
            "scopes": list(self._credentials.scopes or []),
            "expiry": self._credentials.expiry.isoformat() if self._credentials.expiry else None,
            "email": self._user_email,
        }
        self._token_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _load_credentials(self):
        """Carrega credentials do arquivo JSON."""
        if not self._token_path.exists():
            return
        try:
            data = json.loads(self._token_path.read_text(encoding="utf-8"))
            self._credentials = Credentials(
                token=data.get("token"),
                refresh_token=data.get("refresh_token"),
                token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=data.get("client_id"),
                client_secret=data.get("client_secret"),
                scopes=data.get("scopes"),
            )
            self._user_email = data.get("email")

            # Tenta refresh se expirado
            if self._credentials.expired and self._credentials.refresh_token:
                self._refresh_credentials()

            # Carrega modelos em cache se conectado
            if self.is_connected:
                self.list_models()
                if not self._user_email:
                    self._fetch_user_email()

            logger.info(f"Loaded OAuth credentials for {self._user_email}")
        except Exception as e:
            logger.warning(f"Failed to load OAuth credentials: {e}")
            self._credentials = None


# ─── Singleton ──────────────────────────────────────────────

_oauth_service: Optional[GoogleOAuthService] = None


def get_google_oauth_service() -> GoogleOAuthService:
    global _oauth_service
    if _oauth_service is None:
        _oauth_service = GoogleOAuthService()
    return _oauth_service


def reload_google_oauth_service():
    """Força recriação do serviço (após update de settings)."""
    global _oauth_service
    _oauth_service = None
