"""
Ahri V3 - FastAPI Application Entry Point.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import get_settings
from src.models.database import init_db, close_db
from src.routers import auth, chat, personas, memory, sessions, agent, search, spotify, agent_mode, settings

logger = logging.getLogger("ahri.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup e shutdown da aplicação."""
    settings = get_settings()

    # Garante que diretórios existem
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    settings.vector_db_path.mkdir(parents=True, exist_ok=True)
    settings.personas_dir.mkdir(parents=True, exist_ok=True)

    # Inicializa banco de dados
    logger.info(f"Initializing database: {settings.sqlite_url}")
    await init_db(settings.sqlite_url)

    logger.info("Ahri V3 Backend started.")
    yield

    # Cleanup
    await close_db()
    logger.info("Ahri V3 Backend stopped.")


app = FastAPI(
    title="Ahri V3 API",
    description="AI Companion System with Multi-Persona Support and Agent Capabilities",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS - permite Electron (localhost) e mobile (Cloudflare tunnel)
_cors_origins = [
    "http://localhost:5173",   # Vite dev (desktop)
    "http://localhost:5174",   # Vite dev (web)
    "http://localhost:3000",   # Alternate dev port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    "app://.",                 # Electron custom protocol
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registra routers
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(personas.router, prefix="/personas", tags=["Personas"])
app.include_router(memory.router, prefix="/memory", tags=["Memory"])
app.include_router(sessions.router, prefix="/sessions", tags=["Sessions"])
app.include_router(agent.router, prefix="/agent", tags=["Agent"])
app.include_router(agent_mode.router)  # Agent mode has its own prefix
app.include_router(search.router, prefix="/search", tags=["Search"])
app.include_router(spotify.router, prefix="/spotify", tags=["Spotify"])
app.include_router(settings.router, prefix="/settings", tags=["Settings"])


@app.get("/health")
async def health_check():
    """Health check para o Electron saber que o backend está pronto."""
    return {"status": "ok", "version": "0.1.0"}
