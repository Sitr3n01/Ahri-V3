"""
FastAPI dependency injection.
"""
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from src.config import Settings, get_settings
from src.core.time import utc_now
from src.models.database import AsyncSession, get_db

security = HTTPBearer(auto_error=False)

# Lazy import to avoid circular dependencies
_llm_service = None


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Valida o JWT token e retorna o payload."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authenticated")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def create_access_token(settings: Settings, data: dict = None) -> str:
    """Cria um JWT access token."""
    to_encode = {"type": "access", "sub": "ahri_user", **(data or {})}
    expire = utc_now() + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(settings: Settings, data: dict = None) -> str:
    """Cria um JWT refresh token."""
    to_encode = {"type": "refresh", "sub": "ahri_user", **(data or {})}
    expire = utc_now() + timedelta(days=settings.jwt_refresh_token_expire_days)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_llm_service():
    """Dependency injection for LLMService."""
    global _llm_service
    if _llm_service is None:
        from src.services.llm_service import LLMService
        _llm_service = LLMService()
    return _llm_service


def get_vector_service(persona_name: str = ""):
    """
    Factory for VectorService instances.
    Each persona needs its own VectorService (separate ChromaDB collection).
    If no persona_name provided, uses the currently active persona.
    Note: Not used as FastAPI Depends() - called directly by routers/services.
    """
    if not persona_name:
        from src.services.persona_service import get_active_persona
        persona_name = get_active_persona()
    from src.services.vector_service import VectorService
    return VectorService(persona_name)


# Type aliases para injeção
SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]
AuthDep = Annotated[dict, Depends(get_current_user)]
