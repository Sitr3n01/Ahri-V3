"""
Settings: gerenciar configurações globais da aplicação (Environment Variables).
"""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic_settings import BaseSettings

from src.config import get_settings, Settings
from src.dependencies import AuthDep
from src.models.schemas import SettingsSchema, UpdateSettingsRequest, AvailableModelSchema

router = APIRouter()

@router.get("", response_model=SettingsSchema)
async def get_app_settings(auth: AuthDep):
    """Retorna as configurações atuais."""
    s = get_settings()
    
    return SettingsSchema(
        google_oauth_client_id=s.google_oauth_client_id,
        google_oauth_client_secret=s.google_oauth_client_secret,
        gemini_api_key_paid=s.gemini_api_key_paid,
        gemini_api_key_free=s.gemini_api_key_free,
        openrouter_api_key=s.openrouter_api_key,
        openrouter_model_name=s.openrouter_model_name,
        cse_api_key=s.cse_api_key,
        cse_cx=s.cse_cx,
        spotipy_client_id=s.spotipy_client_id,
        spotipy_client_secret=s.spotipy_client_secret,
        spotipy_redirect_uri=s.spotipy_redirect_uri,
        agent_mode_enabled=s.agent_mode_enabled,
        agent_mode_orchestrator=s.agent_mode_orchestrator,
        ollama_base_url=s.ollama_base_url,
        
        google_api_key_vision_a=s.google_api_key_vision_a,
        google_api_key_vision_b=s.google_api_key_vision_b,
        google_api_key_manager=s.google_api_key_manager,
        google_api_key_search=s.google_api_key_search,
        google_api_key_search_b=s.google_api_key_search_b,
        google_ai_studio_api_key=s.google_ai_studio_api_key,
        google_ai_studio_tpm_limit=s.google_ai_studio_tpm_limit,
        deepinfra_api_key=s.deepinfra_api_key,
        gh_token=s.gh_token,
        gist_id=s.gist_id,
    )

def _update_env_file(root_dir: Path, updates: dict):
    """Atualiza o arquivo .env preservando comentários."""
    env_path = root_dir / ".env"
    
    if not env_path.exists():
        # Create empty .env
        env_path.write_text("", encoding="utf-8")
        
    original_content = env_path.read_text(encoding="utf-8")
    lines = original_content.splitlines()
    
    # Simple parsing: We assume key=value format
    # We want to replace lines that start with specific keys.
    # To handle Pydantic's matching logic, we assume keys are UPPER_CASE in .env usually,
    # but could be anything.
    # The keys in `updates` are snake_case from SettingsSchema (e.g. gemini_api_key_paid)
    
    new_lines: list[str] = []
    
    # Track which keys we have processed/replaced in the file
    processed_keys = set()
    
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
            
        if "=" not in stripped:
            new_lines.append(line)
            continue
            
        key_part, _ = stripped.split("=", 1)
        key_part = key_part.strip()
        
        # Check if this key corresponds to one of our updates
        match_key = None
        for update_key, update_val in updates.items():
            # Check for exact match or UPPER CASE match
            if key_part == update_key or key_part == update_key.upper():
                match_key = update_key
                break
        
        if match_key:
            # Replace value
            val = str(updates[match_key])
            # Basic quoting if spaces exist
            if " " in val and not (val.startswith("'") or val.startswith('"')):
                val = f'"{val}"'
            
            # Preserve the original key casing
            new_lines.append(f"{key_part}={val}")
            processed_keys.add(match_key)
        else:
            new_lines.append(line)
            
    # Append new keys that weren't found in the file
    for key, val in updates.items():
        if key not in processed_keys:
            # Add at end, convert to UPPER as convention for new vars
            env_key = key.upper()
            val_str = str(val)
            if " " in val_str and not (val_str.startswith("'") or val_str.startswith('"')):
                val_str = f'"{val_str}"'
            new_lines.append(f"{env_key}={val_str}")
            
    env_path.write_text("\n".join(new_lines), encoding="utf-8")


@router.post("")
async def update_app_settings(request: UpdateSettingsRequest, auth: AuthDep):
    """Atualiza configurações e recarrega serviços."""
    updates = request.settings
    
    # Get current settings to find root dir
    current_settings = get_settings()
    root_dir = current_settings.root_dir

    # 1. Update .env file
    try:
        _update_env_file(root_dir, updates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update .env: {e}")
        
    # 2. Force settings reload
    # Clear lru_cache for get_settings
    get_settings.cache_clear()
    
    # 3. Reload LLM Service clients
    from src.services.llm_service import get_llm_service
    llm_svc = get_llm_service()
    
    # Update the settings reference
    llm_svc.settings = get_settings() 
    # Re-initialize clients
    llm_svc._init_clients()
    
    return {"status": "updated", "detail": "Settings saved and services reloaded"}


# Cores padrão por provider
_PROVIDER_COLORS = {
    "google_oauth": "#8B5CF6",
    "google_apikey": "#3B82F6",
    "openrouter": "#10B981",
    "ollama": "#F97316",
}

# Cores específicas por modelo (para modelos comuns)
_MODEL_COLORS = {
    "gemini-2.5-pro": "#8B5CF6",
    "gemini-2.5-flash": "#06B6D4",
    "gemini-2.0-flash": "#3B82F6",
    "gemini-2.0-flash-lite": "#60A5FA",
    "gemini-1.5-pro": "#A78BFA",
    "gemini-1.5-flash": "#67E8F9",
    "gemma-3-27b-it": "#2563EB",
}


@router.get("/models/available", response_model=list[AvailableModelSchema])
async def get_available_models(auth: AuthDep):
    """Retorna lista dinâmica de modelos disponíveis."""
    from src.services.google_oauth_service import get_google_oauth_service
    from src.services.llm_service import get_llm_service

    models: list[AvailableModelSchema] = []
    oauth_svc = get_google_oauth_service()
    llm_svc = get_llm_service()
    s = get_settings()

    # 1. Modelos via OAuth (prioridade)
    if oauth_svc.is_connected:
        oauth_models = oauth_svc.list_models()
        for m in oauth_models:
            model_id = m["id"]
            models.append(AvailableModelSchema(
                id=model_id,
                display_name=m.get("display_name", model_id),
                provider="google_oauth",
                color=_MODEL_COLORS.get(model_id, _PROVIDER_COLORS["google_oauth"]),
                description=m.get("description", ""),
                input_token_limit=m.get("input_token_limit", 0),
                output_token_limit=m.get("output_token_limit", 0),
            ))
    else:
        # 2. Modelos via API key (fallback)
        if s.gemini_primary_key:
            models.append(AvailableModelSchema(
                id="PRO",
                display_name="Gemini Pro",
                provider="google_apikey",
                color=_MODEL_COLORS.get("gemini-2.5-pro", "#8B5CF6"),
            ))
        if s.gemini_fallback_key:
            models.append(AvailableModelSchema(
                id="GOOGLE",
                display_name="Gemma 27B",
                provider="google_apikey",
                color=_MODEL_COLORS.get("gemma-3-27b-it", "#3B82F6"),
            ))

    # 3. OpenRouter (sempre disponível se configurado)
    if s.openrouter_api_key:
        models.append(AvailableModelSchema(
            id="DEEPSEEK",
            display_name="DeepSeek R1",
            provider="openrouter",
            color=_PROVIDER_COLORS["openrouter"],
        ))

    # 4. Ollama (sempre disponível)
    models.append(AvailableModelSchema(
        id="LOCAL",
        display_name="Ollama Local",
        provider="ollama",
        color=_PROVIDER_COLORS["ollama"],
    ))

    return models
