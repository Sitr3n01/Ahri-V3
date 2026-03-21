"""
OrchestratorService - Multi-agent task orchestration with Gemini/Gemma coordination.

The orchestrator plans task decomposition, delegates to specialized workers,
and synthesizes final results. Uses hybrid approach:
- Gemini 2.5 Flash as orchestrator (native function calling, high reliability)
- Gemma 3 workers for execution (low cost, specialized tasks)
"""
import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.database import AgentExecution, AgentWorkerTask
from ..models.schemas import AgentExecutionStatus, AgentTaskStatus
from .llm_service import LLMService
from .vector_service import VectorService
from .tpm_manager import TPMManager, AgentKeyRotator
from .workers.rag_worker import RAGWorker
from .workers.code_worker import CodeWorker
from .workers.shell_worker import ShellWorker
from .workers.memory_worker import MemoryWorker
from .workers.web_worker import WebWorker
from .workers.vision_worker import VisionWorker
from .workers.browser_worker import BrowserWorker
from .workers.router_worker import RouterWorker

logger = logging.getLogger("ahri.orchestrator")


class OrchestratorService:
    """
    Orchestrator for multi-agent task execution.

    Coordinates specialized workers (RAG, Code, Web, etc.) to accomplish complex goals.
    Implements TPM management, retry logic, and result synthesis.
    """

    def __init__(
        self,
        llm_service: LLMService,
        vector_service: VectorService,
        tpm_manager: Optional[TPMManager] = None,
        key_rotator: Optional[AgentKeyRotator] = None,
    ):
        self.llm = llm_service
        self.vector_service = vector_service
        self.tpm = tpm_manager or TPMManager(limit_tpm=250000, limit_rpm=15)
        self.key_rotator = key_rotator
        self._max_parallel = llm_service.settings.agent_mode_max_parallel

        # Initialize all workers (Phase 2: All 8 workers)
        self.workers = {
            "RAG": RAGWorker(llm_service, vector_service),
            "Code": CodeWorker(llm_service),
            "Shell": ShellWorker(llm_service),
            "Memory": MemoryWorker(llm_service),
            "Web": WebWorker(llm_service),
            "Vision": VisionWorker(llm_service),
            "Browser": BrowserWorker(llm_service),
            "Router": RouterWorker(llm_service),
        }

        # Runtime params set per-execution (not per-init)
        self._thinking_budget = 0
        self._enable_thinking = False

        # Semaphore to cap parallel worker execution
        self._semaphore = asyncio.Semaphore(self._max_parallel)

    async def execute_task(
        self,
        db: AsyncSession,
        goal: str,
        orchestrator_model: str = "PRO",
        execution_id: Optional[int] = None,
        reasoning_level: str = "medium",
        enable_thinking: bool = False,
        internet_search_enabled: bool = False,
    ) -> AgentExecution:
        """
        Main orchestration loop.

        Args:
            db: Database session
            goal: User's task goal in natural language
            orchestrator_model: Model for orchestration
            execution_id: Pre-created execution ID (from background task pattern).
                          If None, creates a new record.
            reasoning_level: Gemini thinking budget level (off/low/medium/high)
            enable_thinking: Qwen/Ollama thinking toggle
            internet_search_enabled: Whether Search worker is available

        Returns:
            Completed AgentExecution with result
        """
        # Set per-execution reasoning params
        _THINKING_MAP = {"off": 0, "low": 1024, "medium": 8192, "high": 24576}
        self._thinking_budget = _THINKING_MAP.get(reasoning_level, 8192)
        self._enable_thinking = enable_thinking

        # Conditionally register Search worker
        if internet_search_enabled and "Search" not in self.workers:
            from .workers.search_worker import SearchWorker
            self.workers["Search"] = SearchWorker(self.llm)
        # Step 1: Get or create execution record
        if execution_id:
            stmt = select(AgentExecution).where(AgentExecution.id == execution_id)
            result = await db.execute(stmt)
            execution = result.scalar_one_or_none()
            if not execution:
                raise Exception(f"Execution {execution_id} not found")
        else:
            execution = AgentExecution(
                goal=goal,
                orchestrator_model=orchestrator_model,
                status=AgentExecutionStatus.PLANNING
            )
            db.add(execution)
            await db.commit()
            await db.refresh(execution)

        logger.info(f"[Orchestrator] Starting execution #{execution.id}: {goal[:100]}")

        try:
            # Step 2: Plan task decomposition (always uses flash-lite, independent of chat model)
            plan = await self._plan_task(goal, "LITE")
            execution.plan = plan
            execution.status = AgentExecutionStatus.RUNNING
            await db.commit()

            logger.info(f"[Orchestrator] Plan created: {len(plan.get('steps', []))} steps")

            # Step 3: Execute workers (with parallelization support)
            results = await self._execute_workers_with_dependencies(
                db, execution.id, plan.get("steps", [])
            )

            # Step 4: Synthesize final result (always uses flash-lite)
            final_result = await self._synthesize_results(goal, plan, results, "LITE")
            execution.result = final_result
            execution.status = AgentExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            await db.commit()

            logger.info(f"[Orchestrator] Execution #{execution.id} completed successfully")
            return execution

        except Exception as e:
            logger.error(f"[Orchestrator] Execution #{execution.id} failed: {e}")
            execution.error = str(e)
            execution.status = AgentExecutionStatus.FAILED
            execution.completed_at = datetime.utcnow()
            await db.commit()
            return execution

    async def _plan_task(self, goal: str, model: str) -> dict:
        """
        Orchestrator generates step-by-step execution plan.

        Phase 3: Uses Gemini function calling for PRO model (reliable structured output).
        Falls back to prompt-based for other models.

        Args:
            goal: User's task goal
            model: Orchestrator model (PRO or GOOGLE)

        Returns:
            {
                "reasoning": str,  # Why this plan
                "steps": [
                    {
                        "worker": str,     # Worker type (RAG, Code, etc.)
                        "input": dict,     # Input parameters for worker
                        "description": str # What this step does
                    }
                ]
            }
        """
        # Use Gemini function calling for PRO model
        if model == "PRO":
            try:
                return await self._plan_task_with_function_calling(goal)
            except Exception as e:
                logger.warning(f"[Orchestrator] Function calling failed, falling back to prompt-based: {e}")
                # Fall through to prompt-based approach

        # Prompt-based planning (fallback or for other models)
        return await self._plan_task_prompt_based(goal, model)

    async def _plan_task_with_function_calling(self, goal: str) -> dict:
        """
        Use Gemini function calling for structured plan generation.

        Uses google-genai SDK with async support (client.aio).
        This is more reliable than prompt-based as JSON is guaranteed valid.
        """
        from google import genai as genai_sdk
        from google.genai import types

        # Define the function schema using new SDK types
        create_plan_function = types.FunctionDeclaration(
            name="create_execution_plan",
            description="Create a multi-step execution plan for agent orchestration",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "reasoning": types.Schema(
                        type="STRING",
                        description="Explanation of why this approach is optimal for the task"
                    ),
                    "steps": types.Schema(
                        type="ARRAY",
                        description="Ordered list of steps to execute",
                        items=types.Schema(
                            type="OBJECT",
                            properties={
                                "worker": types.Schema(
                                    type="STRING",
                                    enum=list(self.workers.keys()),
                                    description="Worker type to execute this step"
                                ),
                                "input": types.Schema(
                                    type="OBJECT",
                                    description="Input parameters for the worker (specific to worker type)"
                                ),
                                "description": types.Schema(
                                    type="STRING",
                                    description="What this step accomplishes"
                                ),
                                "depends_on": types.Schema(
                                    type="ARRAY",
                                    items=types.Schema(type="INTEGER"),
                                    description="Array of step indices (0-based) this step depends on. Empty or omitted means no dependencies."
                                )
                            },
                            required=["worker", "input", "description"]
                        )
                    )
                },
                required=["reasoning", "steps"]
            )
        )

        tool = types.Tool(function_declarations=[create_plan_function])

        # Get API key via rotation or fallback
        orchestrator_model_name = self.llm.settings.agent_mode_api_model or "gemini-3.1-flash-lite"
        api_key = None
        if self.key_rotator and self.key_rotator.keys:
            api_key, wait = self.key_rotator.get_next_key()
            if wait > 0:
                await asyncio.sleep(wait)
                api_key, _ = self.key_rotator.get_next_key()
        config_key = api_key or self.llm.settings.gemini_primary_key or self.llm.settings.gemini_fallback_key

        # Create per-request client (thread-safe, no global state)
        client = genai_sdk.Client(api_key=config_key)

        # Build prompt with worker capabilities
        prompt = f"""Create an execution plan for this task: {goal}

Available workers and their capabilities:

1. **RAG** - Search persona lore and knowledge base
   Required inputs: {{"query": str, "persona_name": str (optional), "top_k": int}}

2. **Code** - Analyze, generate, review, or execute code
   Required inputs: {{"task_type": "analyze|generate|execute|review", "code": str (for analyze/execute/review), "prompt": str (for generate), "language": str}}

3. **Shell** - Execute shell commands and file operations
   Required inputs: {{"operation": "command|file_read|file_write|list_dir", "command": str (for command), "path": str (for file ops)}}

4. **Memory** - Search user memories and profile
   Required inputs: {{"query": str, "memory_type": "episodic|persona|profile|all", "persona_name": str (optional), "limit": int}}

5. **Web** - Fetch and analyze web pages
   Required inputs: {{"url": str, "action": "fetch|summarize|extract_links|extract_data"}}

6. **Vision** - Analyze images (OCR, object detection, description)
   Required inputs: {{"task_type": "describe|ocr|detect|qa", "image_path": str, "question": str (for qa)}}

7. **Browser** - Automate browser interactions (Playwright)
   Required inputs: {{"action": "navigate|click|fill_form|extract|screenshot", "url": str, "selector": str (for click)}}

8. **Router** - Classify tasks and recommend workers
   Required inputs: {{"task_description": str, "context": str (optional)}}

{"9. **Search** - Search the web for information via Google\n   Required inputs: {{\"query\": str, \"max_results\": int (optional), \"synthesize\": bool (optional)}}" if "Search" in self.workers else ""}

Guidelines:
- Use multiple workers when task is complex
- Steps with depends_on can reference previous step outputs
- Steps without depends_on run in parallel
- Keep plans concise (1-5 steps)
- Be specific with input parameters

Call create_execution_plan with your plan."""

        # Generate with function calling via async client
        response = await client.aio.models.generate_content(
            model=orchestrator_model_name,
            contents=prompt,
            config=types.GenerateContentConfig(tools=[tool]),
        )

        # Extract function call arguments
        function_call = response.candidates[0].content.parts[0].function_call

        # Convert to dict
        plan = {
            "reasoning": function_call.args["reasoning"],
            "steps": [dict(step) for step in function_call.args["steps"]]
        }

        logger.info(f"[Orchestrator] Function calling plan created: {len(plan['steps'])} steps")
        return plan

    async def _plan_task_prompt_based(self, goal: str, model: str) -> dict:
        """Legacy prompt-based planning (fallback)."""
        prompt = f"""You are an AI task orchestrator. Given a user's goal, break it down into steps executed by specialized workers.

Available workers:
- RAG: Search persona lore and knowledge base (inputs: query, persona_name, top_k)
- Code: Analyze, generate, review, or execute code (inputs: task_type=analyze|generate|execute|review, code, language, prompt)
- Shell: Execute shell commands and file operations (inputs: operation=command|file_read|file_write|list_dir, command, path)
- Memory: Search user memories and profile (inputs: query, memory_type=episodic|persona|profile|all, persona_name, limit)
- Web: Fetch and analyze web pages (inputs: url, action=fetch|summarize|extract_links|extract_data)
- Vision: Analyze images (inputs: task_type=describe|ocr|detect|qa, image_path, question)
- Browser: Automate browser interactions (inputs: action=navigate|click|fill_form|extract|screenshot, url, selector)
- Router: Classify tasks and recommend workers (inputs: task_description, context)
{"- Search: Search the web for information (inputs: query, max_results, synthesize)" if "Search" in self.workers else ""}

User goal: {goal}

Create a JSON execution plan with this structure:
{{
  "reasoning": "Why this approach is best",
  "steps": [
    {{
      "worker": "RAG",
      "input": {{"query": "...", "persona_name": "...", "top_k": 5}},
      "description": "What this step accomplishes",
      "depends_on": [0]  // Optional: array of step indices this depends on (0-indexed). Omit for parallel execution.
    }},
    {{
      "worker": "Code",
      "input": {{"task_type": "analyze", "code": "...", "language": "python"}},
      "description": "Analyze the code",
      "depends_on": []  // Empty array = no dependencies, can run in parallel with step 0
    }}
  ]
}}

Important:
- Use ALL available workers when appropriate (don't limit to RAG only)
- Steps with "depends_on": [] or no "depends_on" key can run in parallel
- Steps with "depends_on": [0, 1] will wait for steps 0 and 1 to complete
- Keep steps minimal (1-5 steps max)
- Be specific with input parameters
- Return ONLY the JSON, no markdown formatting

Plan:"""

        try:
            # Use dedicated client instance (thread-safe, uses agent key rotation)
            api_key = None
            if self.key_rotator and self.key_rotator.keys:
                api_key, wait = self.key_rotator.get_next_key()
                if wait > 0:
                    await asyncio.sleep(wait)
                    api_key, _ = self.key_rotator.get_next_key()

            target_model = self.llm.settings.agent_mode_api_model or "gemini-3.1-flash-lite"
            key = api_key or self.llm.settings.gemini_primary_key or self.llm.settings.gemini_fallback_key
            if not key:
                raise Exception("No API key available for planning")

            from ..core.llm_clients import GeminiClient
            client = GeminiClient(api_key=key, model_name=target_model)
            response_text = client.generate_content_rest(prompt) or ""

            # Clean markdown code fences if present
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            plan = json.loads(response_text)
            return plan

        except Exception as e:
            logger.error(f"[Orchestrator] Planning failed: {e}")
            # Fallback: simple single-step RAG plan
            return {
                "reasoning": f"Fallback plan due to planning error: {str(e)}",
                "steps": [
                    {
                        "worker": "RAG",
                        "input": {"query": goal, "top_k": 5},
                        "description": "Search knowledge base for answer"
                    }
                ]
            }

    async def _synthesize_results(
        self,
        goal: str,
        plan: dict,
        worker_results: list[dict],
        model: str
    ) -> str:
        """
        Orchestrator combines worker outputs into final answer.

        Args:
            goal: Original user goal
            plan: Execution plan
            worker_results: List of worker output_data dicts
            model: Orchestrator model

        Returns:
            Synthesized final answer as string
        """
        # Format worker results
        results_text = []
        for i, (step, result) in enumerate(zip(plan.get("steps", []), worker_results), 1):
            worker_type = step.get("worker", "Unknown")
            description = step.get("description", "")
            results_text.append(f"Step {i} - {worker_type}: {description}")
            results_text.append(f"Result: {json.dumps(result, indent=2)}\n")

        combined_results = "\n".join(results_text)

        prompt = f"""Synthesize a final answer from worker results.

Original goal: {goal}

Worker results:
{combined_results}

Instructions:
- Create a coherent final answer that addresses the user's goal
- If workers provided source citations, include them
- Be concise but complete (2-4 paragraphs)
- If results are incomplete or contain errors, acknowledge limitations

Final answer:"""

        try:
            # Use dedicated client with key rotation (thread-safe)
            api_key = None
            if self.key_rotator and self.key_rotator.keys:
                api_key, wait = self.key_rotator.get_next_key()
                if wait > 0:
                    await asyncio.sleep(wait)
                    api_key, _ = self.key_rotator.get_next_key()

            target_model = self.llm.settings.agent_mode_api_model or "gemini-3.1-flash-lite"
            key = api_key or self.llm.settings.gemini_primary_key or self.llm.settings.gemini_fallback_key
            if not key:
                logger.warning("[Orchestrator] No client for synthesis, returning raw results")
                return f"Task completed with {len(worker_results)} steps:\n\n{combined_results}"

            from ..core.llm_clients import GeminiClient
            client = GeminiClient(api_key=key, model_name=target_model)
            response_text = client.generate_content_rest(prompt) or ""
            return response_text.strip()

        except Exception as e:
            logger.error(f"[Orchestrator] Synthesis failed: {e}")
            return f"Task completed with {len(worker_results)} steps:\n\n{combined_results}"

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (heuristic: 1 token ≈ 4 chars)."""
        return len(text) // 4 + 10

    async def _execute_workers_with_dependencies(
        self,
        db: AsyncSession,
        execution_id: int,
        steps: list
    ) -> list:
        """
        Execute workers with support for parallel execution and dependencies.

        Phase 3 enhancement: Detect independent steps and run them in parallel.

        Args:
            db: Database session
            execution_id: Execution ID
            steps: List of step definitions from plan

        Returns:
            List of worker results (in step order)
        """
        # Build dependency graph
        dependency_graph = self._build_dependency_graph(steps)

        # Track completed steps and their results
        completed_steps = {}
        results = [None] * len(steps)

        # Group steps by dependency level for parallel execution
        execution_levels = self._topological_sort(dependency_graph, len(steps))

        logger.info(f"[Orchestrator] Dependency graph: {len(execution_levels)} levels")

        for level_idx, level_steps in enumerate(execution_levels):
            logger.info(f"[Orchestrator] Executing level {level_idx + 1}: {len(level_steps)} parallel tasks")

            # Execute all steps in this level in parallel
            tasks = []
            for step_idx in level_steps:
                step = steps[step_idx]
                task = self._execute_single_worker(db, execution_id, step, step_idx, completed_steps)
                tasks.append(task)

            # Wait for all parallel tasks to complete
            level_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Store results
            for step_idx, result in zip(level_steps, level_results):
                if isinstance(result, Exception):
                    logger.error(f"[Orchestrator] Step {step_idx} failed: {result}")
                    results[step_idx] = {"error": str(result)}
                else:
                    results[step_idx] = result
                    completed_steps[step_idx] = result

        return results

    def _build_dependency_graph(self, steps: list) -> dict:
        """
        Build dependency graph from steps.

        Each step can specify dependencies via 'depends_on': [step_indices]

        Returns:
            Dict mapping step_idx -> list of dependency step_indices
        """
        graph = {}
        for i, step in enumerate(steps):
            depends_on = step.get("depends_on", [])
            # Convert to list if single int
            if isinstance(depends_on, int):
                depends_on = [depends_on]
            graph[i] = depends_on
        return graph

    def _topological_sort(self, graph: dict, num_steps: int) -> list:
        """
        Topological sort to determine execution levels.

        Returns:
            List of levels, where each level is a list of step indices that can run in parallel
        """
        completed = set()
        levels = []
        remaining = set(range(num_steps))

        while remaining:
            # Find nodes whose dependencies are all completed
            current_level = [
                i for i in remaining
                if all(dep in completed for dep in graph.get(i, []))
            ]

            if not current_level:
                # Circular dependency or error - execute remaining sequentially
                logger.warning("[Orchestrator] Circular dependency detected, executing remaining steps sequentially")
                current_level = list(remaining)

            levels.append(current_level)

            # Mark current level as completed
            for node in current_level:
                remaining.discard(node)
                completed.add(node)

        return levels

    async def _execute_single_worker(
        self,
        db: AsyncSession,
        execution_id: int,
        step: dict,
        step_idx: int,
        completed_steps: dict
    ) -> dict:
        """Execute a single worker with TPM+RPM management and concurrency cap."""
        async with self._semaphore:  # Cap parallel workers
            worker_type = step.get("worker")
            worker_input = step.get("input", {})

            if worker_type not in self.workers:
                logger.warning(f"[Orchestrator] Worker {worker_type} not implemented, skipping step {step_idx}")
                return {"error": f"Worker {worker_type} not available"}

            logger.info(f"[Orchestrator] Executing step {step_idx}: {worker_type}")

            # Inject results from dependencies if needed
            depends_on = step.get("depends_on", [])
            if depends_on:
                worker_input["dependency_results"] = {
                    dep_idx: completed_steps.get(dep_idx)
                    for dep_idx in depends_on
                    if dep_idx in completed_steps
                }

            # Dual rate limit check (TPM + RPM) before calling worker
            estimated_tokens = self._estimate_tokens(json.dumps(worker_input))
            wait_seconds = self.tpm.request_permission(estimated_tokens)
            if wait_seconds > 0:
                logger.warning(f"[Orchestrator] Rate limit hit, waiting {wait_seconds:.1f}s (step {step_idx})")
                await asyncio.sleep(wait_seconds)
                # Re-check after waiting (another worker may have consumed quota)
                wait_seconds = self.tpm.request_permission(estimated_tokens)
                if wait_seconds > 0:
                    await asyncio.sleep(wait_seconds)

            # Get rotated API key if key_rotator is available
            api_key = None
            if self.key_rotator and self.key_rotator.keys:
                api_key, key_wait = self.key_rotator.get_next_key()
                if key_wait > 0:
                    logger.info(f"[Orchestrator] Key rotation wait {key_wait:.1f}s (step {step_idx})")
                    await asyncio.sleep(key_wait)
                    api_key, _ = self.key_rotator.get_next_key()

            # Inject orchestrator-level params into worker input for _call_llm
            worker_input["_orchestrator_params"] = {
                "api_key": api_key,
                "thinking_budget": self._thinking_budget,
                "enable_thinking": self._enable_thinking,
            }

            # Execute worker
            worker = self.workers[worker_type]
            worker_task = await worker.execute(db, execution_id, worker_input)

            if worker_task.status == AgentTaskStatus.COMPLETED:
                return worker_task.output_data
            else:
                logger.error(f"[Orchestrator] Worker {worker_type} failed: {worker_task.error}")
                return {"error": worker_task.error}

    async def get_execution_status(
        self,
        db: AsyncSession,
        execution_id: int
    ) -> Optional[AgentExecution]:
        """
        Get execution status with worker tasks.

        Args:
            db: Database session
            execution_id: Execution ID

        Returns:
            AgentExecution with worker_tasks loaded, or None if not found
        """
        stmt = select(AgentExecution).where(AgentExecution.id == execution_id)
        result = await db.execute(stmt)
        execution = result.scalar_one_or_none()

        if execution:
            # Load worker tasks
            worker_stmt = select(AgentWorkerTask).where(
                AgentWorkerTask.execution_id == execution_id
            ).order_by(AgentWorkerTask.created_at)
            worker_result = await db.execute(worker_stmt)
            execution.worker_tasks = worker_result.scalars().all()

        return execution
