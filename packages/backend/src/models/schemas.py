"""
Pydantic schemas para request/response da API.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# =============================================================================
# Auth
# =============================================================================
class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# =============================================================================
# Personas
# =============================================================================
class PersonaTheme(BaseModel):
    primary: str = "#d8b4d8"
    secondary: str = "#e9cce9"
    shadow: str = "rgba(192, 132, 192, 0.25)"
    glow: str = "rgba(216, 180, 216, 0.6)"
    avatar: str = ""
    background: str = ""
    background_mobile: str = ""


class PersonaSummary(BaseModel):
    name: str
    display_name: str
    archetype: str = ""
    universe: str = ""
    theme: PersonaTheme = Field(default_factory=PersonaTheme)


class PersonaDetail(PersonaSummary):
    identity_text: str = ""
    spotify_genres: list[str] = []
    has_lore: bool = False
    knowledge_count: int = 0
    session_count: int = 0


class PersonaListResponse(BaseModel):
    personas: list[PersonaSummary]
    active: str


# =============================================================================
# Chat
# =============================================================================
class ChatMessageSchema(BaseModel):
    role: str
    content: str
    images: list[str] = []
    timestamp: str = ""
    meta: dict = {}


class FileAttachment(BaseModel):
    data: str  # base64
    name: str


class ChatRequest(BaseModel):
    message: str
    images: list[str] = []
    video: Optional[FileAttachment] = None
    pdfs: list[FileAttachment] = []
    mode: str = "default"                # default, web_search, lore_search
    model: str = "PRO"                   # PRO, GOOGLE, DEEPSEEK, LOCAL


class ChatResponse(BaseModel):
    message: ChatMessageSchema
    agent_tasks: list["AgentTaskSchema"] = []
    memory_notifications: list[str] = []


# =============================================================================
# Sessions
# =============================================================================
class SessionSummary(BaseModel):
    id: int
    title: str
    persona_name: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class SessionDetail(SessionSummary):
    messages: list[ChatMessageSchema]


class SessionCreateRequest(BaseModel):
    title: str = ""


class SessionRenameRequest(BaseModel):
    title: str


# =============================================================================
# Memory
# =============================================================================
class UserProfileSchema(BaseModel):
    name: str = ""
    archetype: str = ""
    learning_style: str = ""
    attributes: dict = {}
    preferences: dict = {}
    knowledge_tracker: dict = {}
    active_quests: dict = {}
    session_log: list = []


class MemorySaveRequest(BaseModel):
    title: str
    content: str


class MemoryLearnRequest(BaseModel):
    topic: str
    content: str


class MemoryForgetRequest(BaseModel):
    topic: str


# =============================================================================
# Agent
# =============================================================================
class AgentCapability(str, Enum):
    FILE_READ = "file_read"
    FILE_WRITE = "file_write"
    FILE_DELETE = "file_delete"
    DIR_LIST = "dir_list"
    SHELL_EXECUTE = "shell_execute"
    CODE_EXECUTE = "code_execute"
    BROWSER_OPEN = "browser_open"
    SCREENSHOT = "screenshot"
    CLIPBOARD_READ = "clipboard_read"
    CLIPBOARD_WRITE = "clipboard_write"
    SYSTEM_INFO = "system_info"
    APP_LAUNCH = "app_launch"


class PermissionLevel(str, Enum):
    SAFE = "SAFE"
    CONFIRM = "CONFIRM"
    BLOCKED = "BLOCKED"


class AgentTaskStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentTaskSchema(BaseModel):
    id: int = 0
    capability: AgentCapability
    parameters: dict = {}
    permission_level: PermissionLevel = PermissionLevel.SAFE
    status: AgentTaskStatus = AgentTaskStatus.PENDING
    result: str = ""
    error: str = ""
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AgentExecuteRequest(BaseModel):
    capability: AgentCapability
    parameters: dict = {}


class AgentApproveRequest(BaseModel):
    task_id: int


# =============================================================================
# Agent Mode - Orchestration
# =============================================================================
class AgentExecutionStatus(str, Enum):
    PLANNING = "planning"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentWorkerType(str, Enum):
    RAG = "RAG"
    CODE = "Code"
    WEB = "Web"
    MEMORY = "Memory"
    VISION = "Vision"
    SHELL = "Shell"
    BROWSER = "Browser"
    ROUTER = "Router"


class AgentWorkerTaskSchema(BaseModel):
    id: int = 0
    execution_id: int
    worker_type: AgentWorkerType
    model: str
    input_data: dict = {}
    output_data: dict = {}
    tokens_used: int = 0
    duration_ms: int = 0
    status: AgentTaskStatus = AgentTaskStatus.PENDING
    error: str = ""
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AgentExecutionSchema(BaseModel):
    id: int = 0
    goal: str
    orchestrator_model: str
    status: AgentExecutionStatus = AgentExecutionStatus.PLANNING
    plan: dict = {}
    result: str = ""
    error: str = ""
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    worker_tasks: list[AgentWorkerTaskSchema] = []


class AgentModeExecuteRequest(BaseModel):
    goal: str
    orchestrator_model: str = "gemini-2.5-flash"


# =============================================================================
# Search
# =============================================================================
class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


class SearchResult(BaseModel):
    title: str
    link: str
    snippet: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    remaining_quota: int


# =============================================================================
# Spotify
# =============================================================================
class SpotifyContext(BaseModel):
    is_playing: bool = False
    track_name: str = ""
    artist_name: str = ""
    album_name: str = ""
    genres: list[str] = []
    suggested_persona: str = ""


# =============================================================================
# Sync
# =============================================================================
class SyncState(BaseModel):
    active_persona: str
    active_session_id: Optional[int] = None
    user_profile: UserProfileSchema
    recent_messages: list[ChatMessageSchema] = []
    spotify_context: Optional[SpotifyContext] = None


# Resolve forward references
ChatResponse.model_rebuild()
