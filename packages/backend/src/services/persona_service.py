"""
Persona Service - Gerenciamento de personas.
Portar de PersonaManager (brain.py linhas 377-575).
"""
import logging
from pathlib import Path
from typing import Optional

import yaml

from src.config import get_settings
from src.models.schemas import PersonaSummary, PersonaDetail, PersonaTheme

logger = logging.getLogger("ahri.persona")

# Estado global: persona ativa (single-user)
_active_persona: str = "ahri"


def get_active_persona() -> str:
    return _active_persona


def set_active_persona(name: str) -> str:
    global _active_persona
    _active_persona = name.lower()
    return _active_persona


def _parse_persona_file(persona_dir: Path) -> dict:
    """Parse persona.md com YAML frontmatter opcional."""
    persona_file = persona_dir / "persona.md"
    if not persona_file.exists():
        return {"name": persona_dir.name, "display_name": persona_dir.name.title(), "identity_text": ""}

    content = persona_file.read_text(encoding="utf-8")

    # Tenta extrair YAML frontmatter (---\n...\n---)
    frontmatter = {}
    identity_text = content

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                frontmatter = yaml.safe_load(parts[1]) or {}
                identity_text = parts[2].strip()
            except yaml.YAMLError:
                identity_text = content

    return {
        "name": frontmatter.get("name", persona_dir.name),
        "display_name": frontmatter.get("display_name", persona_dir.name.replace("_", " ").title()),
        "archetype": frontmatter.get("archetype", ""),
        "universe": frontmatter.get("universe", ""),
        "voice_language": frontmatter.get("voice_language", "pt-br"),
        "theme": frontmatter.get("theme", {}),
        "spotify_genres": frontmatter.get("spotify_genres", []),
        "identity_text": identity_text,
    }


def list_personas() -> list[PersonaSummary]:
    """Lista todas as personas disponíveis."""
    settings = get_settings()
    personas_dir = settings.personas_dir

    if not personas_dir.exists():
        return []

    result = []
    for p_dir in sorted(personas_dir.iterdir()):
        if not p_dir.is_dir():
            continue

        persona_file = p_dir / "persona.md"
        if not persona_file.exists():
            continue

        data = _parse_persona_file(p_dir)
        theme_data = data.get("theme", {})

        result.append(PersonaSummary(
            name=data["name"],
            display_name=data["display_name"],
            archetype=data.get("archetype", ""),
            universe=data.get("universe", ""),
            theme=PersonaTheme(
                primary=theme_data.get("primary", "#d8b4d8"),
                secondary=theme_data.get("secondary", "#e9cce9"),
                shadow=theme_data.get("shadow", "rgba(192, 132, 192, 0.25)"),
                glow=theme_data.get("glow", "rgba(216, 180, 216, 0.6)"),
                avatar=theme_data.get("avatar", ""),
                background=theme_data.get("background", ""),
                background_mobile=theme_data.get("background_mobile", ""),
            ),
        ))

    return result


def get_persona_detail(name: str) -> Optional[PersonaDetail]:
    """Detalhes completos de uma persona."""
    settings = get_settings()
    persona_dir = settings.personas_dir / name.lower().replace(" ", "_")

    if not persona_dir.exists():
        return None

    data = _parse_persona_file(persona_dir)
    theme_data = data.get("theme", {})

    # Contagens
    knowledge_dir = persona_dir / "knowledge"
    history_dir = persona_dir / "history"
    rag_docs_dir = persona_dir / "rag_docs"

    knowledge_count = len(list(knowledge_dir.glob("*.md"))) if knowledge_dir.exists() else 0
    session_count = len(list(history_dir.glob("*.json"))) if history_dir.exists() else 0
    has_lore = any(rag_docs_dir.glob("*.*")) if rag_docs_dir.exists() else False

    return PersonaDetail(
        name=data["name"],
        display_name=data["display_name"],
        archetype=data.get("archetype", ""),
        universe=data.get("universe", ""),
        identity_text=data["identity_text"],
        spotify_genres=data.get("spotify_genres", []),
        has_lore=has_lore,
        knowledge_count=knowledge_count,
        session_count=session_count,
        theme=PersonaTheme(
            primary=theme_data.get("primary", "#d8b4d8"),
            secondary=theme_data.get("secondary", "#e9cce9"),
            shadow=theme_data.get("shadow", "rgba(192, 132, 192, 0.25)"),
            glow=theme_data.get("glow", "rgba(216, 180, 216, 0.6)"),
            avatar=theme_data.get("avatar", ""),
            background=theme_data.get("background", ""),
            background_mobile=theme_data.get("background_mobile", ""),
        ),
    )


def load_persona_identity(name: str) -> str:
    """Carrega o texto de identidade (persona.md) para uso no prompt."""
    settings = get_settings()
    persona_dir = settings.personas_dir / name.lower().replace(" ", "_")
    data = _parse_persona_file(persona_dir)
    return data.get("identity_text", "Identity: Assistant.")


def load_persona_knowledge(name: str) -> str:
    """Carrega knowledge.md legado (se existir)."""
    settings = get_settings()
    knowledge_file = settings.personas_dir / name.lower().replace(" ", "_") / "knowledge.md"
    if knowledge_file.exists():
        return knowledge_file.read_text(encoding="utf-8")
    return ""
