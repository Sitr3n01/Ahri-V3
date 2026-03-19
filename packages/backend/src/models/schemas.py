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


class ResetPasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=4, max_length=100)


class ForceResetRequest(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=100)


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


class CreatePersonaRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(..., min_length=1, max_length=100)
    archetype: str = ""
    universe: str = ""
    voice_language: str = "pt-br"
    primary_color: str = "#d8b4d8"
    secondary_color: str = "#e9cce9"
    identity_text: str = ""
    spotify_genres: list[str] = []


class UpdatePersonaRequest(BaseModel):
    display_name: Optional[str] = None
    archetype: Optional[str] = None
    universe: Optional[str] = None
    voice_language: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    identity_text: Optional[str] = None


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
# Settings
# =============================================================================
class SettingsSchema(BaseModel):
    gemini_api_key_paid: str = ""
    gemini_api_key_free: str = ""
    openrouter_api_key: str = ""
    openrouter_model_name: str = ""
    
    cse_api_key: str = ""
    cse_cx: str = ""
    
    spotipy_client_id: str = ""
    spotipy_client_secret: str = ""
    spotipy_redirect_uri: str = ""
    
    agent_mode_enabled: bool = True
    agent_mode_orchestrator: str = ""
    ollama_base_url: str = ""

    google_api_key_vision_a: str = ""
    google_api_key_vision_b: str = ""
    google_api_key_manager: str = ""
    
    google_api_key_search: str = ""
    google_api_key_search_b: str = ""
    
    google_ai_studio_api_key: str = ""
    google_ai_studio_tpm_limit: int = 15000
    
    deepinfra_api_key: str = ""
    gh_token: str = ""
    gist_id: str = ""

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""


class UpdateSettingsRequest(BaseModel):
    settings: dict  # Partial update


# =============================================================================
# OAuth & Models
# =============================================================================
class AvailableModelSchema(BaseModel):
    id: str
    display_name: str
    provider: str  # google_oauth, google_apikey, openrouter, ollama
    color: str = "#8B5CF6"
    description: str = ""
    input_token_limit: int = 0
    output_token_limit: int = 0


class OAuthStatusResponse(BaseModel):
    configured: bool = False
    connected: bool = False
    email: Optional[str] = None
    models: list[AvailableModelSchema] = []


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
