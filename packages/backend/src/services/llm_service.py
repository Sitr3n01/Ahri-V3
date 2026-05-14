"""
LLM Service - Orquestra chamadas aos diferentes LLM backends.
Portar de AIEngine (brain.py linhas 639-1358).
"""
import re
import logging
import threading
from typing import Generator, Optional

from src.config import get_settings
from src.core.llm_clients import GeminiClient, OpenRouterClient, OllamaClient
from src.core.model_capabilities import infer_model_capabilities, parse_capability_overrides, resolve_chat_model_alias
from src.core.prompt_builder import build_system_prompt
from src.core.save_tag_parser import extract_save_tags, clean_save_tags
from src.services.vector_service import get_vector_service
from src.services.persona_service import get_active_persona

logger = logging.getLogger("ahri.llm_service")


class VisionKeyRotator:
    """Thread-safe round-robin rotation for vision API keys."""

    def __init__(self):
        self._index = 0
        self._lock = threading.Lock()

    def get_next_key(self, keys: list[str]) -> str:
        if not keys:
            return ""
        with self._lock:
            key = keys[self._index % len(keys)]
            self._index += 1
            return key


class LLMService:
    """Servico de LLM multi-backend via API keys."""

    LEGACY_MODELS = {
        "FLASH": "gemini-2.5-flash",
        "LITE": "gemini-3.1-flash-lite-preview",
        "DEEPSEEK": "deepseek/deepseek-r1:free",
        "LOCAL": "gpt-oss:20b",
    }

    # Alias para compatibilidade
    MODELS = LEGACY_MODELS

    def __init__(self):
        self.settings = get_settings()
        self.mode = "FLASH"
        self._active_model_id = self.LEGACY_MODELS["FLASH"]
        self._active_profile = infer_model_capabilities(self._active_model_id, "google_gemini")
        self._current_supports_vision: bool = True  # Updated by set_mode()
        self.memory_notifications: list[str] = []

        # Clientes (1 key = 1 model)
        self._gemini_flash: Optional[GeminiClient] = None
        self._gemini_lite: Optional[GeminiClient] = None
        self._openrouter = None
        self._ollama = None
        self._vision_rotator = VisionKeyRotator()

        self._init_clients()

    def _init_clients(self):
        """Inicializa clientes LLM via API keys (1 key = 1 model)."""
        s = self.settings

        # FLASH — usa primary key (first available key)
        paid_key = s.gemini_primary_key
        if paid_key:
            model_flash = getattr(s, "google_model_flash", "gemini-2.5-flash")
            logger.info(f"Initializing Gemini Flash with model: {model_flash} (Key starting with: {paid_key[:8]}...)")
            self._gemini_flash = GeminiClient(paid_key, model_flash)
        else:
            logger.warning("No Gemini Primary Key found in settings.")

        # Lite (rápido/barato) — usa fallback key, ou primary se fallback não existir
        lite_key = s.gemini_fallback_key or paid_key
        if lite_key:
            model_lite = getattr(s, "google_model_lite", "gemini-3.1-flash-lite-preview")
            logger.info(f"Initializing Gemini Lite with model: {model_lite} (Key starting with: {lite_key[:8]}...)")
            self._gemini_lite = GeminiClient(lite_key, model_lite)

        if s.openrouter_api_key:
            logger.info(f"Initializing OpenRouter with model: {s.openrouter_model_name}")
            self._openrouter = OpenRouterClient(s.openrouter_api_key, s.openrouter_model_name)

        model_local = getattr(s, "ollama_chat_model", "gpt-oss:20b")
        logger.info(f"Initializing Ollama Client with model: {model_local}")
        self._ollama = OllamaClient(model_local)

    def _refresh_active_profile(self, model_id: str, provider_hint: str) -> None:
        self._active_profile = infer_model_capabilities(
            model_id,
            provider_hint,
            vision_patterns=self.settings.ollama_vision_patterns,
            overrides=parse_capability_overrides(self.settings.model_capabilities_overrides),
        )
        self._current_supports_vision = self._active_profile.supports_vision

    def set_mode(self, mode: str):
        """Troca o modo/modelo ativo.

        Aceita:
        - Aliases legados: "FLASH", "LITE", "DEEPSEEK", "LOCAL"
        - Backward compat: "PRO" → "FLASH", "GOOGLE" → "FLASH"
        - Model IDs Google: "gemini-*" ou "gemma-*" → usa Gemini API
        - Model IDs OpenRouter: qualquer string com "/" → usa OpenRouter
        - Model IDs Ollama: qualquer outra string → usa Ollama local
        """
        s = self.settings

        # Backward compat
        if mode in ("GOOGLE", "PRO"):
            mode = "FLASH"

        _, resolved_provider_hint = resolve_chat_model_alias(mode, s)

        # Aliases legados → resolvem para mode + model_id configurados
        if mode in self.LEGACY_MODELS:
            self.mode = mode
            if mode == "FLASH":
                self._active_model_id = getattr(s, "google_model_flash", "gemini-2.5-flash")
                self._current_supports_vision = True
            elif mode == "LITE":
                self._active_model_id = getattr(s, "google_model_lite", "gemini-3.1-flash-lite-preview")
                self._current_supports_vision = False  # Flash Lite não suporta visão
            elif mode == "LOCAL":
                self._active_model_id = getattr(s, "ollama_chat_model", "gpt-oss:20b")
                self._current_supports_vision = False
                self._ollama = OllamaClient(self._active_model_id)
            elif mode == "DEEPSEEK":
                self._active_model_id = getattr(s, "openrouter_model_name", self.LEGACY_MODELS["DEEPSEEK"])
                self._current_supports_vision = False
            else:
                self._active_model_id = self.LEGACY_MODELS[mode]
                self._current_supports_vision = False
            self._refresh_active_profile(self._active_model_id, resolved_provider_hint)
            logger.info(f"Mode switched to {mode} ({self._active_model_id})")
            return

        # Google model IDs ("gemini-*" ou "gemma-*") → Gemini API
        if mode.startswith("gemini-") or mode.startswith("gemma-"):
            self.mode = "FLASH"
            self._active_model_id = mode
            # Gemma 4 e Gemini Flash suportam visão; Flash Lite não
            lite_id = getattr(s, "google_model_lite", "gemini-3.1-flash-lite-preview")
            self._current_supports_vision = (mode != lite_id)
            client = self._gemini_flash or self._gemini_lite
            if client:
                client.model_name = mode
            self._refresh_active_profile(self._active_model_id, resolved_provider_hint)
            logger.info(f"Mode switched to Google model: {mode}")
            return

        # OpenRouter (model ID contém "/")
        if "/" in mode:
            self.mode = "DEEPSEEK"
            self._active_model_id = mode
            self._current_supports_vision = False
            if s.openrouter_api_key:
                self._openrouter = OpenRouterClient(s.openrouter_api_key, mode)
            self._refresh_active_profile(self._active_model_id, resolved_provider_hint)
            logger.info(f"Mode switched to OpenRouter model: {mode}")
            return

        # Ollama dinâmico (qualquer outra string = nome de modelo local)
        self.mode = "LOCAL"
        self._active_model_id = mode
        self._current_supports_vision = False
        self._ollama = OllamaClient(mode)
        self._refresh_active_profile(self._active_model_id, resolved_provider_hint)
        logger.info(f"Mode switched to Ollama model: {mode}")

    def get_client_for_mode(self) -> Optional[GeminiClient | OpenRouterClient | OllamaClient]:
        """Retorna o cliente correto para o modo atual."""
        if self.mode == "DEEPSEEK":
            return self._openrouter
        if self.mode == "LOCAL":
            return self._ollama
        if self.mode == "FLASH":
            return self._gemini_flash or self._gemini_lite
        if self.mode == "LITE":
            return self._gemini_lite or self._gemini_flash

        # Fallback
        return self._gemini_flash or self._gemini_lite

    def _is_gemini_mode(self) -> bool:
        """Checa se o modo atual usa Gemini API (inclui Gemma 4 cloud)."""
        return self.mode in ("FLASH", "LITE")

    def generate_response(
        self,
        message: str,
        system_prompt: str,
        history: list[dict],
        images: Optional[list[str]] = None,
        video: Optional[dict] = None,
        pdfs: Optional[list[dict]] = None,
        uploaded_files: Optional[list] = None,
        reasoning_level: str = "medium",
        enable_thinking: bool = False,
        stop_event: Optional[threading.Event] = None,
    ) -> Generator[str, None, None]:
        """
        Gera resposta em streaming. Yield chunks de texto.

        Args:
            message: Mensagem do usuário
            system_prompt: System prompt da persona
            history: Histórico de mensagens
            images: Lista de imagens em base64
            video: Dict com {data: str, name: str} para video
            pdfs: Lista de dicts com {data: str, name: str} para PDFs
            uploaded_files: Lista de arquivos já enviados via Gemini File API (opcional)
            reasoning_level: Nível de raciocínio (off/low/medium/high)
            enable_thinking: Habilita pensamento (Ollama)
        """

        # RAG search
        rag_context = ""
        try:
            persona = get_active_persona()
            vector_svc = get_vector_service(persona)
            found = vector_svc.search_memory(message)
            if found:
                rag_context = f"\n[RAG MEMORY]:\n{found}\n"
        except Exception as e:
            logger.error(f"RAG search error: {e}")

        # Check se tem multimodal content
        has_multimodal = images or video or pdfs or uploaded_files

        # Intercept: modelos sem suporte a visão → transparente para Gemini Flash
        # _current_supports_vision é atualizado por set_mode() para cada modelo
        if has_multimodal and not self._current_supports_vision:
            vision_key = self._vision_rotator.get_next_key(self.settings.vision_keys)
            if vision_key:
                logger.info(f"[Vision Intercept] {self.mode} mode has multimodal content, routing to Gemini Flash")
                flash_model = getattr(self.settings, "google_model_flash", self.LEGACY_MODELS["FLASH"])
                temp_client = GeminiClient(vision_key, flash_model)
                yield from self._generate_gemini_multimodal_with_client(
                    temp_client, message, system_prompt, history, rag_context,
                    images, video, pdfs, uploaded_files, reasoning_level, stop_event
                )
                return
            else:
                logger.warning("[Vision Intercept] No vision keys configured, stripping images from request")

        if self.mode == "LOCAL":
            yield from self._generate_local(message, system_prompt, history, rag_context, enable_thinking, stop_event)
            return

        if self.mode == "DEEPSEEK" and self._openrouter:
            yield from self._generate_openrouter(message, system_prompt, history, rag_context, reasoning_level, stop_event)
            return

        # Gemini (FLASH ou LITE)
        if has_multimodal:
            yield from self._generate_gemini_multimodal(
                message, system_prompt, history, rag_context, images, video, pdfs, uploaded_files, reasoning_level, stop_event
            )
        else:
            yield from self._generate_gemini(message, system_prompt, history, rag_context, reasoning_level, stop_event)

    def _generate_gemini(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str, reasoning_level: str = "medium",
        stop_event: Optional[threading.Event] = None
    ) -> Generator[str, None, None]:
        """Gera com Gemini (FLASH ou LITE) via google-genai SDK com thinking support."""
        client = self.get_client_for_mode()
        if not client or not isinstance(client, GeminiClient):
            yield "[ERROR] No Gemini client available. Configure an API key."
            return

        try:
            # Rolling window (últimas 20 msgs)
            window = history[-20:] if len(history) > 20 else history
            final_msg = message + rag_context

            # Novo SDK: create_chat_and_send_stream passa thinking_config automaticamente
            response = client.create_chat_and_send_stream(
                system_instruction=system_prompt,
                history=window,
                message=final_msg,
                reasoning_level=reasoning_level,
            )

            for chunk in response:
                if stop_event and stop_event.is_set():
                    break
                # response agora emite strings (pode ser o texto ou erro formatado)
                yield chunk

        except Exception as e:
            yield f"[Gemini Error] {e}"

    def _generate_gemini_multimodal(
        self,
        message: str,
        system_prompt: str,
        history: list[dict],
        rag_context: str,
        images: Optional[list[str]] = None,
        video: Optional[dict] = None,
        pdfs: Optional[list[dict]] = None,
        uploaded_files: Optional[list] = None,
        reasoning_level: str = "medium",
        stop_event: Optional[threading.Event] = None,
    ) -> Generator[str, None, None]:
        """Gera com Gemini usando vision model para multimodal."""
        # Prioridade para multimodal: flash > lite
        client = self.get_client_for_mode()
        if not client or not isinstance(client, GeminiClient):
            client = self._gemini_flash or self._gemini_lite
        if not client:
            yield "[ERROR] No Gemini client available for multimodal."
            return

        yield from self._generate_gemini_multimodal_with_client(
            client, message, system_prompt, history, rag_context,
            images, video, pdfs, uploaded_files, reasoning_level, stop_event
        )

    def _generate_gemini_multimodal_with_client(
        self,
        client: GeminiClient,
        message: str,
        system_prompt: str,
        history: list[dict],
        rag_context: str,
        images: Optional[list[str]] = None,
        video: Optional[dict] = None,
        pdfs: Optional[list[dict]] = None,
        uploaded_files: Optional[list] = None,
        reasoning_level: str = "medium",
        stop_event: Optional[threading.Event] = None,
    ) -> Generator[str, None, None]:
        """Gera com Gemini multimodal via google-genai SDK. Thread-safe."""
        try:
            import base64
            import io
            from PIL import Image as PILImage

            # Monta inputs multimodais com REALITY_CHECK_PROTOCOL (portado de V2)
            reality_check = (
                "--- REALITY CHECK PROTOCOL (MULTIMODAL) ---\n"
                "INSTRUCTION: You are analyzing external media (Image, Video, or PDF).\n"
                "STEP 1: FACTS FIRST. Extract observable facts from the media provided.\n"
                "STEP 2: ADOPT PERSONA. Use those facts to answer as the character defined in your system instructions.\n"
                "DO NOT HALLUCINATE content not present in the files.\n\n"
            )
            user_input = f"User: {message}"
            if rag_context:
                user_input = f"{rag_context}\n\n{user_input}"
            inputs = [f"{reality_check}{user_input}"]

            # Adiciona imagens (PIL Image — aceito diretamente pelo novo SDK)
            if images:
                for img_b64 in images:
                    try:
                        img_data = base64.b64decode(img_b64)
                        img = PILImage.open(io.BytesIO(img_data))
                        inputs.append(img)
                    except Exception as e:
                        logger.error(f"Failed to decode image: {e}")

            # Adiciona uploaded files (video, pdfs já processados via File API)
            if uploaded_files:
                inputs.extend(uploaded_files)

            # Novo SDK: generate_content_stream com thinking support
            response = client.generate_content_stream(
                contents=inputs,
                system_instruction=system_prompt,
                reasoning_level=reasoning_level,
            )

            for chunk in response:
                if stop_event and stop_event.is_set():
                    logger.info("[Gemini Multimodal] Stream cancelled via stop_event")
                    break
                # response agora emite strings diretamente
                yield chunk

        except Exception as e:
            logger.error(f"Gemini multimodal error: {e}")
            yield f"[Gemini Vision Error] {e}"

    def _generate_openrouter(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str,
        reasoning_level: str = "medium",
        stop_event: Optional[threading.Event] = None
    ) -> Generator[str, None, None]:
        """Gera com OpenRouter (DeepSeek)."""
        if not self._openrouter:
            yield "[ERROR] No OpenRouter API key configured."
            return

        try:
            msgs = [{"role": "system", "content": system_prompt + rag_context}]
            for m in history[-20:]:
                role = "user" if m["role"] == "user" else "assistant"
                msgs.append({"role": role, "content": str(m.get("content", ""))})
            msgs.append({"role": "user", "content": message})

            stream = self._openrouter.stream_chat(msgs, reasoning_level=reasoning_level)
            for chunk in stream:
                if stop_event and stop_event.is_set():
                    logger.info("[OpenRouter] Stream cancelled via stop_event")
                    break
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            yield f"[DeepSeek Error] {e}"

    def _generate_local(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str, enable_thinking: bool = False,
        stop_event: Optional[threading.Event] = None
    ) -> Generator[str, None, None]:
        """Gera com Ollama (modelo local)."""
        if not self._ollama:
            yield "[ERROR] Ollama not available."
            return

        try:
            msgs = [{"role": "system", "content": system_prompt + rag_context}]
            for m in history[-20:]:
                role = "user" if m["role"] == "user" else "assistant"
                msgs.append({"role": role, "content": str(m.get("content", ""))})
            msgs.append({"role": "user", "content": message})

            for chunk in self._ollama.stream_chat(msgs, think=enable_thinking):
                if stop_event and stop_event.is_set():
                    logger.info("[Ollama] Stream cancelled via stop_event")
                    break
                yield chunk

        except Exception as e:
            yield f"[Local Error] {e}"

    def get_agent_client(self, model_name: Optional[str] = None) -> Optional[GeminiClient]:
        """Retorna o melhor cliente disponível para agent mode.

        Se model_name fornecido, configura o client com esse modelo.
        Cria instância dedicada para não interferir no chat.
        """
        target_model = model_name or self.LEGACY_MODELS["LITE"]

        api_key = self.settings.gemini_primary_key or self.settings.gemini_fallback_key
        if api_key:
            return GeminiClient(
                api_key=api_key,
                model_name=target_model,
            )

        return None


# Singleton
_llm_service: Optional[LLMService] = None


def create_llm_service(mode: Optional[str] = None) -> LLMService:
    """Create an isolated LLM service for a single request.

    Chat generation mutates the active model internally via set_mode(). Returning
    a fresh service per request prevents concurrent chats from changing each
    other's selected model.
    """
    service = LLMService()
    if mode:
        service.set_mode(mode)
    return service


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
