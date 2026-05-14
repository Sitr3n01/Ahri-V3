"""
Settings: gerenciar configurações globais da aplicação (Environment Variables).
"""
import os
import logging
from pathlib import Path
from typing import List, Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic_settings import BaseSettings
from pydantic import BaseModel, Field

from google import genai
from src.config import get_settings, Settings
from src.core.model_capabilities import (
    available_model_payload,
    infer_model_capabilities,
    parse_capability_overrides,
)
from src.dependencies import AuthDep
from src.models.schemas import (
    SettingsSchema,
    UpdateSettingsRequest,
    AvailableModelSchema,
    GoogleModelInfo,
    GoogleModelCheckResponse
)

router = APIRouter()
logger = logging.getLogger("ahri.settings")

@router.get("", response_model=SettingsSchema)
async def get_app_settings(auth: AuthDep):
    """Retorna as configurações atuais."""
    s = get_settings()
    
    return SettingsSchema(
        gemini_api_key_paid=s.gemini_api_key_paid,
        gemini_api_key_free=s.gemini_api_key_free,
        openrouter_api_key=s.openrouter_api_key,
        openrouter_model_name=s.openrouter_model_name,
        model_capabilities_overrides=s.model_capabilities_overrides,
        google_model_pro=s.google_model_pro,
        google_model_flash=s.google_model_flash,
        google_model_lite=s.google_model_lite,
        google_model_vision=s.google_model_vision,
        google_model_search=s.google_model_search,
        google_model_memory=s.google_model_memory,
        ollama_chat_model=s.ollama_chat_model,
        ollama_vision_patterns=s.ollama_vision_patterns,
        gemma4_enabled=s.gemma4_enabled,
        gemma4_model_31b=s.gemma4_model_31b,
        gemma4_model_26b=s.gemma4_model_26b,
        cse_api_key=s.cse_api_key,
        cse_cx=s.cse_cx,
        spotipy_client_id=s.spotipy_client_id,
        spotipy_client_secret=s.spotipy_client_secret,
        spotipy_redirect_uri=s.spotipy_redirect_uri,
        ollama_base_url=s.ollama_base_url,

        google_api_key_vision_a=s.google_api_key_vision_a,
        google_api_key_vision_b=s.google_api_key_vision_b,
        google_api_key_manager=s.google_api_key_manager,
        google_api_key_search=s.google_api_key_search,
        google_api_key_search_b=s.google_api_key_search_b,
        google_ai_studio_api_key=s.google_ai_studio_api_key,
        deepinfra_api_key=s.deepinfra_api_key,
        gh_token=s.gh_token,
        gist_id=s.gist_id,
        compaction_threshold=s.compaction_threshold,
        compaction_recent_window=s.compaction_recent_window,
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
            
    logger.info(f"Updating .env at {env_path} with {len(updates)} keys: {list(updates.keys())}")
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
        print(f"CRITICAL: Failed to update .env: {e}")
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


# ── Color palettes ────────────────────────────────────────────────────────────
_GEMINI_COLOR = "#3B82F6"
_GEMMA_COLOR  = "#8B5CF6"
_OR_COLOR     = "#10B981"
_OLLAMA_COLOR = "#F97316"


def _capability_overrides(settings: Settings) -> dict[str, Any]:
    return parse_capability_overrides(settings.model_capabilities_overrides)


def _profile_to_schema(
    selected_id: str,
    model_id: str,
    provider_hint: str,
    settings: Settings,
    **kwargs: Any,
) -> AvailableModelSchema:
    profile = infer_model_capabilities(
        model_id,
        provider_hint,
        vision_patterns=settings.ollama_vision_patterns,
        overrides=_capability_overrides(settings),
        **kwargs,
    )
    return AvailableModelSchema(**available_model_payload(selected_id, profile, actual_model_id=model_id))


def _is_vision_ollama_model(model_name: str, patterns: str) -> bool:
    """Returns True if the Ollama model name matches any known vision pattern."""
    name_lower = model_name.lower()
    for pat in patterns.split(","):
        pat = pat.strip().lower()
        if pat and pat in name_lower:
            return True
    return False


async def _fetch_ollama_models(base_url: str, vision_patterns: str, settings: Settings) -> list[AvailableModelSchema]:
    """Query Ollama /api/tags and return installed models as AvailableModelSchema list."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.debug(f"Ollama not reachable at {base_url}: {e}")
        return []

    result: list[AvailableModelSchema] = []
    for m in data.get("models", []):
        name: str = m.get("name", "")
        if not name:
            continue
        details = m.get("details", {})
        family = details.get("family", "")
        param_size = details.get("parameter_size", "")
        # Friendly label: "gemma4:e4b (4.5B)" or just "gemma4:e4b"
        label = f"{name} ({param_size})" if param_size else name
        description = f"Local - {family or 'ollama'}" + (f" - {param_size}" if param_size else "")
        result.append(
            _profile_to_schema(
                name,
                name,
                "ollama",
                settings,
                display_name=label,
                is_local=True,
            ).model_copy(update={"description": description})
        )
        continue
        result.append(AvailableModelSchema(
            id=name,
            actual_model_id=name,
            display_name=label,
            provider="ollama",
            provider_family="ollama",
            group="ollama",
            is_local=True,
            supports_vision=_is_vision_ollama_model(name, vision_patterns),
            supports_thinking=True,  # Most modern Ollama models support thinking mode
            supports_tools=False,
            color=_OLLAMA_COLOR,
            reasoning_control="boolean",
            reasoning_levels=["off", "on"],
            default_reasoning_level="off",
            description=f"Local · {family or 'ollama'}" + (f" · {param_size}" if param_size else ""),
        ))
    return result


@router.get("/models/available", response_model=list[AvailableModelSchema])
async def get_available_models(auth: AuthDep):
    """Retorna lista dinâmica de modelos disponíveis para chat.

    - Gemini Flash Lite / Flash / Pro: estáticos, IDs configuráveis via .env
    - Gemma 4: estáticos, habilitados via gemma4_enabled=True
    - OpenRouter: apenas o modelo configurado, se api_key presente
    - Ollama: dinâmico — consulta GET /api/tags no servidor Ollama local
    """
    s = get_settings()
    models: list[AvailableModelSchema] = []

    if s.gemini_primary_key:
        models.append(_profile_to_schema(
            "LITE",
            s.google_model_lite,
            "google_gemini",
            s,
            display_name="Gemini Flash Lite",
        ))

    if s.gemma4_enabled and s.gemini_primary_key:
        models.append(_profile_to_schema(
            s.gemma4_model_31b,
            s.gemma4_model_31b,
            "google_gemma",
            s,
            display_name="Gemma 4 31B",
        ))
        models.append(_profile_to_schema(
            s.gemma4_model_26b,
            s.gemma4_model_26b,
            "google_gemma",
            s,
            display_name="Gemma 4 26B (MoE)",
        ))

    if s.openrouter_api_key and s.openrouter_model_name:
        models.append(_profile_to_schema("DEEPSEEK", s.openrouter_model_name, "openrouter", s))

    models.extend(await _fetch_ollama_models(s.ollama_base_url, s.ollama_vision_patterns, s))
    return models

    # ── 1. Google Gemini models ───────────────────────────────────────────────
    if s.gemini_primary_key:
        models.append(AvailableModelSchema(
            id="LITE",
            display_name="Gemini Flash Lite",
            provider="google_gemini",
            group="google_gemini",
            is_local=False,
            supports_vision=False,
            supports_thinking=True,
            color="#60A5FA",
            description="Rápido · barato",
            input_token_limit=262144,
        ))

    # ── 2. Gemma 4 cloud models (Google AI Studio — mesma API key) ────────────
    if s.gemma4_enabled and s.gemini_primary_key:
        models.append(AvailableModelSchema(
            id=s.gemma4_model_31b,
            display_name="Gemma 4 31B",
            provider="google_gemma",
            group="google_gemma",
            is_local=False,
            supports_vision=True,
            supports_thinking=True,
            color=_GEMMA_COLOR,
            description="Cloud · 31B · visão · 256K ctx",
            input_token_limit=262144,
        ))
        models.append(AvailableModelSchema(
            id=s.gemma4_model_26b,
            display_name="Gemma 4 26B (MoE)",
            provider="google_gemma",
            group="google_gemma",
            is_local=False,
            supports_vision=True,
            supports_thinking=True,
            color="#A78BFA",
            description="Cloud · MoE · visão · 256K ctx",
            input_token_limit=262144,
        ))

    # ── 3. OpenRouter (apenas o modelo configurado) ───────────────────────────
    if s.openrouter_api_key and s.openrouter_model_name:
        model_name = s.openrouter_model_name
        # Derive a friendly display name from the model ID
        parts = model_name.split("/")
        display = parts[-1].replace(":", " ").replace("-", " ").title() if parts else model_name
        provider_label = parts[0].title() if len(parts) > 1 else "OpenRouter"
        models.append(AvailableModelSchema(
            id="DEEPSEEK",  # Keep alias for backward compat with SpeedModeSelector
            display_name=display,
            provider="openrouter",
            group="openrouter",
            is_local=False,
            supports_vision=False,
            supports_thinking=True,
            color=_OR_COLOR,
            description=f"{provider_label} · {model_name}",
        ))

    # ── 4. Ollama local models (dynamic) ─────────────────────────────────────
    ollama_models = await _fetch_ollama_models(s.ollama_base_url, s.ollama_vision_patterns)
    models.extend(ollama_models)

    return models


@router.post("/models/ollama/refresh", response_model=list[AvailableModelSchema])
async def refresh_ollama_models(auth: AuthDep):
    """Re-queries Ollama API and returns updated model list (no auth cache needed)."""
    s = get_settings()
    return await _fetch_ollama_models(s.ollama_base_url, s.ollama_vision_patterns, s)


class GoogleModelCheckRequest(BaseModel):
    api_key: str | None = None


@router.post("/check-google-models", response_model=GoogleModelCheckResponse)
async def check_google_models(request: GoogleModelCheckRequest, auth: AuthDep):
    """Lista modelos disponíveis do Google para a chave fornecida."""
    api_key = request.api_key
    
    if not api_key:
        s = get_settings()
        api_key = s.gemini_api_key_paid or s.gemini_api_key_free or s.google_ai_studio_api_key
        
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key is required or must be configured.")
        
    try:
        client = genai.Client(api_key=api_key)
        # Lista modelos
        # O novo SDK retorna um iterador de objetos Model
        models_list = []
        for m in client.models.list():
            # Filtra apenas o que interessa (como no script V2)
            # No SDK novo (1.0+) o atributo é 'supported_actions'
            if m.supported_actions and 'generateContent' in m.supported_actions:
                models_list.append(GoogleModelInfo(
                    name=m.name,
                    display_name=m.display_name,
                    supported_generation_methods=m.supported_actions
                ))
        
        return GoogleModelCheckResponse(models=models_list)
    except Exception as e:
        logger.error(f"Error checking Google models: {e}")
        raise HTTPException(status_code=500, detail=f"Error connecting to Google: {str(e)}")
