"""
Data Migration Script: JSON files (Ahri V2) -> SQLite (Ahri V3).
Idempotente: pode ser executado multiplas vezes sem duplicar dados.

Usage:
    python -m src.scripts.migrate_data --v2-path "C:/Users/zegil/Documents/GitHub/Ahri V2/Ahri"
"""
import asyncio
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime

from sqlalchemy import select

# Setup antes dos imports do projeto
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("migrate")


async def migrate(v2_path: str, db_url: str):
    """Executa a migracao completa."""
    from src.models.database import (
        init_db, get_db, close_db,
        UserProfile, SocialGraphEntry, PersonaMemory, ChatSession, ChatMessage,
        RagIngestionTracker,
    )

    v2 = Path(v2_path)
    data_dir = v2 / "data"

    if not data_dir.exists():
        logger.error(f"V2 data directory not found: {data_dir}")
        return

    logger.info(f"Migrating from: {data_dir}")
    logger.info(f"Database: {db_url}")

    await init_db(db_url)

    # Obtem sessao
    async for db in get_db():
        # =====================================================================
        # 1. User Profile
        # =====================================================================
        profile_file = data_dir / "global" / "user_profile.json"
        if profile_file.exists():
            logger.info("Migrating user profile...")
            profile_data = json.loads(profile_file.read_text(encoding="utf-8"))

            result = await db.execute(select(UserProfile).where(UserProfile.id == 1))
            existing = result.scalar_one_or_none()

            if existing is None:
                up = profile_data.get("user_profile", {})
                profile = UserProfile(
                    id=1,
                    name=up.get("name", "User"),
                    archetype=up.get("archetype", "Explorer"),
                    learning_style=up.get("learning_style", ""),
                    attributes=profile_data.get("attributes", {}),
                    preferences=profile_data.get("preferences", {}),
                    knowledge_tracker=profile_data.get("knowledge_tracker", {}),
                    active_quests=profile_data.get("active_quests", {}),
                    session_log=profile_data.get("session_log", []),
                )
                db.add(profile)
                await db.commit()
                logger.info("  -> User profile migrated.")
            else:
                logger.info("  -> User profile already exists, skipping.")

        # =====================================================================
        # 2. Social Graph
        # =====================================================================
        social_file = data_dir / "global" / "social_graph.json"
        if social_file.exists():
            logger.info("Migrating social graph...")
            social_data = json.loads(social_file.read_text(encoding="utf-8"))

            for platform_name, platform_data in social_data.items():
                result = await db.execute(
                    select(SocialGraphEntry).where(SocialGraphEntry.platform == platform_name)
                )
                if result.scalar_one_or_none() is None:
                    db.add(SocialGraphEntry(platform=platform_name, data=platform_data))

            await db.commit()
            logger.info(f"  -> Social graph migrated ({len(social_data)} platforms).")

        # =====================================================================
        # 3. Personas
        # =====================================================================
        personas_dir = data_dir / "personas"
        if personas_dir.exists():
            for persona_dir in sorted(personas_dir.iterdir()):
                if not persona_dir.is_dir():
                    continue

                persona_name = persona_dir.name
                logger.info(f"Migrating persona: {persona_name}")

                # 3a. Persona Memory (memory.json)
                memory_file = persona_dir / "memory.json"
                if memory_file.exists():
                    result = await db.execute(
                        select(PersonaMemory).where(PersonaMemory.persona_name == persona_name)
                    )
                    if result.scalar_one_or_none() is None:
                        mem_data = json.loads(memory_file.read_text(encoding="utf-8"))
                        db.add(PersonaMemory(
                            persona_name=persona_name,
                            active_quests=mem_data.get("active_quests", {}),
                            session_log=mem_data.get("session_log", []),
                            session_log_detailed=mem_data.get("session_log_detailed", []),
                            last_session_buffer=mem_data.get("last_session_buffer", []),
                        ))
                        logger.info(f"  -> Memory migrated.")

                # 3b. Chat History (history/*.json)
                history_dir = persona_dir / "history"
                if history_dir.exists():
                    session_files = sorted(history_dir.glob("*.json"))
                    migrated_sessions = 0

                    for session_file in session_files:
                        # Verifica se ja existe
                        result = await db.execute(
                            select(ChatSession).where(
                                ChatSession.persona_name == persona_name,
                                ChatSession.original_filename == session_file.name,
                            )
                        )
                        if result.scalar_one_or_none() is not None:
                            continue

                        try:
                            messages = json.loads(session_file.read_text(encoding="utf-8"))
                        except Exception:
                            continue

                        if not messages:
                            continue

                        # Extrai timestamp do filename
                        try:
                            ts_str = session_file.stem.replace("chat_", "")
                            parts = ts_str.split("_")
                            if len(parts) >= 2:
                                created = datetime.strptime(f"{parts[0]}_{parts[1]}", "%Y-%m-%d_%H-%M-%S")
                            else:
                                created = datetime.fromtimestamp(session_file.stat().st_mtime)
                        except Exception:
                            created = datetime.fromtimestamp(session_file.stat().st_mtime)

                        # Gera titulo
                        title = session_file.stem.replace("chat_", "").replace("_", " ")

                        session = ChatSession(
                            persona_name=persona_name,
                            title=title[:200],
                            original_filename=session_file.name,
                            created_at=created,
                            updated_at=created,
                        )
                        db.add(session)
                        await db.flush()  # Obtem session.id

                        for idx, msg in enumerate(messages):
                            db.add(ChatMessage(
                                session_id=session.id,
                                role=msg.get("role", "user"),
                                content=msg.get("content", ""),
                                images=msg.get("images", []),
                                timestamp=msg.get("timestamp", ""),
                                order_index=idx,
                                meta={"auto_generated": msg.get("meta") == "auto_generated"} if msg.get("meta") else {},
                            ))

                        migrated_sessions += 1

                    if migrated_sessions:
                        logger.info(f"  -> {migrated_sessions} sessions migrated.")

                # 3c. RAG Tracker
                tracker_file = persona_dir / "rag_tracker.json"
                if tracker_file.exists():
                    tracker_data = json.loads(tracker_file.read_text(encoding="utf-8"))
                    for file_key, mtime in tracker_data.items():
                        result = await db.execute(
                            select(RagIngestionTracker).where(
                                RagIngestionTracker.persona_name == persona_name,
                                RagIngestionTracker.file_key == file_key,
                            )
                        )
                        if result.scalar_one_or_none() is None:
                            db.add(RagIngestionTracker(
                                persona_name=persona_name,
                                file_key=file_key,
                                last_modified=mtime,
                            ))

            await db.commit()

    await close_db()
    logger.info("Migration complete!")


def main():
    parser = argparse.ArgumentParser(description="Migrate Ahri V2 data to V3 SQLite")
    parser.add_argument(
        "--v2-path",
        default=r"C:\Users\zegil\Documents\GitHub\Ahri V2\Ahri",
        help="Path to Ahri V2 root directory",
    )
    parser.add_argument(
        "--db-url",
        default="sqlite+aiosqlite:///data/db/ahri.db",
        help="SQLite database URL",
    )
    args = parser.parse_args()

    asyncio.run(migrate(args.v2_path, args.db_url))


if __name__ == "__main__":
    main()
