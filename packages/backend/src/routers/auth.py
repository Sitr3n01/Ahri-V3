"""
Autenticação: login e refresh de JWT tokens.
"""
from fastapi import APIRouter, HTTPException, status
from jose import JWTError, jwt

from src.config import get_settings
from src.dependencies import SettingsDep, create_access_token, create_refresh_token
from src.models.schemas import LoginRequest, TokenResponse, RefreshRequest

router = APIRouter()


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
