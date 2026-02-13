"""
Memory Service - Gerenciamento de perfil do usuario e memorias.
Portar de MemoryHandler (brain.py linhas 152-372).
"""
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.database import UserProfile, PersonaMemory, SocialGraphEntry, EpisodicMemory

logger = logging.getLogger("ahri.memory")


class MemoryService:
    """Servico de memoria - substitui MemoryHandler com SQLite."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # User Profile
    # =========================================================================

    async def get_profile(self) -> dict:
        """Carrega o perfil do usuario. Cria default se nao existir."""
        result = await self.db.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = UserProfile(
                id=1,
                name="User",
                archetype="Explorer",
                learning_style="",
                attributes={},
                preferences={},
                knowledge_tracker={"vocabulary_recent": [], "concepts_mastered": []},
                active_quests={},
                session_log=[],
            )
            self.db.add(profile)
            await self.db.commit()
            await self.db.refresh(profile)

        return {
            "user_profile": {"name": profile.name, "archetype": profile.archetype, "learning_style": profile.learning_style},
            "attributes": profile.attributes or {},
            "preferences": profile.preferences or {},
            "knowledge_tracker": profile.knowledge_tracker or {},
            "active_quests": profile.active_quests or {},
            "session_log": profile.session_log or [],
        }

    async def save_profile(self, data: dict) -> bool:
        """Salva o perfil do usuario."""
        result = await self.db.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = UserProfile(id=1)
            self.db.add(profile)

        up = data.get("user_profile", {})
        if isinstance(up, dict):
            profile.name = up.get("name", profile.name)
            profile.archetype = up.get("archetype", profile.archetype)
            profile.learning_style = up.get("learning_style", profile.learning_style)

        if "attributes" in data:
            profile.attributes = data["attributes"]
        if "preferences" in data:
            profile.preferences = data["preferences"]
        if "knowledge_tracker" in data:
            profile.knowledge_tracker = data["knowledge_tracker"]
        if "active_quests" in data:
            profile.active_quests = data["active_quests"]
        if "session_log" in data:
            profile.session_log = data["session_log"]

        await self.db.commit()
        return True

    async def update_attribute(self, key: str, value: str) -> None:
        """Atualiza um atributo especifico do perfil."""
        result = await self.db.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()
        if profile:
            attrs = profile.attributes or {}
            attrs[key] = value
            profile.attributes = attrs
            await self.db.commit()

    async def add_fact(self, fact: str) -> None:
        """Adiciona um fato ao knowledge_tracker."""
        from datetime import date

        result = await self.db.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()
        if profile:
            tracker = profile.knowledge_tracker or {}
            recent = tracker.get("vocabulary_recent", [])
            entry = f"[{date.today().strftime('%d/%m')}] {fact}"
            recent.append(entry)
            if len(recent) > 20:
                recent.pop(0)
            tracker["vocabulary_recent"] = recent
            profile.knowledge_tracker = tracker
            await self.db.commit()

    async def add_session_log(self, summary: str) -> None:
        """Adiciona entrada ao session_log."""
        from datetime import date

        result = await self.db.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()
        if profile:
            logs = profile.session_log or []
            logs.append(f"[{date.today()}] {summary}")
            profile.session_log = logs
            await self.db.commit()

    # =========================================================================
    # Social Graph
    # =========================================================================

    async def get_social_graph(self) -> dict:
        """Carrega o social graph completo."""
        result = await self.db.execute(select(SocialGraphEntry))
        entries = result.scalars().all()
        return {entry.platform: entry.data for entry in entries}

    async def update_social_graph(self, platform: str, data: dict) -> None:
        """Atualiza dados de uma plataforma no social graph."""
        result = await self.db.execute(
            select(SocialGraphEntry).where(SocialGraphEntry.platform == platform)
        )
        entry = result.scalar_one_or_none()

        if entry:
            entry.data = data
        else:
            self.db.add(SocialGraphEntry(platform=platform, data=data))

        await self.db.commit()

    # =========================================================================
    # Persona Memory
    # =========================================================================

    async def get_persona_memory(self, persona_name: str) -> dict:
        """Carrega memoria especifica de uma persona."""
        result = await self.db.execute(
            select(PersonaMemory).where(PersonaMemory.persona_name == persona_name.lower())
        )
        memory = result.scalar_one_or_none()

        if memory is None:
            return {
                "active_quests": {},
                "session_log": [],
                "session_log_detailed": [],
                "last_session_buffer": [],
            }

        return {
            "active_quests": memory.active_quests or {},
            "session_log": memory.session_log or [],
            "session_log_detailed": memory.session_log_detailed or [],
            "last_session_buffer": memory.last_session_buffer or [],
        }

    async def save_persona_memory(self, persona_name: str, data: dict) -> None:
        """Salva memoria de persona."""
        name = persona_name.lower()
        result = await self.db.execute(
            select(PersonaMemory).where(PersonaMemory.persona_name == name)
        )
        memory = result.scalar_one_or_none()

        if memory is None:
            memory = PersonaMemory(persona_name=name)
            self.db.add(memory)

        memory.active_quests = data.get("active_quests", memory.active_quests)
        memory.session_log = data.get("session_log", memory.session_log)
        memory.session_log_detailed = data.get("session_log_detailed", memory.session_log_detailed)
        memory.last_session_buffer = data.get("last_session_buffer", memory.last_session_buffer)

        await self.db.commit()

    # =========================================================================
    # Episodic Memory (NOVO)
    # =========================================================================

    async def save_episode(
        self,
        persona_name: str,
        topics: list[str],
        emotional_tone: str,
        summary: str,
        importance: int = 5,
        outcomes: Optional[list[str]] = None,
    ) -> None:
        """Salva uma memoria episodica."""
        episode = EpisodicMemory(
            persona_name=persona_name.lower(),
            topics=topics,
            emotional_tone=emotional_tone,
            summary=summary,
            importance=importance,
            outcomes=outcomes or [],
        )
        self.db.add(episode)
        await self.db.commit()

    async def get_recent_episodes(self, persona_name: str, limit: int = 5) -> list[dict]:
        """Retorna episodios recentes de uma persona."""
        result = await self.db.execute(
            select(EpisodicMemory)
            .where(EpisodicMemory.persona_name == persona_name.lower())
            .order_by(EpisodicMemory.date.desc())
            .limit(limit)
        )
        episodes = result.scalars().all()
        return [
            {
                "date": str(ep.date),
                "topics": ep.topics,
                "emotional_tone": ep.emotional_tone,
                "summary": ep.summary,
                "importance": ep.importance,
                "outcomes": ep.outcomes,
            }
            for ep in episodes
        ]
