"""
Google OAuth Router - Endpoints para autenticação OAuth 2.0 com Google.
Permite usar o plano Pro do Gemini com limites pessoais do usuário.
"""
import logging
import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from src.dependencies import AuthDep
from src.services.google_oauth_service import get_google_oauth_service

logger = logging.getLogger("ahri.oauth")

router = APIRouter()

# State token para CSRF protection
_oauth_state = ""

# HTML de sucesso para o callback
_SUCCESS_HTML = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Ahri - Google Connected</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #e0e0e0;
        }
        .card {
            text-align: center; padding: 3rem; border-radius: 1rem;
            background: rgba(255,255,255,0.05); backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1); max-width: 400px;
        }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin: 0.5rem 0; color: #a78bfa; }
        p { color: #94a3b8; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✓</div>
        <h1>Conectado com sucesso!</h1>
        <p>Sua conta Google foi vinculada ao Ahri.<br>
        Você pode fechar esta janela e voltar ao app.</p>
    </div>
</body>
</html>
"""

_ERROR_HTML = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Ahri - Erro OAuth</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #e0e0e0;
        }}
        .card {{
            text-align: center; padding: 3rem; border-radius: 1rem;
            background: rgba(255,255,255,0.05); backdrop-filter: blur(10px);
            border: 1px solid rgba(255,59,48,0.3); max-width: 400px;
        }}
        .icon {{ font-size: 4rem; margin-bottom: 1rem; }}
        h1 {{ font-size: 1.5rem; margin: 0.5rem 0; color: #ff6b6b; }}
        p {{ color: #94a3b8; line-height: 1.6; }}
        code {{ background: rgba(255,255,255,0.1); padding: 0.2rem 0.5rem; border-radius: 0.25rem; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✗</div>
        <h1>Erro na autenticação</h1>
        <p>{error}</p>
    </div>
</body>
</html>
"""


@router.get("/google/status")
async def get_oauth_status(auth: AuthDep):
    """Retorna o status da conexão OAuth do Google."""
    svc = get_google_oauth_service()
    return svc.get_status()


@router.get("/google/agent-status")
async def get_agent_oauth_status(auth: AuthDep):
    """Retorna status do OAuth específico para agent mode (TPM limit, modelos)."""
    svc = get_google_oauth_service()
    return svc.get_agent_status()


@router.get("/google/authorize")
async def initiate_oauth(auth: AuthDep):
    """Inicia o fluxo OAuth e retorna a URL de autorização."""
    global _oauth_state
    svc = get_google_oauth_service()

    if not svc.is_configured:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth não configurado. Defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET no arquivo .env do backend.",
        )

    _oauth_state = secrets.token_urlsafe(32)
    auth_url = svc.get_authorize_url(state=_oauth_state)
    return {"auth_url": auth_url, "state": _oauth_state}


@router.get("/google/callback", response_class=HTMLResponse)
async def oauth_callback(request: Request):
    """Callback do Google OAuth. Recebe o code via redirect do browser."""
    global _oauth_state

    error = request.query_params.get("error")
    if error:
        return HTMLResponse(_ERROR_HTML.format(error=f"Google retornou erro: <code>{error}</code>"))

    code = request.query_params.get("code")
    state = request.query_params.get("state")

    if not code:
        return HTMLResponse(_ERROR_HTML.format(error="Nenhum código de autorização recebido."))

    if state != _oauth_state:
        return HTMLResponse(_ERROR_HTML.format(error="State token inválido. Tente novamente pelo app."))

    svc = get_google_oauth_service()
    success = svc.exchange_code(code)

    if success:
        # Busca modelos disponíveis no plano
        svc.list_models()
        _oauth_state = ""
        return HTMLResponse(_SUCCESS_HTML)
    else:
        return HTMLResponse(_ERROR_HTML.format(error="Falha ao trocar código por tokens. Verifique os logs do backend."))


@router.post("/google/disconnect")
async def disconnect_oauth(auth: AuthDep):
    """Desconecta OAuth e revoga tokens."""
    svc = get_google_oauth_service()
    svc.revoke()
    return {"status": "disconnected"}


@router.get("/google/models")
async def list_oauth_models(auth: AuthDep):
    """Lista modelos disponíveis via OAuth."""
    svc = get_google_oauth_service()
    if not svc.is_connected:
        raise HTTPException(status_code=400, detail="Google OAuth not connected")
    models = svc.list_models()
    return {"models": models}
