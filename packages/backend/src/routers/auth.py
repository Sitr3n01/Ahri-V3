"""
Autenticação: login, refresh de JWT tokens e password reset.
"""
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from jose import JWTError, jwt

from src.config import get_settings
from src.dependencies import SettingsDep, create_access_token, create_refresh_token
from src.models.schemas import (
    LoginRequest, TokenResponse, RefreshRequest,
    ResetPasswordRequest, ForceResetRequest,
)

router = APIRouter()


# =============================================================================
# Helpers
# =============================================================================

def _update_env_password(new_password: str) -> None:
    """
    Atualiza AUTH_PASSWORD no .env (cria a entrada se não existir).
    Depois limpa o cache do get_settings() para forçar re-leitura.
    """
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"

    if env_path.exists():
        content = env_path.read_text(encoding="utf-8")
        # Substitui a linha AUTH_PASSWORD=... se existir
        if re.search(r"^AUTH_PASSWORD=.*$", content, re.MULTILINE):
            content = re.sub(
                r"^AUTH_PASSWORD=.*$",
                f"AUTH_PASSWORD={new_password}",
                content,
                flags=re.MULTILINE,
            )
        else:
            content = content.rstrip() + f"\nAUTH_PASSWORD={new_password}\n"
    else:
        content = f"AUTH_PASSWORD={new_password}\n"

    env_path.write_text(content, encoding="utf-8")

    # Invalida o cache do lru_cache para que get_settings() re-leia o .env
    get_settings.cache_clear()


def _is_localhost(request: Request) -> bool:
    """Verifica se a requisição veio de localhost."""
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1", "localhost")


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, settings: SettingsDep):
    """Autentica com senha e retorna JWT tokens."""
    if request.password != settings.auth_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    return TokenResponse(
        access_token=create_access_token(settings),
        refresh_token=create_refresh_token(settings),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshRequest, settings: SettingsDep):
    """Renova o access token usando o refresh token."""
    try:
        payload = jwt.decode(request.refresh_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    return TokenResponse(
        access_token=create_access_token(settings),
        refresh_token=create_refresh_token(settings),
    )


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(request: ResetPasswordRequest, settings: SettingsDep):
    """
    Troca a senha informando a senha atual.
    Retorna novos tokens após a troca.
    """
    if request.current_password != settings.auth_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    _update_env_password(request.new_password)

    # Re-lê settings com a nova senha para gerar tokens válidos
    new_settings = get_settings()
    return TokenResponse(
        access_token=create_access_token(new_settings),
        refresh_token=create_refresh_token(new_settings),
    )


@router.post("/force-reset")
async def force_reset_password(
    body: ForceResetRequest,
    request: Request,
    settings: SettingsDep,
):
    """
    Reset de senha SEM precisar saber a senha atual.
    Restrito a requisições vindas de localhost (segurança física).
    """
    if not _is_localhost(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Force reset is only available from localhost",
        )

    _update_env_password(body.new_password)

    return {"status": "ok", "message": "Password updated. Please login with the new password."}
