"""
LLM Service - Orquestra chamadas aos diferentes LLM backends.
Portar de AIEngine (brain.py linhas 639-1358).

Suporta OAuth (plano Pro do Gemini) e API keys como fallback.
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
    """Servico de LLM multi-backend com suporte a OAuth."""

    # Modelos legados (fallback quando OAuth não está conectado)
    LEGACY_MODELS = {
        "PRO": "gemini-2.5-pro-preview-06-05",
        "GOOGLE": "gemma-3-27b-it",
        "DEEPSEEK": "deepseek/deepseek-r1:free",
        "LOCAL": "gpt-oss:20b",
    }

    # Alias para compatibilidade
    MODELS = LEGACY_MODELS

    def __init__(self):
        self.settings = get_settings()
        self.mode = "PRO"
        self._active_model_id = ""  # model ID real (ex: "gemini-2.5-flash")
        self.memory_notifications: list[str] = []

        # Clientes
        self._gemini_pro = None
        self._gemini_free = None
        self._gemini_oauth = None  # Cliente OAuth (prioridade)
        self._openrouter = None
        self._ollama = None
        self._use_oauth = False

        self._init_clients()

    def _init_clients(self):
        """Inicializa clientes LLM. OAuth tem prioridade sobre API keys."""
        s = self.settings

        # 1. Tenta OAuth primeiro
        self._use_oauth = False
        self._gemini_oauth = None
        try:
            from src.services.google_oauth_service import get_google_oauth_service
            oauth_svc = get_google_oauth_service()
            if oauth_svc.is_connected:
                creds = oauth_svc.get_credentials()
                if creds:
                    # Cria client OAuth com modelo padrão (será trocado via set_mode)
                    self._gemini_oauth = GeminiClient(
                        model_name="gemini-2.5-flash",
                        credentials=creds,
                    )
                    self._use_oauth = True
                    logger.info("LLM clients initialized with OAuth credentials")
        except Exception as e:
            logger.warning(f"OAuth init failed, falling back to API keys: {e}")

        # 2. API key clients (fallback ou uso paralelo)
        if s.gemini_primary_key:
            self._gemini_pro = GeminiClient(s.gemini_primary_key, self.LEGACY_MODELS["PRO"])

        if s.gemini_fallback_key:
            self._gemini_free = GeminiClient(s.gemini_fallback_key, self.LEGACY_MODELS["GOOGLE"])

        if s.openrouter_api_key:
            self._openrouter = OpenRouterClient(s.openrouter_api_key, s.openrouter_model_name)

        self._ollama = OllamaClient(self.LEGACY_MODELS["LOCAL"])

    def set_mode(self, mode: str):
        """Troca o modo/modelo ativo.

        Aceita:
        - Modos legados: "PRO", "GOOGLE", "DEEPSEEK", "LOCAL", "FLASH"
        - Model IDs diretos: "gemini-2.5-pro", "gemini-2.5-flash", etc.
        """
        if mode == "FLASH":
            mode = "GOOGLE"

        # Modos legados
        if mode in self.LEGACY_MODELS:
            self.mode = mode
            self._active_model_id = self.LEGACY_MODELS[mode]
            # Se OAuth ativo e é modelo Google, atualiza o client OAuth
            if self._use_oauth and self._gemini_oauth and mode in ("PRO", "GOOGLE"):
                self._gemini_oauth.model_name = self.LEGACY_MODELS[mode]
            logger.info(f"Mode switched to {mode} ({self._active_model_id})")
            return

        # Model ID direto (ex: "gemini-2.5-flash", "gemini-2.5-pro")
        if mode.startswith("gemini-") or mode.startswith("gemma-"):
            self.mode = "OAUTH_GOOGLE"
            self._active_model_id = mode
            if self._gemini_oauth:
                self._gemini_oauth.model_name = mode
            logger.info(f"Mode switched to direct model: {mode}")
            return

        # Desconhecido — tenta como modelo legado PRO
        logger.warning(f"Unknown mode '{mode}', defaulting to PRO")
        self.mode = "PRO"
        self._active_model_id = self.LEGACY_MODELS["PRO"]

    def get_client_for_mode(self) -> Optional[GeminiClient | OpenRouterClient | OllamaClient]:
        """Retorna o cliente correto para o modo atual."""
        if self.mode == "DEEPSEEK":
            return self._openrouter
        if self.mode == "LOCAL":
            return self._ollama

        # Para modos Google (PRO, GOOGLE, OAUTH_GOOGLE): OAuth > API key
        if self._use_oauth and self._gemini_oauth:
            return self._gemini_oauth

        if self.mode == "PRO":
            return self._gemini_pro
        elif self.mode == "GOOGLE":
            return self._gemini_free

        # Fallback
        return self._gemini_oauth or self._gemini_pro or self._gemini_free

    def _is_gemini_mode(self) -> bool:
        """Checa se o modo atual usa Gemini (Google)."""
        return self.mode in ("PRO", "GOOGLE", "OAUTH_GOOGLE")

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

        # Gemini (PRO, GOOGLE ou OAuth direto)
        if has_multimodal:
            yield from self._generate_gemini_multimodal(
                message, system_prompt, history, rag_context, images, video, pdfs, uploaded_files
            )
        else:
            yield from self._generate_gemini(message, system_prompt, history, rag_context)

    def _generate_gemini(
        self, message: str, system_prompt: str, history: list[dict], rag_context: str
    ) -> Generator[str, None, None]:
        """Gera com Gemini (OAuth, PRO ou GOOGLE/Gemma)."""
        client = self.get_client_for_mode()
        if not client or not isinstance(client, GeminiClient):
            yield "[ERROR] No Gemini client available. Configure OAuth or API key."
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
        """Gera com Gemini usando vision model para multimodal."""
        try:
            import base64
            import io
            from PIL import Image as PILImage

            # Prioridade para multimodal: OAuth > free (Flash) > pro
            client = self.get_client_for_mode()
            if not client or not isinstance(client, GeminiClient):
                # Tenta fallback
                client = self._gemini_free or self._gemini_pro
            if not client:
                yield "[ERROR] No Gemini client available for multimodal."
                return

            # Cria model direto (não usa chat session para multimodal)
            model = client.create_model(system_prompt)

            # Monta inputs multimodais
            inputs = [rag_context + "\n\nUser: " + message if rag_context else "User: " + message]

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

    def get_agent_client(self, model_name: Optional[str] = None) -> Optional[GeminiClient]:
        """Retorna o melhor cliente disponível para agent mode.

        Prioridade: OAuth > API key (paid) > API key (free).
        Se model_name fornecido, configura o client com esse modelo.
        """
        target_model = model_name or self.settings.agent_mode_orchestrator

        # 1. OAuth tem prioridade se configurado
        if self.settings.agent_mode_use_oauth and self._use_oauth and self._gemini_oauth:
            self._gemini_oauth.model_name = target_model
            return self._gemini_oauth

        # 2. API key clients
        client = self._gemini_pro or self._gemini_free
        if client:
            # Cria novo client para não interferir no chat
            return GeminiClient(
                api_key=self.settings.gemini_primary_key or self.settings.gemini_fallback_key,
                model_name=target_model,
            )

        return None

    def generate_rest(self, prompt: str, temperature: float = 0.2) -> Optional[str]:
        """Gera conteudo via REST (para memory analyzer, background tasks)."""
        # Prioridade: OAuth > API key
        if self._use_oauth and self._gemini_oauth:
            return self._gemini_oauth.generate_content_rest(prompt, temperature)

        client = self._gemini_free or self._gemini_pro
        if not client:
            return None
        # Usa REST API em vez de SDK para evitar locks globais
        rest_client = GeminiClient(self.settings.memory_key, self.LEGACY_MODELS["GOOGLE"])
        return rest_client.generate_content_rest(prompt, temperature)


# Singleton
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
