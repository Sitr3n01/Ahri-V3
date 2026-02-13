"""
BaseWorker - Abstract base class for all specialized agent workers.

Workers execute atomic tasks delegated by the orchestrator.
Each worker type (RAG, Code, Web, etc.) implements specific logic.
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


class BaseWorker(ABC):
    """
    Abstract base class for agent workers.

    Each worker specializes in a specific task type and is responsible for:
    1. Executing atomic tasks with structured input
    2. Calling appropriate LLM models (Gemma 3 4B/12B/27B)
    3. Returning structured JSON output
    4. Handling retries and JSON validation
    """

    def __init__(self, llm_service: LLMService, worker_type: str, default_model: str):
        """
        Args:
            llm_service: LLM service for model inference
            worker_type: Worker type identifier (RAG, Code, Web, etc.)
            default_model: Default model to use (gemma-3-4b, gemma-3-12b, etc.)
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
        """
        Execute worker task and return result.

        Args:
            db: Database session
            execution_id: Parent execution ID
            input_data: Input parameters for this worker

        Returns:
            AgentWorkerTask with output_data populated

        Raises:
            Exception: If execution fails after retries
        """
        pass

    async def _call_llm(
        self,
        prompt: str,
        model: Optional[str] = None,
        schema: Optional[dict] = None,
        max_retries: int = 3
    ) -> Any:
        """
        Call LLM with retry logic for Gemma 3 JSON validation.

        Gemma 3 doesn't have native function calling, so we use prompt engineering
        with pythonic tool_code/tool_output blocks. JSON output can be malformed,
        so we retry with validation and use json-repair as fallback.

        Args:
            prompt: Input prompt for LLM
            model: Model to use (default: self.default_model)
            schema: Optional JSON schema for validation
            max_retries: Maximum retry attempts (default: 3)

        Returns:
            str or dict (if schema provided and valid JSON)

        Raises:
            Exception: If all retries fail
        """
        import asyncio

        model = model or self.default_model

        for attempt in range(max_retries):
            try:
                # Set model mode before generating
                self.llm.set_mode(model)

                # Define sync generation wrapper to run in threadpool
                def _generate_sync():
                    full_text = ""
                    for chunk in self.llm.generate_response(
                        message=prompt,
                        system_prompt="",
                        history=[],
                    ):
                        full_text += chunk
                    return full_text

                # Execute in threadpool to avoid blocking event loop
                loop = asyncio.get_running_loop()
                response_text = await loop.run_in_executor(None, _generate_sync)

                # If no schema, return raw text
                if not schema:
                    return response_text.strip()

                # Try to parse and validate JSON
                try:
                    parsed = json.loads(response_text)
                    validate(instance=parsed, schema=schema)
                    return parsed
                except (json.JSONDecodeError, ValidationError) as e:
                    # JSON parsing/validation failed
                    if attempt == max_retries - 1:
                        # Last retry - use json-repair as fallback
                        try:
                            from json_repair import repair_json
                            repaired = repair_json(response_text)
                            validate(instance=repaired, schema=schema)
                            return repaired
                        except Exception:
                            # Even json-repair failed - return best effort parse
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
                await asyncio.sleep(1)  # Non-blocking sleep

        raise Exception("Unexpected: retry loop completed without return")

    async def _create_task_record(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: dict,
        model: Optional[str] = None
    ) -> AgentWorkerTask:
        """
        Create AgentWorkerTask record in database with status=running.

        Args:
            db: Database session
            execution_id: Parent execution ID
            input_data: Input parameters
            model: Model to use (default: self.default_model)

        Returns:
            Created AgentWorkerTask instance
        """
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
        """
        Mark task as completed and update database.

        Args:
            db: Database session
            task: AgentWorkerTask instance
            output_data: Structured output from worker
            tokens_used: Number of tokens consumed
            start_time: Task start timestamp (for duration calculation)

        Returns:
            Updated AgentWorkerTask instance
        """
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
        """
        Mark task as failed and update database.

        Args:
            db: Database session
            task: AgentWorkerTask instance
            error: Error message
            start_time: Task start timestamp (for duration calculation)

        Returns:
            Updated AgentWorkerTask instance
        """
        task.error = error
        task.status = AgentTaskStatus.FAILED
        task.completed_at = datetime.utcnow()

        if start_time:
            task.duration_ms = int((time.time() - start_time) * 1000)

        await db.commit()
        await db.refresh(task)
        return task

    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count from text (heuristic: 1 token ≈ 4 chars).

        Args:
            text: Input text

        Returns:
            Estimated token count
        """
        return len(text) // 4 + 5  # Add small buffer
