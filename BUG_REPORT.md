# Ahri V3 - Bug Report & Code Quality Analysis
**Data:** 2026-02-10
**Análise:** Varredura completa do projeto

---

## 🔴 BUGS CRÍTICOS

### Backend (Python)

#### 1. **Race Condition em TPMManager**
**Arquivo:** `packages/backend/src/services/tpm_manager.py`
**Severidade:** ALTA
**Descrição:** O TPMManager usa uma lista compartilhada `self.token_usage` sem locks, o que pode causar race conditions em requisições concorrentes.

**Problema:**
```python
def request_tokens(self, tokens: int) -> float:
    now = time.time()
    self._cleanup_old_entries(now)  # Modifica self.token_usage
    current_usage = self.get_current_usage()  # Lê self.token_usage
    self.token_usage.append((now, tokens))  # Escreve em self.token_usage
```

**Solução:**
```python
import threading

class TPMManager:
    def __init__(self, limit_tpm: int = 15000):
        self.limit_tpm = limit_tpm
        self.window_seconds = 60
        self.token_usage: list[tuple[float, int]] = []
        self._lock = threading.Lock()  # ADICIONAR

    def request_tokens(self, tokens: int) -> float:
        with self._lock:  # PROTEGER SEÇÃO CRÍTICA
            now = time.time()
            self._cleanup_old_entries(now)
            # ... resto do código
```

---

#### 2. **WebSocket Polling Sem Timeout**
**Arquivo:** `packages/backend/src/routers/agent_mode.py:137`
**Severidade:** MÉDIA
**Descrição:** O loop de polling do WebSocket não tem timeout máximo, podendo rodar indefinidamente se o status nunca mudar.

**Problema:**
```python
while True:
    async for db_session in get_db():
        execution = await orchestrator.get_execution_status(db_session, execution_id)
        # ... checks status
        if execution.status in [AgentExecutionStatus.COMPLETED, ...]:
            return
        break
    await asyncio.sleep(0.5)  # Pode rodar para sempre!
```

**Solução:**
```python
MAX_POLL_TIME = 600  # 10 minutos
start_time = time.time()

while True:
    if time.time() - start_time > MAX_POLL_TIME:
        await websocket.send_json({
            "type": "error",
            "data": {"message": "Execution timeout"}
        })
        return
    # ... resto do código
```

---

#### 3. **SQL Injection Potencial em Session Queries**
**Arquivo:** `packages/backend/src/services/session_service.py:83`
**Severidade:** BAIXA (uso de SQLAlchemy ORM mitiga)
**Descrição:** Uso correto de parâmetros, mas falta validação de entrada.

**Recomendação:**
```python
async def rename_session(self, db: AsyncSession, session_id: int, new_title: str) -> ChatSession:
    # ADICIONAR validação
    if not new_title or len(new_title) > 200:
        raise ValueError("Invalid title")
    if not isinstance(session_id, int) or session_id <= 0:
        raise ValueError("Invalid session_id")
    # ... resto do código
```

---

#### 4. **Missing Error Handling em File Upload**
**Arquivo:** `packages/backend/src/routers/chat.py:128`
**Severidade:** MÉDIA
**Descrição:** Upload de arquivos não valida tipo MIME nem tamanho máximo.

**Problema:**
```python
@router.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    # Sem validação de tamanho ou tipo!
    file_urls = []
    for file in files:
        content = await file.read()  # Pode ser MUITO grande
```

**Solução:**
```python
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = ["image/", "video/", "application/pdf"]

@router.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    file_urls = []
    for file in files:
        # Validar tamanho
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large: {file.filename}")

        # Validar tipo MIME
        if not any(file.content_type.startswith(t) for t in ALLOWED_TYPES):
            raise HTTPException(400, f"Invalid file type: {file.content_type}")
```

---

#### 5. **Gemini API Key Exposure em Logs**
**Arquivo:** `packages/backend/src/core/llm_clients.py`
**Severidade:** MÉDIA
**Descrição:** Se houver erro, a API key pode vazar em stack traces.

**Recomendação:**
```python
def __init__(self, api_key: str):
    if not api_key:
        raise ValueError("API key is required")

    # Mascarar em logs
    self.api_key = api_key
    self._masked_key = f"{api_key[:8]}...{api_key[-4:]}"  # Adicionar

    # Usar em exception handlers
    logger.error(f"API error with key {self._masked_key}")
```

---

#### 6. **ChromaDB Collection Creation Race**
**Arquivo:** `packages/backend/src/services/vector_service.py:39`
**Severidade:** BAIXA
**Descrição:** Se duas requisições tentarem criar a mesma collection simultaneamente, pode falhar.

**Problema:**
```python
try:
    self.collection = self.client.get_collection(name=collection_name)
except:
    self.collection = self.client.create_collection(name=collection_name)
```

**Solução:**
```python
try:
    self.collection = self.client.get_collection(name=collection_name)
except:
    try:
        self.collection = self.client.create_collection(name=collection_name)
    except ValueError:  # Collection já existe (race)
        self.collection = self.client.get_collection(name=collection_name)
```

---

## 🟡 BUGS MÉDIOS

### Desktop (Electron/TypeScript)

#### 1. **Memory Leak em WebSocket Reconnection**
**Arquivo:** `packages/desktop/src/api/chat-websocket.ts:45`
**Severidade:** MÉDIA
**Descrição:** Listeners não são removidos em reconnect, acumulando memory leaks.

**Problema:**
```typescript
reconnect() {
    this.ws?.close();
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = this.handleMessage;  // Adiciona listener sem remover antigo
}
```

**Solução:**
```typescript
close() {
    if (this.ws) {
        this.ws.onmessage = null;  // Limpar listeners
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
        this.ws = null;
    }
}
```

---

#### 2. **Electron IPC Type Safety**
**Arquivo:** `packages/desktop/electron/main.ts:89`
**Severidade:** BAIXA
**Descrição:** IPC handlers não validam tipos dos parâmetros.

**Recomendação:**
```typescript
ipcMain.handle('agent:openFile', async (_, path: unknown) => {
    // ADICIONAR validação
    if (typeof path !== 'string' || !path) {
        throw new Error('Invalid path parameter');
    }
    // ... resto do código
});
```

---

#### 3. **Auto-Persona Daemon Resource Cleanup**
**Arquivo:** `packages/desktop/electron/main.ts:150`
**Severidade:** BAIXA
**Descrição:** Interval não é limpo ao fechar o app.

**Problema:**
```typescript
let autoPersonaInterval: NodeJS.Timeout | null = null;

ipcMain.handle('auto-persona:start', async () => {
    autoPersonaInterval = setInterval(() => {
        // Polling...
    }, 60000);
});

// FALTA cleanup em app.on('will-quit')
```

**Solução:**
```typescript
app.on('will-quit', () => {
    if (autoPersonaInterval) {
        clearInterval(autoPersonaInterval);
        autoPersonaInterval = null;
    }
});
```

---

### Web (PWA)

#### 1. **Service Worker Cache Invalidation**
**Arquivo:** `packages/web/vite.config.ts:45`
**Severidade:** BAIXA
**Descrição:** Cache de API pode servir dados stale.

**Problema:**
```typescript
{
    urlPattern: /^https?:\/\/localhost:8742\/.*$/i,
    handler: 'NetworkFirst',  // OK, mas sem cache expiration
}
```

**Solução:**
```typescript
{
    urlPattern: /^https?:\/\/localhost:8742\/.*$/i,
    handler: 'NetworkFirst',
    options: {
        cacheName: 'api-cache',
        expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 5  // ADICIONAR: 5 minutos max
        }
    }
}
```

---

#### 2. **Persist Middleware Race Condition**
**Arquivo:** `packages/web/src/stores/auth-store.ts:88`
**Severidade:** BAIXA
**Descrição:** `onRehydrateStorage` pode executar antes de tokens estarem prontos.

**Recomendação:**
```typescript
onRehydrateStorage: () => (state) => {
    if (state?.tokens.access && state?.tokens.refresh) {
        // ADICIONAR delay para garantir hydration completa
        setTimeout(() => {
            api.setTokens(state.tokens.access!, state.tokens.refresh!);
        }, 0);
    }
}
```

---

## 🟢 CODE QUALITY ISSUES

### 1. **Duplicated Code em Workers**
**Arquivos:** `packages/backend/src/services/workers/*.py`
**Descrição:** Todos os workers repetem lógica de error handling.

**Refatoração:**
```python
# Criar base worker class
class BaseWorker(ABC):
    async def execute_with_error_handling(self, input_data, db):
        try:
            return await self.execute(input_data, db)
        except Exception as e:
            logger.error(f"[{self.worker_type}] Error: {e}")
            return {"error": str(e), "worker": self.worker_type}

    @abstractmethod
    async def execute(self, input_data, db):
        pass
```

---

### 2. **Magic Numbers**
**Arquivos:** Vários
**Descrição:** Números hardcoded sem constantes.

**Exemplos:**
```python
# RUIM
await asyncio.sleep(0.5)  # Por que 0.5?
if len(content) > 10000:  # Magic number

# BOM
POLL_INTERVAL_SECONDS = 0.5
MAX_CONTENT_LENGTH = 10_000
```

---

### 3. **Missing Type Hints**
**Arquivo:** `packages/backend/src/services/spotify_service.py:42`
**Descrição:** Várias funções sem type hints.

**Antes:**
```python
def get_current_track(self):
    return self.sp.current_user_playing_track()
```

**Depois:**
```python
def get_current_track(self) -> dict | None:
    return self.sp.current_user_playing_track()
```

---

### 4. **Unused Imports**
**Arquivo:** `packages/desktop/src/App.tsx:7`
**Descrição:** Imports não utilizados aumentam bundle size.

**Verificar com:**
```bash
npm run lint
```

---

## 📊 SECURITY ISSUES

### 1. **CORS Configuration Too Permissive**
**Arquivo:** `packages/backend/src/main.py:22`
**Severidade:** MÉDIA
**Problema:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MUITO PERMISSIVO!
)
```

**Solução:**
```python
ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Desktop dev
    "http://localhost:5174",  # Web dev
    "http://localhost:3000",  # Mobile dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### 2. **Password in Environment Variable**
**Arquivo:** `packages/backend/.env.example`
**Severidade:** BAIXA
**Recomendação:** Documentar uso de hashing para senhas em produção.

---

### 3. **JWT Secret Weak**
**Arquivo:** `packages/backend/src/config.py:18`
**Recomendação:**
```python
# .env.example
JWT_SECRET_KEY=your-super-secret-key-min-32-chars-CHANGE-THIS-IN-PRODUCTION
# DEVE ter pelo menos 32 caracteres
```

---

## ✅ MELHORIAS RECOMENDADAS

### Performance

1. **Database Connection Pool**
   - Configurar max_overflow e pool_size no SQLAlchemy

2. **LLM Response Caching**
   - Cachear respostas idênticas por 5 minutos

3. **WebSocket Compression**
   - Ativar permessage-deflate

### Monitoring

1. **Structured Logging**
   - Usar `structlog` ao invés de `logging`

2. **Error Tracking**
   - Integrar Sentry para produção

3. **Health Checks**
   - Adicionar endpoint `/health` com checks de DB, ChromaDB, etc.

---

## 📝 TESTES PENDENTES

### Backend
- [ ] Testes de race condition em TPMManager
- [ ] Testes de WebSocket reconnection
- [ ] Testes de upload com arquivos grandes
- [ ] Testes de Agent Mode com dependências

### Frontend
- [ ] Testes de memory leak em stores
- [ ] Testes de PWA offline mode
- [ ] Testes de auto-persona daemon

---

## 🔧 PRIORIZAÇÃO

### CRÍTICO (Fazer Agora)
1. ✅ Adicionar lock em TPMManager
2. ✅ Adicionar timeout em WebSocket polling
3. ✅ Validar upload de arquivos

### MÉDIO (Próxima Sprint)
4. Limpar WebSocket listeners
5. Melhorar CORS config
6. Adicionar health checks

### BAIXO (Backlog)
7. Refatorar workers com base class
8. Adicionar type hints faltantes
9. Remover imports não utilizados

---

**Nota:** Esta análise foi feita com varredura automatizada + revisão manual.
Recomenda-se execução de testes de integração para validar correções.
