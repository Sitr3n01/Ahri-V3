"""
BaseWorker - Abstract base class for all specialized agent workers.

Workers execute atomic tasks delegated by the orchestrator.
Each worker type (RAG, Code, Web, etc.) implements specific logic.

Thread-safety: Workers create dedicated LLM client instances per call,
never mutating the shared LLMService singleton used by chat.
"""
import json
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, Any

from sqlalchemy.ext.asyncio import AsyncSession
from jsonschema import validate, ValidationError

from ...models.database import AgentWorkerTask
from ...models.schemas import AgentTaskStatus
from ..llm_service import LLMService
from ...core.llm_clients import GeminiClient, OllamaClient


class BaseWorker(ABC):
    """
    Abstract base class for agent workers.

    Each worker specializes in a specific task type and is responsible for:
    1. Executing atomic tasks with structured input
    2. Calling appropriate LLM models via dedicated client instances
    3. Returning structured JSON output
    4. Handling retries and JSON validation

    Thread-safety: _call_llm() creates per-call client instances,
    never calling set_mode() on the shared LLMService singleton.
    """

    # Override in subclasses to define worker specialization.
    # This is prepended to every LLM call as context.
    ROLE_PROMPT: str = ""

    def __init__(self, llm_service: LLMService, worker_type: str, default_model: str):
        """
        Args:
            llm_service: LLM service (used for client factory methods, NOT for set_mode)
            worker_type: Worker type identifier (RAG, Code, Web, etc.)
            default_model: Default model mode string ("GOOGLE", "PRO", "LOCAL", etc.)
        """
        self.llm = llm_service
        self.worker_type = worker_type
        self.default_model = default_model

    @abstractmethod
    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: dict
    ) -> AgentWorkerTask:
        """Execute worker task and return result."""
        pass

    def _create_client(self, model: str, api_key: Optional[str] = None) -> tuple:
        """
        Create a dedicated LLM client instance for this call.

        Returns (client_type, client) where client_type is 'gemini' or 'ollama'.
        Never mutates the shared LLMService singleton.

        Args:
            model: Mode string ("GOOGLE", "PRO", "LOCAL") or direct model ID
            api_key: Optional specific API key (from round-robin rotation)
        """
        # Local/Ollama models
        if model == "LOCAL" or model.startswith("qwen") or model.startswith("ollama"):
            ollama_model = self.llm.settings.agent_mode_local_model
            ollama_url = self.llm.settings.ollama_base_url + "/api/chat"
            return ("ollama", OllamaClient(model_name=ollama_model, api_url=ollama_url))

        # Gemini/Google models — create fresh GeminiClient instance
        if model in ("FLASH", "LITE", "GOOGLE", "PRO") or model.startswith("gemini") or model.startswith("gemma"):
            target_model = model
            if model in ("FLASH", "PRO", "GOOGLE"):
                target_model = self.llm.LEGACY_MODELS.get("FLASH", "gemini-2.5-flash")
            elif model == "LITE":
                target_model = self.llm.LEGACY_MODELS.get("LITE", "gemini-3.1-flash-lite")

            # If a specific API key was provided (round-robin), create client directly
            if api_key:
                return ("gemini", GeminiClient(api_key=api_key, model_name=target_model))

            client = self.llm.get_agent_client(target_model)
            if client:
                return ("gemini", client)

        # Fallback: try any available Gemini client (with rotated key if available)
        if api_key:
            fallback_model = self.llm.settings.agent_mode_api_model
            return ("gemini", GeminiClient(api_key=api_key, model_name=fallback_model))

        client = self.llm.get_agent_client()
        if client:
            return ("gemini", client)

        raise Exception(f"No LLM client available for model '{model}'")

    async def _call_llm(
        self,
        prompt: str,
        model: Optional[str] = None,
        schema: Optional[dict] = None,
        max_retries: int = 3,
        api_key: Optional[str] = None,
        thinking_budget: int = 0,
        enable_thinking: bool = False,
    ) -> Any:
        """
        Call LLM with retry logic and JSON validation.

        Thread-safe: Creates a dedicated client instance per call.
        Never calls set_mode() on the shared LLMService singleton.

        Args:
            prompt: Input prompt for LLM
            model: Model mode string (default: self.default_model)
            schema: Optional JSON schema for validation
            max_retries: Maximum retry attempts (default: 3)
            api_key: Specific API key from round-robin rotation
            thinking_budget: Gemini thinking budget tokens (0=off)
            enable_thinking: Ollama/Qwen thinking toggle

        Returns:
            str or dict (if schema provided and valid JSON)
        """
        import asyncio

        model = model or self.default_model
        client_type, client = self._create_client(model, api_key=api_key)

        # Prepend role prompt if defined
        if self.ROLE_PROMPT:
            prompt = f"{self.ROLE_PROMPT}\n\n{prompt}"

        for attempt in range(max_retries):
            try:
                # Generate response using dedicated client instance
                if client_type == "ollama":
                    # OllamaClient.generate_sync() — non-streaming, returns full text
                    def _generate():
                        return client.generate_sync(
                            messages=[{"role": "user", "content": prompt}],
                            think=enable_thinking,
                        )
                    loop = asyncio.get_running_loop()
                    response_text = await loop.run_in_executor(None, _generate)

                elif client_type == "gemini":
                    # GeminiClient.generate_content_rest() — REST API, thread-safe
                    def _generate():
                        return client.generate_content_rest(
                            prompt, thinking_budget=thinking_budget
                        ) or ""
                    loop = asyncio.get_running_loop()
                    response_text = await loop.run_in_executor(None, _generate)

                else:
                    raise Exception(f"Unknown client type: {client_type}")

                # If no schema, return raw text
                if not schema:
                    return response_text.strip()

                # Try to parse and validate JSON
                try:
                    parsed = json.loads(response_text)
                    validate(instance=parsed, schema=schema)
                    return parsed
                except (json.JSONDecodeError, ValidationError) as e:
                    if attempt == max_retries - 1:
                        # Last retry — use json-repair as fallback
                        try:
                            from json_repair import repair_json
                            repaired = repair_json(response_text)
                            validate(instance=repaired, schema=schema)
                            return repaired
                        except Exception:
                            try:
                                return json.loads(response_text)
                            except Exception:
                                raise Exception(f"Failed to parse JSON after {max_retries} retries: {e}")

                    # Retry with clarification prompt
                    prompt = f"{prompt}\n\nThe previous response was not valid JSON. Please return ONLY valid JSON matching the schema."
                    continue

            except Exception as e:
                if attempt == max_retries - 1:
                    raise Exception(f"LLM call failed after {max_retries} retries: {str(e)}")
                await asyncio.sleep(1)

        raise Exception("Unexpected: retry loop completed without return")

    async def _create_task_record(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: dict,
        model: Optional[str] = None
    ) -> AgentWorkerTask:
        """Create AgentWorkerTask record in database with status=running."""
        task = AgentWorkerTask(
            execution_id=execution_id,
            worker_type=self.worker_type,
            model=model or self.default_model,
            input_data=input_data,
            status=AgentTaskStatus.RUNNING
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    async def _complete_task(
        self,
        db: AsyncSession,
        task: AgentWorkerTask,
        output_data: dict,
        tokens_used: int = 0,
        start_time: Optional[float] = None
    ) -> AgentWorkerTask:
        """Mark task as completed and update database."""
        task.output_data = output_data
        task.tokens_used = tokens_used
        task.status = AgentTaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()

        if start_time:
            task.duration_ms = int((time.time() - start_time) * 1000)

        await db.commit()
        await db.refresh(task)
        return task

    async def _fail_task(
        self,
        db: AsyncSession,
        task: AgentWorkerTask,
        error: str,
        start_time: Optional[float] = None
    ) -> AgentWorkerTask:
        """Mark task as failed and update database."""
        task.error = error
        task.status = AgentTaskStatus.FAILED
        task.completed_at = datetime.utcnow()

        if start_time:
            task.duration_ms = int((time.time() - start_time) * 1000)

        await db.commit()
        await db.refresh(task)
        return task

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (heuristic: 1 token ~ 4 chars)."""
        return len(text) // 4 + 5
