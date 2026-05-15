# Ahri V3 - Technical Documentation
**Version:** 3.0.0
**Last Updated:** 2026-02-10
**Architecture:** Monorepo (Turborepo + npm workspaces)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Backend (FastAPI)](#backend-fastapi)
3. [Desktop App (Electron + React)](#desktop-app-electron--react)
4. [Web App (PWA)](#web-app-pwa)
5. [Shared Package](#shared-package)
6. [Data Layer](#data-layer)
7. [Agent Mode System](#agent-mode-system)
8. [Deployment & Operations](#deployment--operations)

---

## Architecture Overview

```
ahri-v3/
├── packages/
│   ├── backend/         # FastAPI Python backend (port 8742)
│   ├── desktop/         # Electron + React desktop app
│   ├── web/             # PWA mobile app (React)
│   └── shared/          # TypeScript types, themes, API client
└── data/                # SQLite DB + ChromaDB + persona configs
```

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Backend** | FastAPI | 0.115+ |
| **Desktop** | Electron | 33.x |
| **Frontend** | React | 19.x |
| **Build System** | Turborepo | Latest |
| **Database** | SQLite + SQLAlchemy | async |
| **Vector DB** | ChromaDB | Latest |
| **LLM** | Google Gemini/Gemma | 2.5/3.x |
| **Bundler** | Vite | 6.x |
| **State Mgmt** | Zustand | 5.x |
| **Styling** | Tailwind CSS | 3.4+ |

### Key Design Principles

1. **Monorepo Structure** - All packages share configs and types
2. **Type Safety** - TypeScript + Pydantic across the stack
3. **Async-First** - SQLAlchemy async, FastAPI async, React async
4. **Thread-Safe** - Locks in TPMManager, per-request Gemini clients
5. **Offline-Capable** - PWA with service workers, local SQLite
6. **Multi-LLM** - Support for 4 LLM backends (PRO/GOOGLE/DEEPSEEK/LOCAL)

---

## Backend (FastAPI)

### Project Structure

```
packages/backend/
├── src/
│   ├── main.py                  # FastAPI app, CORS, lifespan
│   ├── config.py                # Pydantic settings from .env
│   ├── dependencies.py          # FastAPI dependency injection
│   ├── routers/                 # 8 API route modules
│   │   ├── auth.py              # JWT login/refresh
│   │   ├── chat.py              # Chat + streaming WebSocket
│   │   ├── personas.py          # Persona CRUD
│   │   ├── sessions.py          # Session management
│   │   ├── memory.py            # Memory operations
│   │   ├── agent.py             # Agent task approval
│   │   ├── agent_mode.py        # Multi-agent orchestration
│   │   ├── search.py            # Web search
│   │   └── spotify.py           # Spotify integration
│   ├── services/                # Business logic
│   │   ├── llm_service.py       # LLM client wrapper
│   │   ├── memory_service.py    # 3-layer memory (session/profile/RAG)
│   │   ├── persona_service.py   # Persona loader
│   │   ├── vector_service.py    # ChromaDB wrapper
│   │   ├── session_service.py   # Chat session CRUD
│   │   ├── search_service.py    # Google Custom Search
│   │   ├── spotify_service.py   # Spotify OAuth
│   │   ├── agent_service.py     # Single-agent task execution
│   │   ├── orchestrator_service.py  # Multi-agent coordinator
│   │   ├── tpm_manager.py       # Token rate limiting (15k TPM)
│   │   └── workers/             # 8 specialized workers
│   │       ├── rag_worker.py    # ChromaDB search
│   │       ├── code_worker.py   # Code analysis/execution
│   │       ├── shell_worker.py  # Shell commands (validated)
│   │       ├── memory_worker.py # Memory search
│   │       ├── web_worker.py    # Web scraping
│   │       ├── vision_worker.py # Image analysis
│   │       ├── browser_worker.py # Playwright automation
│   │       └── router_worker.py # Task classification
│   ├── core/                    # Core utilities
│   │   ├── llm_clients.py       # Per-request Gemini clients
│   │   ├── prompt_builder.py    # System prompt builder
│   │   ├── save_tag_parser.py   # Parse [[SAVE:]] tags
│   │   └── memory_analyzer.py   # Classify memory importance
│   ├── models/                  # Data models
│   │   ├── database.py          # SQLAlchemy ORM models
│   │   └── schemas.py           # Pydantic request/response models
│   └── scripts/
│       └── migrate_data.py      # JSON → SQLite migration
└── tests/                       # pytest async tests
```

### API Endpoints

#### Authentication (`/auth`)
- `POST /auth/login` - JWT token generation (15min access + 7d refresh)
- `POST /auth/refresh` - Refresh access token

#### Chat (`/chat`)
- `POST /chat/{session_id}/message` - Send message (HTTP)
- `WS /chat/{session_id}/stream` - Streaming chat (WebSocket)
- `POST /chat/upload` - Upload files (images/video/PDF)

#### Personas (`/personas`)
- `GET /personas` - List all personas
- `GET /personas/{name}` - Get persona details
- `POST /personas/{name}/activate` - Switch active persona

#### Sessions (`/sessions`)
- `GET /sessions` - List all sessions
- `GET /sessions/{id}` - Get session details
- `POST /sessions` - Create new session
- `PUT /sessions/{id}` - Rename session
- `DELETE /sessions/{id}` - Delete session
- `GET /sessions/{id}/messages` - Get all messages

#### Memory (`/memory`)
- `POST /memoria` - Trigger manual memory save
- `POST /aprender` - Learn new information
- `POST /esquecer` - Forget information

#### Agent (`/agent`)
- `POST /agent/task` - Submit agent task
- `POST /agent/task/{id}/approve` - Approve task
- `POST /agent/task/{id}/deny` - Deny task
- `GET /agent/tasks` - List pending tasks

#### Agent Mode (`/agent-mode`)
- `POST /agent-mode/execute` - Execute multi-agent task
- `GET /agent-mode/{id}` - Get execution status
- `GET /agent-mode/{id}/workers` - Get worker tasks
- `WS /agent-mode/ws/{id}` - Real-time updates

#### Search (`/search`)
- `POST /search/web` - Web search
- `POST /search/lore` - Lore search (persona knowledge)

#### Spotify (`/spotify`)
- `GET /spotify/current` - Get current playing track
- `GET /spotify/context` - Get listening context

### Database Schema

**SQLite Tables (SQLAlchemy ORM):**

1. **UserProfile** - User preferences, Japanese learning progress
2. **ChatSession** - Conversation sessions
3. **ChatMessage** - Individual messages
4. **PersonaMemory** - Per-persona long-term memories
5. **SocialGraphEntry** - User relationships graph
6. **EpisodicMemory** - Timestamped episodic memories
7. **AgentTask** - Single-agent task queue
8. **AgentExecution** - Multi-agent execution records
9. **AgentWorkerTask** - Individual worker executions
10. **TPMQuota** - Token usage tracking (per-minute windows)
11. **RagIngestionTracker** - Track ingested RAG documents
12. **SearchQuota** - Daily search quota tracking

### LLM Integration

#### Supported Models

| Mode | Provider | Model | Use Case |
|------|----------|-------|----------|
| PRO | Google AI Studio | gemini-2.5-flash | Fast, multimodal |
| GOOGLE | Google AI Studio | gemma-3-27b | Code, reasoning |
| DEEPSEEK | OpenRouter | deepseek-r1 | Advanced reasoning |
| LOCAL | Ollama | gemma-3-4b | Offline, privacy |

#### Thread Safety Fix

**Problem:** V2 used global `genai.configure()` causing race conditions.

**Solution:** Per-request GeminiClient instances:

```python
# OLD (V2) - NOT THREAD-SAFE
genai.configure(api_key=api_key)  # Global state
model = genai.GenerativeModel("gemini-pro")

# NEW (V3) - THREAD-SAFE
class GeminiClient:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)  # Per-instance
        self.model = self.client.models.get("gemini-2.5-flash")
```

### Memory System (3-Layer)

1. **Session Memory** - Chat history in current session
2. **Profile Memory** - Long-term facts, preferences
3. **RAG Memory** - Semantic search in ChromaDB

**Memory Analyzer Classification:**

- `CRITICAL` - Core identity facts → Save to profile
- `IMPORTANT` - Significant events → Episodic memory
- `USEFUL` - Contextual info → Session buffer
- `IGNORE` - Small talk → Discard

### WebSocket Streaming

**Implementation:**

```python
@router.websocket("/chat/{session_id}/stream")
async def chat_stream(websocket: WebSocket, session_id: int):
    await websocket.accept()

    async for chunk in llm_service.stream_response(message):
        await websocket.send_text(chunk)

    await websocket.close()
```

**Client Reconnection:**
- Desktop: `ChatWebSocket` class with auto-reconnect
- Web: Native WebSocket with manual reconnect

---

## Desktop App (Electron + React)

### Project Structure

```
packages/desktop/
├── electron/
│   ├── main.ts              # Main process (Node.js)
│   ├── preload.ts           # Preload script (IPC bridge)
│   └── python-backend.ts    # Backend lifecycle management
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root component, routing, theming
│   ├── stores/              # Zustand state management
│   │   ├── auth-store.ts    # Authentication
│   │   ├── persona-store.ts # Persona selection
│   │   ├── chat-store.ts    # Chat messages
│   │   ├── agent-store.ts   # Single-agent tasks
│   │   └── agent-mode-store.ts # Multi-agent executions
│   ├── api/
│   │   ├── client.ts        # Shared API client instance
│   │   └── chat-websocket.ts # WebSocket manager
│   ├── features/            # Feature modules
│   │   ├── auth/
│   │   │   └── LoginView.tsx
│   │   ├── chat/
│   │   │   ├── ChatView.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── MessageBubble.tsx
│   │   ├── sidebar/
│   │   │   └── Sidebar.tsx
│   │   ├── agent/
│   │   │   └── AgentPanel.tsx
│   │   └── agent-mode/
│   │       └── AgentModeView.tsx
│   ├── components/          # Shared components
│   │   ├── TPMQuotaMeter.tsx
│   │   ├── DependencyGraph.tsx
│   │   └── ExecutionHistory.tsx
│   └── styles/
│       └── globals.css      # Glassmorphism, animations
└── package.json
```

### Electron Main Process

**Backend Lifecycle:**

```typescript
// Spawn Python backend on app start
const backendProcess = spawn('python', ['-m', 'uvicorn', ...]);

// Kill on app quit
app.on('will-quit', () => {
    backendProcess.kill();
});
```

**IPC Handlers:**

```typescript
// Agent capabilities
ipcMain.handle('agent:openFile', async (_, path) => {
    shell.openPath(path);
});

ipcMain.handle('agent:readFile', async (_, path) => {
    return await fs.readFile(path, 'utf-8');
});

// Window controls
ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
});

// Auto-Persona Daemon
let autoPersonaInterval: NodeJS.Timeout | null = null;

ipcMain.handle('auto-persona:start', () => {
    autoPersonaInterval = setInterval(async () => {
        const track = await fetchSpotifyCurrentTrack();
        const persona = matchPersonaToMood(track.valence, track.energy);
        await switchPersona(persona);
    }, 60000); // Poll every minute
});
```

### Zustand Stores

**Pattern:**

```typescript
export const useChatStore = create<ChatState>((set, get) => ({
    // State
    messages: [],
    isStreaming: false,

    // Actions
    sendMessage: async (content: string) => {
        set({ isStreaming: true });
        // ... API call
        set({ isStreaming: false });
    },

    clearMessages: () => set({ messages: [] })
}));
```

**Usage:**

```typescript
const { messages, sendMessage } = useChatStore();
```

### Theming System

**17 Persona Themes:**

Each persona has unique colors defined in `@ahri/shared/themes`:

```typescript
export const personaThemes = {
    Ahri: {
        primary: '#da4ea2',
        secondary: '#8b5cf6',
        glow: 'rgba(218, 78, 162, 0.5)',
        // ...
    },
    Kafka: {
        primary: '#9d174d',
        // ...
    }
};
```

**Dynamic Application:**

```typescript
const theme = getPersonaTheme(activePersona.name);

// Apply CSS variables
document.documentElement.style.setProperty('--theme-primary', theme.primary);
```

### Chat Features

1. **Auto-Resize Textarea** - Grows with content (max 120px)
2. **File Upload** - Drag & drop, paste, compression
3. **Vision/Multimodal** - Gemini File API for video/PDF
4. **Terminal Commands** - `/memoria`, `/aprender`, `/esquecer`
5. **Markdown Rendering** - Code blocks, syntax highlighting
6. **Image Rendering** - Inline image display
7. **Session Rename** - Inline editing in Sidebar
8. **Search Modes** - Web search, lore search, default

---

## Web App (PWA)

### PWA Configuration

**Service Worker (Workbox):**

```typescript
// vite-plugin-pwa config
VitePWA({
    registerType: 'autoUpdate',
    workbox: {
        runtimeCaching: [
            {
                urlPattern: /^https?:\/\/localhost:8742\/.*$/,
                handler: 'NetworkFirst', // API calls
                options: {
                    cacheName: 'api-cache',
                    expiration: { maxAgeSeconds: 60 * 60 * 24 }
                }
            },
            {
                urlPattern: /\.(?:png|jpg|svg)$/,
                handler: 'CacheFirst', // Images
                options: {
                    cacheName: 'image-cache',
                    expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }
                }
            }
        ]
    }
})
```

**Manifest:**

```json
{
    "name": "Ahri - AI Companion",
    "short_name": "Ahri",
    "theme_color": "#da4ea2",
    "background_color": "#0a0a0f",
    "display": "standalone",
    "orientation": "portrait",
    "icons": [
        { "src": "pwa-192x192.png", "sizes": "192x192" },
        { "src": "pwa-512x512.png", "sizes": "512x512", "purpose": "any maskable" }
    ]
}
```

### Mobile-Specific Features

1. **Bottom Navigation** - 4 tabs (Chat, Personas, Sessions, Settings)
2. **Touch Gestures** - Pull-to-refresh disabled, swipe navigation
3. **Safe Area Support** - iOS notch padding
4. **Viewport Fit** - `viewport-fit=cover`
5. **Offline Mode** - Service worker caching
6. **Add to Home Screen** - PWA install prompt

### State Persistence

**Zustand Persist Middleware:**

```typescript
export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            tokens: { access: null, refresh: null },
            login: async (password) => { /* ... */ }
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => localStorage)
        }
    )
);
```

---

## Shared Package

### Structure

```
packages/shared/
├── src/
│   ├── index.ts              # Main exports
│   ├── themes/               # 17 persona themes
│   │   └── index.ts
│   ├── types/                # TypeScript types
│   │   ├── api.ts            # API request/response
│   │   ├── persona.ts        # Persona types
│   │   ├── chat.ts           # Chat types
│   │   ├── memory.ts         # Memory types
│   │   ├── agent.ts          # Agent types
│   │   └── agent-mode.ts     # Agent mode types
│   └── api-client/           # API client class
│       └── index.ts
└── package.json
```

### API Client

**Usage:**

```typescript
import { AhriApiClient } from '@ahri/shared';

const api = new AhriApiClient({ baseURL: 'http://localhost:8742' });

// Authentication
await api.login('password');
await api.refreshToken(refreshToken);

// Chat
await api.sendMessage(sessionId, 'Hello', 'PRO');
await api.getSessionMessages(sessionId);

// Personas
const personas = await api.getPersonas();
await api.activatePersona('Kafka');

// Agent Mode
const execution = await api.executeAgentMode('Search for Python async patterns', 'PRO');
```

### Type System

**Shared Types Example:**

```typescript
export interface ChatMessage {
    session_id: number;
    role: 'user' | 'assistant';
    content: string;
    model: ModelType;
    created_at: string;
}

export type ModelType = 'PRO' | 'GOOGLE' | 'DEEPSEEK' | 'LOCAL';

export interface PersonaSummary {
    name: string;
    display_name: string;
    archetype: string;
    universe: string;
    theme: string;
}
```

---

## Data Layer

### Directory Structure

```
data/
├── db/
│   └── ahri.db               # SQLite database
├── vector_db/
│   └── chroma/               # ChromaDB storage
├── personas/
│   └── {name}/
│       ├── persona.md        # Persona definition
│       ├── rag_tracker.json  # Ingestion tracker
│       ├── knowledge/        # Episodic memories
│       │   └── *.md
│       └── rag_docs/         # RAG documents
│           └── lore.md
├── global/
│   ├── user_profile.json     # User preferences
│   └── social_graph.json     # Relationships
└── assets/
    └── backgrounds/          # Persona backgrounds
```

### ChromaDB Collections

**Per-Persona Collections:**

```python
collection_name = f"persona_{persona_name}"
collection = client.get_or_create_collection(collection_name)

# Embedding function
embed_fn = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
```

**Document Ingestion:**

```python
# Ingest from persona.md + rag_docs/ + knowledge/
documents, metadatas, ids = load_persona_docs(persona_name)

collection.add(
    documents=documents,
    metadatas=metadatas,
    ids=ids
)
```

**Semantic Search:**

```python
results = collection.query(
    query_texts=["Tell me about Ahri's personality"],
    n_results=5
)
```

---

## Agent Mode System

### Architecture

**3-Tier System:**

1. **Orchestrator** (Gemini 2.5 Flash or Gemma 27B)
   - Plans task execution
   - Delegates to workers
   - Synthesizes results

2. **Workers** (8 specialized agents)
   - RAG, Code, Shell, Memory, Web, Vision, Browser, Router
   - Each uses appropriate LLM (Gemma 4B/12B/27B or Gemini Flash)

3. **TPM Manager**
   - Enforces 15k tokens/minute limit
   - Sliding window rate limiting

### Execution Flow

```
User submits goal
    ↓
Orchestrator receives goal
    ↓
LLM generates plan with steps
    ↓
Build dependency graph (topological sort)
    ↓
Execute workers in parallel (per level)
    ↓
Collect results
    ↓
Orchestrator synthesizes final result
```

### Worker Capabilities

| Worker | Model | Capabilities |
|--------|-------|-------------|
| **RAG** | Gemma 3 4B | ChromaDB search, lore retrieval |
| **Code** | Gemma 3 27B | Analyze, generate, review, execute (sandboxed Python) |
| **Shell** | Gemma 3 4B | File ops (read/write/list), safe shell commands |
| **Memory** | Gemma 3 4B | Search episodic/profile/session memories |
| **Web** | Gemma 3 4B | Fetch URLs, scrape, summarize, extract |
| **Vision** | Gemini Flash | Describe images, OCR, object detection, VQA |
| **Browser** | Gemini Flash | Playwright automation (navigate, click, form fill) |
| **Router** | Gemma 3 4B | Task classification, worker selection |

### Dependency Graph Example

**Task:** "Search for Python async patterns, then generate code example, then test it"

**Plan:**

```json
{
    "steps": [
        {
            "worker": "web",
            "input": { "action": "search", "query": "Python async patterns 2026" },
            "depends_on": null
        },
        {
            "worker": "code",
            "input": { "action": "generate", "description": "async example from step 0" },
            "depends_on": 0
        },
        {
            "worker": "code",
            "input": { "action": "execute", "code": "output from step 1" },
            "depends_on": 1
        }
    ]
}
```

**Execution Levels:**

- Level 0: [Worker 0] (parallel)
- Level 1: [Worker 1] (depends on 0)
- Level 2: [Worker 2] (depends on 1)

### WebSocket Real-Time Updates

**Events:**

- `connected` - Initial connection
- `status_update` - Planning → Running → Completed
- `worker_started` - Worker begins execution
- `worker_completed` - Worker finishes (success/failure)
- `tpm_status` - Token quota updates (500ms interval)
- `execution_completed` - Final result ready

---

## Deployment & Operations

### Development

**Start All Services:**

```bash
# Backend
cd packages/backend
python -m uvicorn src.main:app --host 0.0.0.0 --port 8742

# Desktop
cd packages/desktop
npm run dev

# Web
cd packages/web
npm run dev
```

**Environment Variables (.env):**

```bash
# Auth
JWT_SECRET_KEY=your-secret-key-min-32-chars
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD=your-password

# LLMs
GEMINI_API_KEY=your-gemini-key
DEEPSEEK_API_KEY=your-openrouter-key

# Spotify (optional)
SPOTIFY_CLIENT_ID=your-client-id
SPOTIFY_CLIENT_SECRET=your-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:8742/spotify/callback

# Search (optional)
GOOGLE_SEARCH_API_KEY=your-search-key
GOOGLE_SEARCH_ENGINE_ID=your-engine-id

# Agent Mode
AGENT_MODE_ORCHESTRATOR_MODEL=gemini-2.5-flash
AGENT_MODE_WORKER_MODEL=gemma-3-4b
AGENT_MODE_ENABLE_PARALLEL=true
AGENT_MODE_TPM_LIMIT=15000
```

### Production Checklist

- [ ] Change `JWT_SECRET_KEY` to strong random value (32+ chars)
- [ ] Update `PASSWORD` to secure password
- [ ] Configure CORS `allow_origins` to specific domains
- [ ] Set `DEBUG=false` in config
- [ ] Enable HTTPS
- [ ] Configure rate limiting
- [ ] Set up monitoring (Sentry, Datadog)
- [ ] Configure backup for SQLite + ChromaDB
- [ ] Enable structured logging
- [ ] Add health check endpoint monitoring

### Testing

**Backend:**

```bash
cd packages/backend
pytest tests/ -v
```

**Frontend:**

```bash
cd packages/desktop
npm run test

cd packages/web
npm run test
```

**Type Checking:**

```bash
npm run type-check --workspaces
```

### Build

**Desktop:**

```bash
cd packages/desktop
npm run build
npm run package  # Electron builder
```

**Web:**

```bash
cd packages/web
npm run build  # Output: dist/
```

---

## Troubleshooting

### Common Issues

#### 1. Backend Won't Start

**Symptoms:** `ModuleNotFoundError`, `ImportError`

**Solutions:**
```bash
cd packages/backend
pip install -r requirements.txt
pip install sentence-transformers  # For ChromaDB
```

#### 2. ChromaDB Collection Error

**Symptoms:** `Collection not found`, `Embedding function error`

**Solutions:**
```bash
# Delete and recreate ChromaDB
rm -rf data/vector_db/
python packages/backend/src/scripts/migrate_data.py
```

#### 3. TypeScript Errors in Shared Package

**Symptoms:** `Module not found '@ahri/shared'`

**Solutions:**
```bash
# Rebuild shared package
cd packages/shared
npm run build

# In dependent packages
npm install
```

#### 4. WebSocket Disconnects

**Symptoms:** Chat streaming stops, `WebSocket closed`

**Solutions:**
- Check backend logs for errors
- Increase `MAX_POLL_DURATION` in `agent_mode.py`
- Check network firewalls/proxies

#### 5. Agent Mode Timeout

**Symptoms:** `Execution timeout after 600s`

**Solutions:**
- Reduce task complexity
- Increase `MAX_POLL_DURATION` in config
- Check TPM quota (15k limit)
- Use faster models (Gemma 4B instead of 27B)

---

## Performance Optimization

### Backend

1. **Database Connection Pooling**
   ```python
   engine = create_async_engine(
       database_url,
       pool_size=10,
       max_overflow=20
   )
   ```

2. **LLM Response Caching**
   ```python
   @lru_cache(maxsize=128)
   def get_cached_response(prompt_hash):
       # ...
   ```

3. **ChromaDB Batch Queries**
   ```python
   collection.query(query_texts=batch, n_results=5)
   ```

### Frontend

1. **Code Splitting**
   ```typescript
   const AgentModeView = lazy(() => import('./features/agent-mode/AgentModeView'));
   ```

2. **Memoization**
   ```typescript
   const MemoizedMessage = React.memo(MessageBubble);
   ```

3. **Virtual Scrolling** (for long message lists)
   ```bash
   npm install react-window
   ```

---

## Security Best Practices

1. **API Keys** - Never commit to git, use `.env.local`
2. **JWT Secrets** - Minimum 32 characters, rotate regularly
3. **File Uploads** - Validate MIME types, limit file size (10MB)
4. **SQL Injection** - Use SQLAlchemy ORM, not raw queries
5. **XSS** - Sanitize markdown output, use `dangerouslySetInnerHTML` carefully
6. **CORS** - Whitelist specific origins, not `["*"]`
7. **Rate Limiting** - Implement per-IP rate limits
8. **Input Validation** - Validate all user inputs (Pydantic models)

---

## License

MIT License - See LICENSE file for details.

---

## Support

- **GitHub Issues:** https://github.com/your-repo/ahri-v3/issues
- **Discord:** (If available)
- **Email:** your-email@example.com

---

**Last Updated:** 2026-02-10
**Maintainers:** Your Team
**Version:** 3.0.0
