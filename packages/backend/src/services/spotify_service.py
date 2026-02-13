"""
Spotify Service - Integracao com Spotify para contexto musical.
Portar de SpotifyClient (services/spotify_client.py).
"""
import logging
from typing import Optional

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from src.config import get_settings

logger = logging.getLogger("ahri.spotify")


class SpotifyService:
    """Servico de integracao Spotify."""

    def __init__(self):
        self.settings = get_settings()
        self.sp: Optional[spotipy.Spotify] = None
        self.enabled = bool(self.settings.spotipy_client_id and self.settings.spotipy_client_secret)

    def authenticate(self) -> bool:
        """Autentica via OAuth. Abre browser na primeira vez."""
        if not self.enabled:
            return False

        try:
            auth_manager = SpotifyOAuth(
                client_id=self.settings.spotipy_client_id,
                client_secret=self.settings.spotipy_client_secret,
                redirect_uri=self.settings.spotipy_redirect_uri,
                scope="user-top-read user-read-currently-playing user-read-recently-played",
                cache_path=".spotify_cache",
            )
            self.sp = spotipy.Spotify(auth_manager=auth_manager)
            return True
        except Exception as e:
            logger.error(f"Spotify auth error: {e}")
            return False

    def get_context(self) -> dict:
        """Retorna contexto musical atual."""
        if not self.sp and not self.authenticate():
            return {
                "is_playing": False,
                "track_name": "",
                "artist_name": "",
                "album_name": "",
                "genres": [],
                "suggested_persona": "",
            }

        result = {
            "is_playing": False,
            "track_name": "",
            "artist_name": "",
            "album_name": "",
            "genres": [],
            "suggested_persona": "",
        }

        try:
            # Tocando agora
            current = self.sp.current_user_playing_track()
            if current and current.get("is_playing"):
                item = current.get("item", {})
                result["is_playing"] = True
                result["track_name"] = item.get("name", "")
                result["album_name"] = item.get("album", {}).get("name", "")

                artists = item.get("artists", [])
                if artists:
                    result["artist_name"] = artists[0].get("name", "")

                    # Busca generos do artista
                    try:
                        artist_id = artists[0].get("id")
                        if artist_id:
                            artist_data = self.sp.artist(artist_id)
                            result["genres"] = artist_data.get("genres", [])
                    except Exception:
                        pass

            # Sugere persona baseado nos generos
            result["suggested_persona"] = self._suggest_persona(result["genres"])

        except Exception as e:
            logger.error(f"Spotify context error: {e}")

        return result

    def get_listening_context_text(self) -> str:
        """Retorna contexto formatado como texto (para injecao no prompt)."""
        if not self.sp and not self.authenticate():
            return ""

        try:
            # Top tracks
            results = self.sp.current_user_top_tracks(limit=10, time_range="short_term")
            if not results.get("items"):
                return ""

            tracks = []
            for idx, item in enumerate(results["items"]):
                name = item["name"]
                artist = item["artists"][0]["name"]
                tracks.append(f"{idx + 1}. {name} - {artist}")

            # Currently playing
            current_str = ""
            current = self.sp.current_user_playing_track()
            if current and current.get("is_playing"):
                c_name = current["item"]["name"]
                c_artist = current["item"]["artists"][0]["name"]
                current_str = f"\n[TOCANDO AGORA]: {c_name} - {c_artist}\n"

            return f"{current_str}\n[MUSICAS MAIS OUVIDAS (Ultimas Semanas)]:\n" + "\n".join(tracks)

        except Exception as e:
            logger.error(f"Spotify listening context error: {e}")
            return ""

    def _suggest_persona(self, genres: list[str]) -> str:
        """Sugere persona baseado nos generos musicais."""
        if not genres:
            return ""

        genre_str = " ".join(genres).lower()

        # Mapeamento de generos para personas (do auto_persona_daemon.py)
        GENRE_MAP = {
            "metal": "kafka", "rock": "kafka", "phonk": "kafka", "industrial": "kafka",
            "k-pop": "sparkle", "hyperpop": "sparkle", "electropop": "sparkle",
            "classical": "shorekeeper", "piano": "shorekeeper", "ambient": "shorekeeper",
            "acoustic": "robin", "folk": "robin", "indie folk": "robin",
            "lo-fi": "ahri", "r&b": "ahri", "soul": "ahri",
            "edm": "furina", "electronic": "furina", "dance": "furina",
            "jazz": "frieren", "bossa": "frieren",
            "pop": "march 7th",
        }

        for keyword, persona in GENRE_MAP.items():
            if keyword in genre_str:
                return persona

        return "ahri"


# Singleton
_spotify_service: Optional[SpotifyService] = None


def get_spotify_service() -> SpotifyService:
    global _spotify_service
    if _spotify_service is None:
        _spotify_service = SpotifyService()
    return _spotify_service
