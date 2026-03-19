"""
LLM Clients - Abstraçao unificada dos backends LLM.
Corrige o bug de genai.configure() global (thread-unsafe).
"""
import json
import logging
import time
from typing import AsyncGenerator, Optional

import requests
import google.generativeai as genai
from openai import OpenAI

from src.config import get_settings

logger = logging.getLogger("ahri.llm")


class GeminiClient:
    """Cliente Gemini que suporta API key OU OAuth credentials.
    Cria instancias por request para thread-safety."""

    def __init__(self, api_key: str = "", model_name: str = "", credentials=None):
        self.api_key = api_key
        self.credentials = credentials
        self._masked_key = f"{api_key[:8]}...{api_key[-4:]}" if api_key and len(api_key) > 12 else "***"
        self.model_name = model_name

    def _configure(self):
        """Configura genai com credentials ou API key."""
        if self.credentials:
            # Auto-refresh se expirado
            if self.credentials.expired and self.credentials.refresh_token:
                import google.auth.transport.requests
                self.credentials.refresh(google.auth.transport.requests.Request())
            genai.configure(credentials=self.credentials)
        else:
            genai.configure(api_key=self.api_key)

    def create_model(self, system_instruction: Optional[str] = None) -> genai.GenerativeModel:
        """Cria um GenerativeModel com API key ou OAuth credentials."""
        self._configure()

        is_gemma = "gemma" in self.model_name.lower()
        sys_inst = None if is_gemma else system_instruction

        return genai.GenerativeModel(
            self.model_name,
            system_instruction=sys_inst,
        )

    def create_chat(self, system_instruction: str, history: list[dict] = None):
        """Cria uma sessao de chat com historico opcional."""
        model = self.create_model(system_instruction)

        is_gemma = "gemma" in self.model_name.lower()
        g_history = []

        if is_gemma:
            g_history.append({"role": "user", "parts": [f"SYSTEM INSTRUCTIONS:\n{system_instruction}"]})
            g_history.append({"role": "model", "parts": ["Entendido."]})

        if history:
            for msg in history:
                role = "user" if msg.get("role") == "user" else "model"
                content = str(msg.get("content", "."))
                g_history.append({"role": role, "parts": [content]})

        return model.start_chat(history=g_history)

    def generate_content_rest(self, prompt: str, temperature: float = 0.2) -> Optional[str]:
        """Gera conteudo via REST API (sem usar SDK global). Thread-safe."""
        full_model = self.model_name if self.model_name.startswith("models/") else f"models/{self.model_name}"
        base_url = f"https://generativelanguage.googleapis.com/v1beta/{full_model}:generateContent"

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }

        headers = {"Content-Type": "application/json"}

        if self.credentials:
            # OAuth: usa Bearer token
            if self.credentials.expired and self.credentials.refresh_token:
                import google.auth.transport.requests
                self.credentials.refresh(google.auth.transport.requests.Request())
            headers["Authorization"] = f"Bearer {self.credentials.token}"
            url = base_url
        else:
            # API key: query param
            url = f"{base_url}?key={self.api_key}"

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()

            if "candidates" in data and data["candidates"]:
                parts = data["candidates"][0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
            return None
        except Exception as e:
            logger.error(f"REST API error ({self.model_name}, key={self._masked_key}): {e}")
            return None


class OpenRouterClient:
    """Cliente OpenRouter (DeepSeek, etc) via SDK OpenAI."""

    def __init__(self, api_key: str, model_name: str = "deepseek/deepseek-r1:free"):
        self.model_name = model_name
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )

    def stream_chat(self, messages: list[dict]):
        """Gera resposta em streaming."""
        return self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            stream=True,
        )


class OllamaClient:
    """Cliente para modelos locais via Ollama."""

    def __init__(self, model_name: str = "gpt-oss:20b", api_url: str = "http://localhost:11434/api/chat"):
        self.model_name = model_name
        self.api_url = api_url

    def stream_chat(self, messages: list[dict], ctx_size: int = 4096):
        """Gera resposta em streaming via Ollama."""
        payload = {
            "model": self.model_name,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.7,
                "num_ctx": ctx_size,
                "num_gpu": 999,
                "num_thread": 6,
            },
        }

        logger.info(f"[OLLAMA] Sending to {self.model_name}...")
        start = time.time()

        try:
            with requests.post(self.api_url, json=payload, stream=True, timeout=600) as r:
                r.raise_for_status()
                first_token = False

                for line in r.iter_lines():
                    if line:
                        try:
                            body = json.loads(line)
                            content = body.get("message", {}).get("content", "")
                            if content:
                                if not first_token:
                                    logger.info(f"[OLLAMA] First token in {time.time() - start:.2f}s")
                                    first_token = True
                                yield content
                        except json.JSONDecodeError:
                            pass

        except requests.exceptions.Timeout:
            yield "\n[TIMEOUT] Model took too long to respond."
        except Exception as e:
            yield f"\n[OLLAMA ERROR] {e}"
