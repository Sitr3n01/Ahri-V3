"""
Provider/model capability inference.

This module keeps provider-specific reasoning knobs in one place so the rest of
the app can ask for a model profile instead of hardcoding "Gemini Lite",
"DeepSeek", "Ollama", etc. It is intentionally pattern-based: new model IDs
from major providers should land in a safe default family without a code change,
and exact overrides can be supplied through MODEL_CAPABILITIES_OVERRIDES.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field, replace
from typing import Any


ReasoningControl = str


@dataclass(frozen=True)
class ReasoningSpec:
    control: ReasoningControl = "none"
    levels: tuple[str, ...] = ()
    default_level: str = "off"
    budget_tokens: dict[str, int] = field(default_factory=dict)
    supports_off: bool = True
    notes: str = ""


@dataclass(frozen=True)
class ModelCapabilityProfile:
    model_id: str
    provider: str
    provider_family: str
    group: str
    display_name: str
    is_local: bool = False
    supports_vision: bool = False
    supports_tools: bool = True
    supports_thinking: bool = False
    supports_streaming: bool = True
    supports_json_mode: bool = True
    input_token_limit: int = 128000
    output_token_limit: int = 8192
    color: str = "#8B5CF6"
    description: str = ""
    reasoning: ReasoningSpec = field(default_factory=ReasoningSpec)
    capability_source: str = "inferred"


_COLORS = {
    "google_gemini": "#3B82F6", "google_gemma": "#8B5CF6", "openrouter": "#10B981", "ollama": "#F97316",
    "openai": "#111827", "anthropic": "#A16207", "deepseek": "#2563EB", "alibaba_qwen": "#F59E0B",
    "moonshot_kimi": "#7C3AED", "zhipu_glm": "#0EA5E9", "xai": "#111827", "mistral": "#F97316", "groq": "#EF4444",
}

_PROVIDER_FAMILIES = {
    "openai": "openai", "anthropic": "anthropic", "claude": "anthropic",
    "google": "google_gemini", "google_gemini": "google_gemini", "gemini": "google_gemini",
    "google_gemma": "google_gemma", "gemma": "google_gemma", "deepseek": "deepseek",
    "alibaba": "alibaba_qwen", "qwen": "alibaba_qwen", "moonshot": "moonshot_kimi", "moonshotai": "moonshot_kimi", "kimi": "moonshot_kimi",
    "zhipu": "zhipu_glm", "z-ai": "zhipu_glm", "glm": "zhipu_glm", "x-ai": "xai", "xai": "xai", "grok": "xai",
    "mistral": "mistral", "mistralai": "mistral", "groq": "groq", "ollama": "ollama",
    "minimax": "minimax", "baidu": "baidu_ernie", "ernie": "baidu_ernie", "tencent": "tencent_hunyuan", "hunyuan": "tencent_hunyuan",
}

_OPENAI_REASONING_LEVELS = ("none", "minimal", "low", "medium", "high", "xhigh")
_STANDARD_LEVELS = ("off", "low", "medium", "high")
_GEMINI_3_LEVELS = ("minimal", "low", "medium", "high")
_BUDGETS = {"low": 1024, "medium": 8192, "high": 24576}
_ANTHROPIC_BUDGETS = {"low": 1024, "medium": 4096, "high": 10000}
_QWEN_BUDGETS = {"low": 1024, "medium": 4096, "high": 16384}


def normalize_model_id(model_id: str) -> str:
    model = (model_id or "").strip()
    if model.startswith("models/"):
        return model.removeprefix("models/")
    return model


def provider_family_from_id(model_id: str, provider_hint: str = "") -> str:
    hint = (provider_hint or "").strip().lower()
    if hint in _PROVIDER_FAMILIES:
        return _PROVIDER_FAMILIES[hint]

    model = normalize_model_id(model_id).lower()
    vendor = model.split("/", 1)[0] if "/" in model else ""
    if vendor in _PROVIDER_FAMILIES:
        return _PROVIDER_FAMILIES[vendor]

    if model.startswith("gemini-"):
        return "google_gemini"
    if model.startswith("gemma-"):
        return "google_gemma"
    if model.startswith(("gpt-", "o1", "o3", "o4", "o5")):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    if model.startswith("deepseek-") or "deepseek" in model:
        return "deepseek"
    if model.startswith(("qwen", "qwq")) or "qwen" in model:
        return "alibaba_qwen"
    if model.startswith("grok-") or "grok" in model:
        return "xai"
    if model.startswith("kimi-") or "kimi" in model:
        return "moonshot_kimi"
    if model.startswith("glm-") or "glm" in model:
        return "zhipu_glm"
    if ":" in model and "/" not in model:
        return "ollama"
    return "custom_openai_compatible" if "/" in model else "ollama"


def resolve_chat_model_alias(model: str, settings: Any) -> tuple[str, str]:
    """Return (actual_model_id, provider_hint) for chat aliases and raw IDs."""
    selected = (model or "LITE").strip()
    aliases = {
        "PRO": (getattr(settings, "google_model_pro", "gemini-2.5-pro"), "google_gemini"),
        "GOOGLE": (getattr(settings, "google_model_flash", "gemini-2.5-flash"), "google_gemini"),
        "FLASH": (getattr(settings, "google_model_flash", "gemini-2.5-flash"), "google_gemini"),
        "LITE": (getattr(settings, "google_model_lite", "gemini-3.1-flash-lite-preview"), "google_gemini"),
        "DEEPSEEK": (getattr(settings, "openrouter_model_name", "deepseek/deepseek-r1:free"), "openrouter"),
        "LOCAL": (getattr(settings, "ollama_chat_model", "gpt-oss:20b"), "ollama"),
    }
    if selected in aliases:
        return aliases[selected]
    if selected.startswith(("gemini-", "models/gemini-")):
        return normalize_model_id(selected), "google_gemini"
    if selected.startswith(("gemma-", "models/gemma-")):
        return normalize_model_id(selected), "google_gemma"
    if "/" in selected:
        return selected, "openrouter"
    return selected, "ollama"


def parse_capability_overrides(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _humanize_model_id(model_id: str) -> str:
    name = normalize_model_id(model_id).split("/")[-1]
    name = re.sub(r"[:_-]+", " ", name).strip()
    return " ".join(part.upper() if part in {"r1", "v3"} else part.capitalize() for part in name.split())


def _openrouter_source(model_id: str) -> str:
    model = normalize_model_id(model_id)
    return model.split("/", 1)[0].title() if "/" in model else "OpenRouter"


def _reasoning(control: str, levels: tuple[str, ...], default: str, budgets: dict[str, int] | None = None, supports_off: bool = True) -> ReasoningSpec:
    return ReasoningSpec(
        control=control,
        levels=levels,
        default_level=default,
        budget_tokens=budgets or {},
        supports_off=supports_off,
    )


def _base_profile(model_id: str, provider_hint: str) -> ModelCapabilityProfile:
    family = provider_family_from_id(model_id, provider_hint)
    provider = provider_hint or family
    if provider == "gemini":
        provider = "google_gemini"
    color_key = "openrouter" if provider == "openrouter" else family
    return ModelCapabilityProfile(
        model_id=normalize_model_id(model_id),
        provider=provider,
        provider_family=family,
        group=provider,
        display_name=_humanize_model_id(model_id),
        color=_COLORS.get(color_key, "#8B5CF6"),
        description=f"{family.replace('_', ' ').title()} - {normalize_model_id(model_id)}",
    )


def infer_model_capabilities(
    model_id: str,
    provider_hint: str = "",
    *,
    display_name: str | None = None,
    is_local: bool | None = None,
    vision_patterns: str = "",
    overrides: dict[str, Any] | None = None,
) -> ModelCapabilityProfile:
    model = normalize_model_id(model_id)
    lower = model.lower()
    profile = _base_profile(model, provider_hint)
    family = profile.provider_family

    if family == "google_gemini":
        input_limit = 1048576 if any(v in lower for v in ("2.5", "3-")) else 128000
        if "lite" in lower:
            input_limit = 262144
        supports_vision = "lite" not in lower
        if "gemini-3" in lower or "3." in lower:
            reasoning = _reasoning("thinking_level", _GEMINI_3_LEVELS, "high", supports_off=False)
        elif "2.5" in lower:
            supports_off = "pro" not in lower
            levels = _STANDARD_LEVELS if supports_off else ("low", "medium", "high")
            default = "off" if "lite" in lower else "medium"
            reasoning = _reasoning("thinking_budget", levels, default, _BUDGETS, supports_off=supports_off)
        else:
            reasoning = ReasoningSpec()
        profile = replace(
            profile,
            provider="google_gemini",
            group="google_gemini",
            display_name=display_name or _humanize_model_id(model).replace("Gemini", "Gemini"),
            supports_vision=supports_vision,
            supports_thinking=reasoning.control != "none",
            input_token_limit=input_limit,
            output_token_limit=65536 if "pro" in lower or "flash" in lower else 8192,
            color=_COLORS["google_gemini"],
            description=f"Google Gemini - {model}",
            reasoning=reasoning,
        )

    elif family == "google_gemma":
        profile = replace(
            profile,
            provider="google_gemma",
            group="google_gemma",
            display_name=display_name or _humanize_model_id(model),
            supports_vision=not any(v in lower for v in ("text", "it-only")),
            supports_thinking=False,
            input_token_limit=262144,
            output_token_limit=8192,
            color=_COLORS["google_gemma"],
            description=f"Google Gemma - {model}",
            reasoning=ReasoningSpec(),
        )

    elif profile.provider == "openrouter" or provider_hint == "openrouter":
        reasoning = ReasoningSpec()
        if family in {"openai", "xai"}:
            reasoning = _reasoning("effort", _OPENAI_REASONING_LEVELS, "medium")
        elif family in {"anthropic", "google_gemini"}:
            reasoning = _reasoning("budget_tokens", _STANDARD_LEVELS, "medium", _ANTHROPIC_BUDGETS)
        elif family == "alibaba_qwen":
            reasoning = _reasoning("budget_tokens", _STANDARD_LEVELS, "medium", _QWEN_BUDGETS)
        elif any(token in lower for token in ("reason", "thinking", "r1", "qwq", "k2")):
            reasoning = _reasoning("effort", _OPENAI_REASONING_LEVELS, "medium")
        profile = replace(
            profile,
            provider="openrouter",
            group="openrouter",
            display_name=display_name or _humanize_model_id(model),
            supports_vision=any(token in lower for token in ("vision", "vl", "omni", "multimodal")),
            supports_thinking=reasoning.control != "none",
            input_token_limit=200000 if family == "anthropic" else 128000,
            output_token_limit=8192,
            color=_COLORS["openrouter"],
            description=f"{_openrouter_source(model)} - {model}",
            reasoning=reasoning,
        )

    elif family == "openai":
        reasoning = _reasoning("effort", _OPENAI_REASONING_LEVELS, "medium")
        profile = replace(
            profile,
            provider="openai",
            group="openai",
            supports_vision=not any(token in lower for token in ("text", "audio")),
            supports_thinking=lower.startswith(("gpt-5", "o")),
            input_token_limit=400000 if lower.startswith("gpt-5") else 128000,
            color=_COLORS["openai"],
            reasoning=reasoning if lower.startswith(("gpt-5", "o")) else ReasoningSpec(),
        )

    elif family == "anthropic":
        adaptive = any(v in lower for v in ("4-6", "4.6", "4-7", "4.7", "mythos"))
        reasoning = _reasoning("adaptive_effort" if adaptive else "budget_tokens", _STANDARD_LEVELS, "medium", _ANTHROPIC_BUDGETS)
        profile = replace(
            profile,
            provider="anthropic",
            group="anthropic",
            supports_vision="haiku" not in lower,
            supports_thinking=True,
            input_token_limit=200000,
            output_token_limit=64000 if "sonnet" in lower or "haiku" in lower else 128000,
            color=_COLORS["anthropic"],
            reasoning=reasoning,
        )

    elif family == "deepseek":
        reasoning = _reasoning("native_trace", (), "medium")
        profile = replace(
            profile,
            provider="deepseek",
            group="deepseek",
            supports_thinking="reasoner" in lower or "r1" in lower,
            supports_vision=False,
            input_token_limit=128000,
            color=_COLORS["deepseek"],
            reasoning=reasoning if "reasoner" in lower or "r1" in lower else ReasoningSpec(),
        )

    elif family == "alibaba_qwen":
        supports_thinking = any(token in lower for token in ("qwen3", "qwq", "thinking", "reason"))
        profile = replace(
            profile,
            provider="alibaba_qwen",
            group="alibaba_qwen",
            supports_thinking=supports_thinking,
            supports_vision=any(token in lower for token in ("vl", "vision", "omni")),
            color=_COLORS["alibaba_qwen"],
            reasoning=_reasoning("budget_tokens", _STANDARD_LEVELS, "medium", _QWEN_BUDGETS) if supports_thinking else ReasoningSpec(),
        )

    elif family == "ollama":
        has_vision = _matches_vision_pattern(model, vision_patterns)
        profile = replace(
            profile,
            provider="ollama",
            group="ollama",
            is_local=True,
            supports_tools=False,
            supports_vision=has_vision,
            supports_thinking=True,
            input_token_limit=32768,
            output_token_limit=8192,
            color=_COLORS["ollama"],
            description=f"Local - {model}",
            reasoning=_reasoning("boolean", ("off", "on"), "off"),
        )

    else:
        supports_thinking = any(token in lower for token in ("reason", "thinking", "r1", "qwq"))
        profile = replace(
            profile,
            supports_thinking=supports_thinking,
            reasoning=_reasoning("effort", _OPENAI_REASONING_LEVELS, "medium") if supports_thinking else ReasoningSpec(),
        )

    if is_local is not None:
        profile = replace(profile, is_local=is_local)
    if display_name:
        profile = replace(profile, display_name=display_name)

    return _apply_overrides(profile, overrides or {})


def _matches_vision_pattern(model_id: str, patterns: str) -> bool:
    lower = model_id.lower()
    for pattern in patterns.split(","):
        pattern = pattern.strip().lower()
        if pattern and pattern in lower:
            return True
    return False


def _apply_overrides(profile: ModelCapabilityProfile, overrides: dict[str, Any]) -> ModelCapabilityProfile:
    if not overrides:
        return profile
    model_overrides = overrides.get("models", {})
    family_overrides = overrides.get("families", {})
    provider_overrides = overrides.get("providers", {})
    merged: dict[str, Any] = {}

    for key in (
        profile.provider,
        profile.provider_family,
    ):
        if isinstance(provider_overrides, dict) and isinstance(provider_overrides.get(key), dict):
            merged.update(provider_overrides[key])
        if isinstance(family_overrides, dict) and isinstance(family_overrides.get(key), dict):
            merged.update(family_overrides[key])

    if isinstance(model_overrides, dict):
        for key in (profile.model_id, profile.model_id.lower()):
            if isinstance(model_overrides.get(key), dict):
                merged.update(model_overrides[key])

    if not merged:
        return profile

    data = asdict(profile)
    reasoning_updates = merged.pop("reasoning", None)
    for key, value in merged.items():
        if key in data:
            data[key] = value

    reasoning_data = data.pop("reasoning")
    if isinstance(reasoning_updates, dict):
        reasoning_data.update(reasoning_updates)
    if "reasoning_control" in merged:
        reasoning_data["control"] = merged["reasoning_control"]
    if "reasoning_levels" in merged:
        reasoning_data["levels"] = tuple(merged["reasoning_levels"])
    else:
        reasoning_data["levels"] = tuple(reasoning_data.get("levels", ()))

    data["reasoning"] = ReasoningSpec(**reasoning_data)
    data["capability_source"] = "override"
    return ModelCapabilityProfile(**data)


def normalize_reasoning_level(level: str | None, spec: ReasoningSpec) -> str:
    raw = (level or spec.default_level or "off").strip().lower()
    aliases = {
        "on": spec.default_level or "medium",
        "true": spec.default_level or "medium",
        "false": "off",
        "disabled": "off",
        "disable": "off",
        "none": "none",
        "max": "xhigh",
        "extra": "xhigh",
    }
    normalized = aliases.get(raw, raw)
    if normalized == "off" and "none" in spec.levels:
        return "none"
    if normalized == "off" and not spec.supports_off:
        return "minimal" if "minimal" in spec.levels else spec.default_level
    if spec.levels and normalized not in spec.levels:
        if normalized == "none" and "off" in spec.levels:
            return "off"
        return spec.default_level or spec.levels[0]
    return normalized


def gemini_thinking_config_payload(model_id: str, reasoning_level: str | None) -> dict[str, Any] | None:
    profile = infer_model_capabilities(model_id, "google_gemini")
    spec = profile.reasoning
    if not profile.supports_thinking or spec.control == "none":
        return None
    level = normalize_reasoning_level(reasoning_level, spec)
    if spec.control == "thinking_level":
        return {"thinking_level": level}
    if spec.control == "thinking_budget":
        if level in {"off", "none"}:
            return {"thinking_budget": 0} if spec.supports_off else None
        return {"thinking_budget": spec.budget_tokens.get(level, spec.budget_tokens.get(spec.default_level, 8192))}
    return None


def openrouter_reasoning_extra(model_id: str, reasoning_level: str | None, *, enabled: bool = True) -> dict[str, Any]:
    profile = infer_model_capabilities(model_id, "openrouter")
    spec = profile.reasoning
    if not enabled or not profile.supports_thinking or spec.control == "none":
        return {}
    level = normalize_reasoning_level(reasoning_level, spec)
    if level in {"off", "none"}:
        return {"reasoning": {"effort": "none", "exclude": True}}
    if spec.control == "budget_tokens":
        budget = spec.budget_tokens.get(level, spec.budget_tokens.get(spec.default_level, 4096))
        return {"reasoning": {"max_tokens": budget}}
    if spec.control in {"effort", "adaptive_effort"}:
        return {"reasoning": {"effort": level}}
    if spec.control == "native_trace":
        return {"reasoning": {"enabled": True}}
    return {}


def available_model_payload(
    selected_id: str,
    profile: ModelCapabilityProfile,
    *,
    actual_model_id: str | None = None,
) -> dict[str, Any]:
    spec = profile.reasoning
    return {
        "id": selected_id,
        "actual_model_id": actual_model_id or profile.model_id,
        "display_name": profile.display_name,
        "provider": profile.provider,
        "provider_family": profile.provider_family,
        "group": profile.group,
        "is_local": profile.is_local,
        "supports_vision": profile.supports_vision,
        "supports_thinking": profile.supports_thinking,
        "supports_tools": profile.supports_tools,
        "supports_json_mode": profile.supports_json_mode,
        "supports_streaming": profile.supports_streaming,
        "color": profile.color,
        "description": profile.description,
        "input_token_limit": profile.input_token_limit,
        "output_token_limit": profile.output_token_limit,
        "reasoning_control": spec.control,
        "reasoning_levels": list(spec.levels),
        "default_reasoning_level": spec.default_level,
        "reasoning_budget_tokens": spec.budget_tokens,
        "capability_source": profile.capability_source,
    }
