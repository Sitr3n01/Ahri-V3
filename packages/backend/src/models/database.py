"""
SQLAlchemy models e engine SQLite.
Substitui os arquivos JSON (user_profile.json, memory.json, history/*.json, etc).
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, JSON, ForeignKey, Index
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


# =============================================================================
# User Profile (substitui data/global/user_profile.json)
# =============================================================================
class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String(100), default="")
    archetype = Column(String(200), default="")
    learning_style = Column(String(200), default="")
    attributes = Column(JSON, default=dict)         # languages, tech_stack, interests, etc.
    preferences = Column(JSON, default=dict)         # foods, music, dislikes
    knowledge_tracker = Column(JSON, default=dict)   # vocabulary_recent, concepts_mastered
    active_quests = Column(JSON, default=dict)       # learn_japanese_hiragana, etc.
    session_log = Column(JSON, default=list)          # timestamped session summaries
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# Social Graph (substitui data/global/social_graph.json)
# =============================================================================
class SocialGraphEntry(Base):
    __tablename__ = "social_graph_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String(50), nullable=False)    # spotify, instagram, twitter
    data = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# Persona Memory (substitui data/personas/{name}/memory.json)
# =============================================================================
class PersonaMemory(Base):
    __tablename__ = "persona_memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    persona_name = Column(String(50), nullable=False, unique=True, index=True)
    active_quests = Column(JSON, default=dict)
    session_log = Column(JSON, default=list)
    session_log_detailed = Column(JSON, default=list)
    last_session_buffer = Column(JSON, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# Chat Sessions (substitui data/personas/{name}/history/*.json)
# =============================================================================
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    persona_name = Column(String(50), nullable=False, index=True)
    title = Column(String(200), default="")
    original_filename = Column(String(200), default="")  # Para referência durante migração
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_order", "session_id", "order_index"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)        # user, assistant, model, system
    content = Column(Text, default="")
    images = Column(JSON, default=list)               # Base64 encoded images
    timestamp = Column(String(20), default="")        # HH:MM:SS format from original
    order_index = Column(Integer, default=0)
    meta = Column(JSON, default=dict)                 # auto_generated, model_used, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")


# =============================================================================
# RAG Ingestion Tracker (substitui data/personas/{name}/rag_tracker.json)
# =============================================================================
class RagIngestionTracker(Base):
    __tablename__ = "rag_ingestion_tracker"

    id = Column(Integer, primary_key=True, autoincrement=True)
    persona_name = Column(String(50), nullable=False, index=True)
    file_key = Column(String(300), nullable=False)   # e.g., "static_lore/lore.md"
    last_modified = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# Search Quota (substitui websearch_quota tracking in-memory)
# =============================================================================
class SearchQuota(Base):
    __tablename__ = "search_quota"

    id = Column(Integer, primary_key=True, default=1)
    date = Column(String(10), nullable=False)         # YYYY-MM-DD
    count = Column(Integer, default=0)
    max_daily = Column(Integer, default=90)


# =============================================================================
# Episodic Memory (NOVA - Memória episódica estruturada)
# =============================================================================
class EpisodicMemory(Base):
    __tablename__ = "episodic_memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    persona_name = Column(String(50), nullable=False, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    topics = Column(JSON, default=list)              # ["japanese", "coding", "personal"]
    emotional_tone = Column(String(50), default="")  # "focused", "playful", "melancholic"
    summary = Column(Text, default="")
    importance = Column(Integer, default=5)           # 1-10 scale
    outcomes = Column(JSON, default=list)             # ["learned hiragana T-row", "fixed bug"]


# =============================================================================
# Agent Tasks (NOVA - Tarefas do agente)
# =============================================================================
class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    capability = Column(String(50), nullable=False)  # file_read, shell_execute, etc.
    parameters = Column(JSON, default=dict)
    permission_level = Column(String(20), default="SAFE")  # SAFE, CONFIRM, BLOCKED
    status = Column(String(20), default="pending")   # pending, approved, running, completed, failed
    result = Column(Text, default="")
    error = Column(Text, default="")
    execution_id = Column(Integer, ForeignKey("agent_executions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


# =============================================================================
# Agent Mode - Orchestrated Executions
# =============================================================================
class AgentExecution(Base):
    __tablename__ = "agent_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    goal = Column(Text, nullable=False)                  # User's task description
    orchestrator_model = Column(String(100), nullable=False)  # "gemini-2.5-flash", "gemma-3-27b"
    status = Column(String(20), default="planning")      # planning, running, completed, failed
    plan = Column(JSON, default=dict)                    # Orchestrator's step breakdown
    result = Column(Text, default="")                    # Final synthesized output
    error = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    worker_tasks = relationship("AgentWorkerTask", back_populates="execution", cascade="all, delete-orphan")


class AgentWorkerTask(Base):
    __tablename__ = "agent_worker_tasks"
    __table_args__ = (
        Index("ix_worker_tasks_execution_id", "execution_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_id = Column(Integer, ForeignKey("agent_executions.id", ondelete="CASCADE"), nullable=False)
    worker_type = Column(String(50), nullable=False)     # RAG, Code, Web, Memory, Vision, Shell, Browser, Router
    model = Column(String(100), nullable=False)          # "gemma-3-4b", "gemma-3-12b", etc.
    input_data = Column(JSON, default=dict)              # Worker prompt + parameters
    output_data = Column(JSON, default=dict)             # Worker's structured result
    tokens_used = Column(Integer, default=0)             # For TPM tracking
    duration_ms = Column(Integer, default=0)
    status = Column(String(20), default="pending")       # pending, running, completed, failed
    error = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    execution = relationship("AgentExecution", back_populates="worker_tasks")


class TPMQuota(Base):
    __tablename__ = "tpm_quotas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key_hash = Column(String(64), nullable=False)    # SHA256 hash of API key
    provider = Column(String(50), nullable=False)        # google_ai_studio, deepinfra, ollama
    model = Column(String(100), nullable=False)          # gemma-3-4b, gemma-3-12b, etc.
    tokens_used = Column(Integer, default=0)
    window_start = Column(DateTime, nullable=False)
    window_end = Column(DateTime, nullable=False)


# =============================================================================
# Database Engine
# =============================================================================
_engine = None
_session_factory = None


async def init_db(database_url: str):
    """Inicializa o engine e cria todas as tabelas."""
    global _engine, _session_factory

    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


from typing import AsyncGenerator
# ... imports

# ...

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection para FastAPI - retorna uma sessão async."""
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    async with _session_factory() as session:
        yield session


async def close_db():
    """Fecha o engine de forma limpa."""
    global _engine
    if _engine:
        await _engine.dispose()
