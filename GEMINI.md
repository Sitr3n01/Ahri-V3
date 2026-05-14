# Ahri V3 - Context for Gemini/OpenCode
**Version:** 3.0.1 | **Updated:** 2026-02-11 | **Status:** Production Ready

> Agent rule source: read `AGENTS.md` first. This file adds model-specific
> context, but organizational, scalability, hygiene, and quality-gate
> requirements live in `AGENTS.md`.

---

## Project Summary

Ahri is an AI companion with 17 anime personas, 3-layer memory, Spotify integration, multi-LLM support, and Japanese teaching. V3 is a full rewrite from V2 (Python/Streamlit) to a monorepo: FastAPI backend + Electron desktop + PWA mobile.

**V2:** `C:\Users\zegil\Documents\GitHub\Ahri V2\Ahri\`
**V3:** `C:\Users\zegil\Documents\GitHub\Ahri V3\`

---

## Architecture

```
packages/
  backend/     Python FastAPI (port 8742) - 9 routers, 10 services, 8 workers
  desktop/     Electron 33 + React 19 + TS + Vite 6 + Tailwind + Zustand 5
  web/         PWA Mobile (React 19 + Vite 6 + Tailwind + Zustand 5)
  shared/      @ahri/shared - TS types, 17 persona themes, API client
```

---

## Backend (packages/backend/src/)

### LLM Service (`services/llm_service.py`)
- **4 modes:** PRO (gemini-2.5-pro-preview), GOOGLE (Gemma 3 27B), DEEPSEEK (DeepSeek R1), LOCAL (Ollama)
- `set_mode("PRO"|"GOOGLE"|"DEEPSEEK"|"LOCAL")` before generating
- `generate_response(message, system_prompt, history, ...)` is a **SYNC generator** (yields str chunks)
- NEVER use `async for` with it - use `for chunk in llm.generate_response(...):`
- Does NOT accept a `model` parameter

### Workers (`services/workers/`)
All extend `BaseWorker(llm_service, worker_type, default_model)`:
- **RAGWorker** (GOOGLE) - ChromaDB vector search + synthesis
- **CodeWorker** (GOOGLE) - Code analysis, generation, execution
- **ShellWorker** (GOOGLE) - Shell commands, file operations
- **MemoryWorker** (GOOGLE) - Memory search across all layers
- **WebWorker** (GOOGLE) - URL fetch, scraping, summarization
- **VisionWorker** (PRO) - Image analysis via Gemini multimodal
- **BrowserWorker** (PRO) - Playwright browser automation
- **RouterWorker** (GOOGLE) - Task classification and routing

**Key methods:**
- `_call_llm(prompt, model=None, schema=None)` - model uses mode strings ("GOOGLE", "PRO"), NOT raw paths
- `_create_task_record(db, execution_id, input_data)` - creates DB record
- `_complete_task(db, task, output_data, ...)` / `_fail_task(db, task, error, ...)`

### Orchestrator (`services/orchestrator_service.py`)
- Plans task decomposition (function calling for PRO, prompt-based fallback)
- Executes workers with dependency graph (parallel when possible)
- Synthesizes final result from worker outputs
- TPM management (15k tokens/minute limit)

### Routers (9 total)
| Route | Purpose |
|-------|---------|
| `/auth` | JWT login (access 15min + refresh 7d) |
| `/chat` | Messages + WebSocket streaming (`/chat/ws`) |
| `/personas` | List/get/activate 17 personas |
| `/sessions` | CRUD for chat sessions |
| `/memory` | /memoria, /aprender, /esquecer |
| `/agent` | Single-agent task approval |
| `/agent-mode` | Multi-agent orchestration + WebSocket (`/agent-mode/ws/{id}`) |
| `/search` | Web search, lore search |
| `/spotify` | Current track, persona auto-switch |

### Database (SQLAlchemy async + SQLite)
12 tables: UserProfile, ChatSession, ChatMessage, PersonaMemory, SocialGraphEntry, EpisodicMemory, AgentTask, AgentExecution, AgentWorkerTask, TPMQuota, RagIngestionTracker, SearchQuota

---

## Frontend

### Desktop (packages/desktop/)
- 5 Zustand stores: auth, persona, chat, agent, agent-mode
- WebSocket streaming for chat and agent mode
- Electron: backend lifecycle, IPC, tray, auto-persona daemon
- Glassmorphism design system with 17 persona themes

### Web PWA (packages/web/)
- 3 Zustand stores: auth, persona, chat
- HTTP polling (no WebSocket streaming yet - TODO)
- PWA with service worker, offline-first, touch-optimized

### Shared (packages/shared/)
- TypeScript types matching backend Pydantic schemas
- `AhriApiClient` class with methods for all 9 routers
- 17 persona themes (CSS variables)

---

## Common Pitfalls

1. `generate_response()` is SYNC - use `for`, not `async for`
2. Worker model param uses mode strings ("GOOGLE"), not raw model paths ("gemini/gemma-3-27b-it")
3. Use `_create_task_record()`, not `_create_task()` (old name doesn't exist)
4. Zustand state: never `.push()` - always use `[...state.array, newItem]`
5. Import styles are mixed (absolute `from src.x` and relative `from ...x`) - both work

---

## Running

```bash
# Backend
cd packages/backend && python -m uvicorn src.main:app --host 0.0.0.0 --port 8742 --reload

# Desktop
cd packages/desktop && npm run dev

# Web
cd packages/web && npm run dev

# All at once (Turborepo)
npm run dev
```

---

## User Context
- Speaks Portuguese (pt-br)
- Code comments: English or Portuguese
- 17 anime-inspired personas with unique themes
- Single-user auth (password in .env)
- Japanese teaching at N5 level

---

## Debug & Fixes Log (2026-02-12)

### Backend
1. **Security:** Added API key masking in `llm_clients.py` logs.
2. **Security:** Added input validation for `rename_session` in `session_service.py`.
3. **Stability:** Added file size validation for base64 uploads in `chat.py`.
4. **Analysis:** Confirmed `TPMManager` race condition and WebSocket timeout were already fixed in previous versions.
5. **Critical Fix (Senior Audit):** Removed blocking `time.sleep(1)` in `base_worker.py` and replaced with `await asyncio.sleep(1)`.
6. **Critical Fix (Senior Audit):** Offloaded synchronous LLM generation loop in `base_worker.py` to a threadpool using `run_in_executor`, preventing event loop blocking during agent tasks.
7. **Performance (Senior Audit):** Offloaded synchronous `_process_save_tags` (which performs vector DB I/O) to a threadpool in `chat.py`'s `send_message` and `chat_websocket` endpoints.
8. **Observability:** Replaced swallowed exceptions (`pass`) with proper `logger.error` and `logger.warning` in `vector_service.py` and `chat.py`.

### Desktop
9. **Memory Leak:** Fixed `ChatWebSocket` in `websocket.ts` to clear event listeners on disconnect.
10. **Cleanup:** Added `stopAutoPersonaDaemon()` to `app.on('before-quit')` in `electron/main.ts`.
11. **Type Safety:** Added runtime type checks to IPC handlers in `electron/main.ts`.
12. **State Management:** Fixed duplicate message bug in `chat-store.ts` when falling back from WebSocket to HTTP by properly reverting optimistic updates.

### Web (PWA)
13. **Caching:** Added cache expiration (5 mins) for API requests in `vite.config.ts`.
14. **State:** Fixed race condition in `auth-store.ts` rehydration using `setTimeout`.
15. **API:** Added `refreshTokenManual` method to `AhriApiClient` and updated `auth-store.ts` to use it.
