"""
Model Registry - Resolve model aliases, manage fallbacks, rotate API keys.

Inspired by Claude Code's model.ts:
- Aliases: "fast" → "gemini-3.1-flash-lite-preview"
- Fallback chains: if model A fails → try model B
- Round-robin API key rotation for rate limit management

IMPORTANT: This replaces the set_mode() pattern from V3 LLMService.
"""
import logging
import asyncio
from typing import Optional
from collections import defaultdict

import httpx

from src.core.model_capabilities import infer_model_capabilities, parse_capability_overrides

from .types import ModelInfo, ModelCapabilities, LLMResponse
from .providers.base import LLMProvider
from .providers.gemini_provider import GeminiProvider
from .providers.ollama_provider import OllamaProvider
from .providers.openrouter_provider import OpenRouterProvider
from .errors import ProviderError, RateLimitError

logger = logging.getLogger("ahri.engine.registry")


def _engine_capabilities(model_id: str, provider_hint: str, settings=None, **kwargs) -> ModelCapabilities:
    overrides = parse_capability_overrides(getattr(settings, "model_capabilities_overrides", "")) if settings else {}
    profile = infer_model_capabilities(
        model_id,
        provider_hint,
        vision_patterns=getattr(settings, "ollama_vision_patterns", ""),
        overrides=overrides,
        **kwargs,
    )
    return ModelCapabilities(
        max_tokens=profile.output_token_limit,
        supports_tools=profile.supports_tools,
        supports_vision=profile.supports_vision,
        supports_thinking=profile.supports_thinking,
        supports_streaming=profile.supports_streaming,
        supports_json_mode=profile.supports_json_mode,
        context_window=profile.input_token_limit,
        provider_family=profile.provider_family,
        reasoning_control=profile.reasoning.control,
        reasoning_levels=list(profile.reasoning.levels),
        default_reasoning_level=profile.reasoning.default_level,
        reasoning_budget_tokens=profile.reasoning.budget_tokens,
        capability_source=profile.capability_source,
    )


class ModelRegistry:
    """
    Central model registry.

    Resolves aliases, manages providers, handles fallbacks, rotates API keys.
    Thread-safe: all mutable state is accessed through async locks.
    """

    def __init__(self):
        self._providers: dict[str, LLMProvider] = {}
        self._models: dict[str, ModelInfo] = {}
        self._aliases: dict[str, str] = {}       # alias → model_id
        self._api_keys: dict[str, list[str]] = defaultdict(list)  # provider → [keys]
        self._key_index: dict[str, int] = defaultdict(int)        # provider → current index
        self._lock = asyncio.Lock()

    def register_provider(self, name: str, provider: LLMProvider):
        """Register an LLM provider."""
        self._providers[name] = provider
        logger.info(f"Registered provider: {name}")

    def register_model(self, model: ModelInfo):
        """Register a model with its metadata."""
        self._models[model.id] = model
        for alias in model.aliases:
            self._aliases[alias] = model.id
        logger.info(f"Registered model: {model.id} (aliases: {model.aliases})")

    def add_api_key(self, provider: str, key: str):
        """Add an API key for round-robin rotation."""
        if key and key not in self._api_keys[provider]:
            self._api_keys[provider].append(key)

    def resolve(self, model_or_alias: str) -> ModelInfo:
        """
        Resolve a model alias to full ModelInfo.

        Args:
            model_or_alias: "fast", "best", "local", or full model ID

        Returns:
            ModelInfo for the resolved model

        Raises:
            KeyError if model not found
        """
        # Direct model ID
        if model_or_alias in self._models:
            return self._models[model_or_alias]

        # Alias resolution
        if model_or_alias in self._aliases:
            model_id = self._aliases[model_or_alias]
            return self._models[model_id]

        raise KeyError(f"Unknown model or alias: {model_or_alias}")

    async def get_next_key(self, provider: str) -> str:
        """Get next API key in round-robin rotation (thread-safe)."""
        async with self._lock:
            keys = self._api_keys.get(provider, [])
            if not keys:
                raise ProviderError(f"No API keys for provider: {provider}", provider=provider)

            idx = self._key_index[provider] % len(keys)
            self._key_index[provider] = idx + 1
            return keys[idx]

    async def call(
        self,
        model_or_alias: str,
        messages: list[dict],
        tools: Optional[list[dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 8192,
        thinking_budget: int = 0,
        json_mode: bool = False,
        api_key: Optional[str] = None,
    ) -> LLMResponse:
        """
        Call an LLM model with automatic fallback and key rotation.

        Args:
            model_or_alias: Model identifier or alias
            messages: Conversation messages
            tools: Tool definitions for function calling
            api_key: Specific API key (skips rotation if provided)

        Returns:
            LLMResponse from the model
        """
        model_info = self.resolve(model_or_alias)
        provider = self._providers.get(model_info.provider)
        if not provider:
            raise ProviderError(f"Provider not found: {model_info.provider}", provider=model_info.provider)

        # Get API key (provided > rotated)
        key = api_key or await self.get_next_key(model_info.provider)

        try:
            return await provider.generate(
                messages=messages,
                model=model_info.id,
                api_key=key,
                tools=tools,
                temperature=temperature,
                max_tokens=max_tokens,
                thinking_budget=thinking_budget,
                json_mode=json_mode,
            )
        except RateLimitError:
            # Try fallback model if available
            if model_info.fallback_to:
                logger.warning(f"Rate limit on {model_info.id}, falling back to {model_info.fallback_to}")
                return await self.call(
                    model_info.fallback_to, messages, tools,
                    temperature, max_tokens, thinking_budget, json_mode,
                )
            raise
        except ProviderError as e:
            if e.retryable and model_info.fallback_to:
                logger.warning(f"Error on {model_info.id}: {e}, falling back to {model_info.fallback_to}")
                return await self.call(
                    model_info.fallback_to, messages, tools,
                    temperature, max_tokens, thinking_budget, json_mode,
                )
            raise

    async def refresh_ollama_models(self, base_url: str = "http://localhost:11434"):
        """Query Ollama /api/tags and register any new models dynamically.

        Existing Ollama models are kept; newly discovered ones are added.
        Safe to call at any time (thread-safe via async lock).
        """
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{base_url.rstrip('/')}/api/tags")
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.debug(f"Ollama not reachable for refresh: {e}")
            return

        async with self._lock:
            for m in data.get("models", []):
                name: str = m.get("name", "")
                if not name or name in self._models:
                    continue
                details = m.get("details", {})
                param_size = details.get("parameter_size", "")
                self._models[name] = ModelInfo(
                    id=name,
                    provider="ollama",
                    display_name=f"{name} ({param_size})" if param_size else name,
                    aliases=[],
                    capabilities=_engine_capabilities(name, "ollama"),
                )
            logger.info(f"Ollama refresh: {len(data.get('models', []))} models found")

    @property
    def available_models(self) -> list[ModelInfo]:
        return list(self._models.values())

    @property
    def available_aliases(self) -> dict[str, str]:
        return dict(self._aliases)


def create_model_registry(settings) -> ModelRegistry:
    """
    Factory function to create a fully configured ModelRegistry.
    Called once at app startup in main.py lifespan.

    Args:
        settings: Pydantic Settings instance from config.py
    """
    registry = ModelRegistry()

    # ── Register providers ──
    registry.register_provider("gemini", GeminiProvider())
    registry.register_provider("ollama", OllamaProvider(base_url=settings.ollama_base_url))

    if settings.openrouter_api_key:
        registry.register_provider("openrouter", OpenRouterProvider())

    # ── Register models ──

    # Gemini Flash Lite (cheapest, fastest — for agents/workers)
    registry.register_model(ModelInfo(
        id=settings.google_model_lite,
        provider="gemini",
        display_name="Gemini Flash Lite",
        aliases=["fast", "lite", "agent", "LITE", "gemini-flash-lite"],
        capabilities=_engine_capabilities(settings.google_model_lite, "google_gemini", settings),
        fallback_to=settings.google_model_flash,
    ))

    # Gemini Flash (balanced — default for orchestration)
    registry.register_model(ModelInfo(
        id=settings.google_model_flash,
        provider="gemini",
        display_name="Gemini Flash",
        aliases=["default", "balanced", "flash", "FLASH", "GOOGLE"],
        capabilities=_engine_capabilities(settings.google_model_flash, "google_gemini", settings),
        fallback_to=settings.google_model_lite,
    ))

    # Gemini Pro (best — for complex reasoning)
    registry.register_model(ModelInfo(
        id=settings.google_model_pro,
        provider="gemini",
        display_name="Gemini Pro",
        aliases=["best", "pro", "smart", "PRO"],
        capabilities=_engine_capabilities(settings.google_model_pro, "google_gemini", settings),
        fallback_to=settings.google_model_flash,
    ))

    # Gemma 4 31B via Google AI Studio (same Gemini API, different model ID)
    if getattr(settings, "gemma4_enabled", True) and settings.gemini_primary_key:
        registry.register_model(ModelInfo(
            id=getattr(settings, "gemma4_model_31b", "gemma-4-31b-it"),
            provider="gemini",
            display_name="Gemma 4 31B",
            aliases=["gemma4", "gemma4-31b"],
            capabilities=_engine_capabilities(getattr(settings, "gemma4_model_31b", "gemma-4-31b-it"), "google_gemma", settings),
            fallback_to=settings.google_model_flash,
        ))
        registry.register_model(ModelInfo(
            id=getattr(settings, "gemma4_model_26b", "gemma-4-26b-a4b"),
            provider="gemini",
            display_name="Gemma 4 26B (MoE)",
            aliases=["gemma4-26b", "gemma4-moe"],
            capabilities=_engine_capabilities(getattr(settings, "gemma4_model_26b", "gemma-4-26b-a4b"), "google_gemma", settings),
            fallback_to=settings.google_model_flash,
        ))

    # Ollama local model (default configured model — dynamic models added via refresh_ollama_models)
    registry.register_model(ModelInfo(
        id=settings.ollama_chat_model,
        provider="ollama",
        display_name="Local (Ollama)",
        aliases=["local", "LOCAL", "ollama", "qwen-3.5-local"],
        capabilities=_engine_capabilities(settings.ollama_chat_model, "ollama", settings),
    ))

    # DeepSeek via OpenRouter (optional)
    if settings.openrouter_api_key:
        registry.register_model(ModelInfo(
            id=settings.openrouter_model_name,
            provider="openrouter",
            display_name="DeepSeek R1 (OpenRouter)",
            aliases=["deepseek", "DEEPSEEK", "reasoning"],
            capabilities=_engine_capabilities(settings.openrouter_model_name, "openrouter", settings),
            fallback_to=settings.google_model_flash,
        ))
        registry.add_api_key("openrouter", settings.openrouter_api_key)

    # ── Register API keys (round-robin) ──
    for key in [
        settings.gemini_api_key_paid,
        settings.gemini_api_key_free,
        settings.google_ai_studio_api_key,
    ]:
        if key:
            registry.add_api_key("gemini", key)

    logger.info(
        f"ModelRegistry initialized: {len(registry.available_models)} models, "
        f"{len(registry._api_keys.get('gemini', []))} Gemini keys"
    )

    return registry
