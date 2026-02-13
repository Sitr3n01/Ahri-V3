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
from src.core.prompt_builder import build_system_prompt
from src.core.save_tag_parser import extract_save_tags, clean_save_tags
from src.services.vector_service import get_vector_service
from src.services.persona_service import get_active_persona

logger = logging.getLogger("ahri.llm_service")


class LLMService:
    """Servico de LLM multi-backend."""

    # Modelos disponiveis
    MODELS = {
        "PRO": "gemini-2.5-pro-preview-06-05",
        "GOOGLE": "gemma-3-27b-it",
        "DEEPSEEK": "deepseek/deepseek-r1:free",
        "LOCAL": "gpt-oss:20b",
    }

    def __init__(self):
        self.settings = get_settings()
        self.mode = "PRO"
        self.memory_notifications: list[str] = []

        # Inicializa clientes
        self._gemini_pro = None
        self._gemini_free = None
        self._openrouter = None
        self._ollama = None

        self._init_clients()

    def _init_clients(self):
        """Inicializa clientes LLM baseado nas chaves disponiveis."""
        s = self.settings

        if s.gemini_primary_key:
            self._gemini_pro = GeminiClient(s.gemini_primary_key, self.MODELS["PRO"])

        if s.gemini_fallback_key:
            self._gemini_free = GeminiClient(s.gemini_fallback_key, self.MODELS["GOOGLE"])

        if s.openrouter_api_key:
            self._openrouter = OpenRouterClient(s.openrouter_api_key, s.openrouter_model_name)

        self._ollama = OllamaClient(self.MODELS["LOCAL"])

    def set_mode(self, mode: str):
        """Troca o modo/modelo ativo."""
        if mode == "FLASH":
            mode = "GOOGLE"
        if mode in self.MODELS:
            self.mode = mode
            logger.info(f"Mode switched to {mode} ({self.MODELS[mode]})")

    def get_client_for_mode(self) -> Optional[GeminiClient | OpenRouterClient | OllamaClient]:
        """Retorna o cliente correto para o modo atual."""
        if self.mode == "PRO":
            return self._gemini_pro
        elif self.mode == "GOOGLE":
            return self._gemini_free
        elif self.mode == "DEEPSEEK":
            return self._openrouter
        elif self.mode == "LOCAL":
            return self._ollama
        return self._gemini_free

    def generate_response(
        self,
        message: str,
        system_prompt: str,
        history: list[dict],
        images: Optional[list[str]] = None,
        video: Optional[dict] = None,
        pdfs: Optional[list[dict]] = None,
        uploaded_files: Optional[list] = None,
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

        if self.mode == "LOCAL":
            yield from self._generate_local(message, system_prompt, history, rag_context)
            return

        if self.mode == "DEEPSEEK" and self._openrouter:
            yield from self._generate_openrouter(message, system_prompt, history, rag_context)
            return

        # Gemini (PRO ou GOOGLE)
        if has_multimodal:
            yield from self._generate_gemini_multimodal(
                message, system_prompt, history, rag_context, images, video, pdfs, uploaded_files
            )
        else:
            yield from self._generate_gemini(message, system_prompt, history, rag_context)

    def _generate_gemini(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str
    ) -> Generator[str, None, None]:
        """Gera com Gemini (PRO ou GOOGLE/Gemma)."""
        client = self._gemini_pro if self.mode == "PRO" else self._gemini_free
        if not client:
            yield "[ERROR] No Gemini API key configured."
            return

        try:
            # Cria chat session com rolling window (ultimas 20 msgs)
            window = history[-20:] if len(history) > 20 else history
            chat = client.create_chat(system_prompt, window)

            final_msg = message + rag_context
            response = chat.send_message([final_msg], stream=True)

            for chunk in response:
                try:
                    if chunk.candidates and chunk.candidates[0].content.parts:
                        for part in chunk.candidates[0].content.parts:
                            if part.text:
                                yield part.text
                except ValueError:
                    pass

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
    ) -> Generator[str, None, None]:
        """Gera com Gemini usando vision model (flash) para multimodal."""
        try:
            import base64
            import io
            from PIL import Image as PILImage

            # Usa Gemini Flash para vision (mais rápido e barato)
            client = self._gemini_free if self._gemini_free else self._gemini_pro
            if not client:
                yield "[ERROR] No Gemini API key configured."
                return

            # Cria model direto (não usa chat session para multimodal)
            model = client.model

            # Monta inputs multimodais
            inputs = [system_prompt + rag_context + "\n\nUser: " + message]

            # Adiciona imagens
            if images:
                for img_b64 in images:
                    try:
                        img_data = base64.b64decode(img_b64)
                        img = PILImage.open(io.BytesIO(img_data))
                        inputs.append(img)
                    except Exception as e:
                        logger.error(f"Failed to decode image: {e}")

            # Adiciona uploaded files (video, pdfs já processados)
            if uploaded_files:
                inputs.extend(uploaded_files)

            # Generate content
            response = model.generate_content(inputs, stream=True)

            for chunk in response:
                try:
                    if chunk.candidates and chunk.candidates[0].content.parts:
                        for part in chunk.candidates[0].content.parts:
                            if part.text:
                                yield part.text
                except ValueError:
                    pass

        except Exception as e:
            logger.error(f"Gemini multimodal error: {e}")
            yield f"[Gemini Vision Error] {e}"

    def _generate_openrouter(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str
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

            stream = self._openrouter.stream_chat(msgs)
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            yield f"[DeepSeek Error] {e}"

    def _generate_local(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str
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

            yield from self._ollama.stream_chat(msgs)

        except Exception as e:
            yield f"[Local Error] {e}"

    def generate_rest(self, prompt: str, temperature: float = 0.2) -> Optional[str]:
        """Gera conteudo via REST (para memory analyzer, background tasks)."""
        client = self._gemini_free or self._gemini_pro
        if not client:
            return None
        # Usa REST API em vez de SDK para evitar locks globais
        rest_client = GeminiClient(self.settings.memory_key, self.MODELS["GOOGLE"])
        return rest_client.generate_content_rest(prompt, temperature)


# Singleton
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
