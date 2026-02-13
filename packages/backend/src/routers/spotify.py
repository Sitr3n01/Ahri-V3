"""
Spotify: contexto musical e auto-switch de persona.
"""
from fastapi import APIRouter

from src.dependencies import AuthDep
from src.models.schemas import SpotifyContext
from src.services.spotify_service import get_spotify_service
from src.services.persona_service import get_active_persona, set_active_persona

router = APIRouter()


@router.get("/context", response_model=SpotifyContext)
async def get_spotify_context(auth: AuthDep):
    """Retorna o contexto musical atual do Spotify."""
    svc = get_spotify_service()
    ctx = svc.get_context()

    return SpotifyContext(
        is_playing=ctx.get("is_playing", False),
        track_name=ctx.get("track_name", ""),
        artist_name=ctx.get("artist_name", ""),
        album_name=ctx.get("album_name", ""),
        genres=ctx.get("genres", []),
        suggested_persona=ctx.get("suggested_persona", ""),
    )


@router.post("/sync-persona")
async def sync_persona_by_music(auth: AuthDep):
    """Auto-switch persona baseado na música atual."""
    svc = get_spotify_service()
    ctx = svc.get_context()

    suggested = ctx.get("suggested_persona", "")
    current = get_active_persona()

    if suggested and suggested != current:
        set_active_persona(suggested)
        return {"switched": True, "persona": suggested, "reason": "Music genre match"}

    return {"switched": False, "persona": current}
