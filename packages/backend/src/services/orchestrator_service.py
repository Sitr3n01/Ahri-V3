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
from .tpm_manager import TPMManager
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
        tpm_manager: Optional[TPMManager] = None
    ):
        self.llm = llm_service
        self.vector_service = vector_service
        self.tpm = tpm_manager or TPMManager(limit_tpm=15000)

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

    async def execute_task(
        self,
        db: AsyncSession,
        goal: str,
        orchestrator_model: str = "PRO"
    ) -> AgentExecution:
        """
        Main orchestration loop.

        Args:
            db: Database session
            goal: User's task goal in natural language
            orchestrator_model: Model for orchestration (PRO=Gemini 2.5 Flash, GOOGLE=Gemma 3 27B)

        Returns:
            Completed AgentExecution with result

        Flow:
            1. Create execution record (status=planning)
            2. Orchestrator plans task decomposition
            3. Execute workers sequentially/parallel
            4. Synthesize final result
            5. Update execution (status=completed/failed)
        """
        # Step 1: Create execution record
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
            # Step 2: Plan task decomposition
            plan = await self._plan_task(goal, orchestrator_model)
            execution.plan = plan
            execution.status = AgentExecutionStatus.RUNNING
            await db.commit()

            logger.info(f"[Orchestrator] Plan created: {len(plan.get('steps', []))} steps")

            # Step 3: Execute workers (with parallelization support)
            results = await self._execute_workers_with_dependencies(
                db, execution.id, plan.get("steps", [])
            )

            # Step 4: Synthesize final result
            final_result = await self._synthesize_results(goal, plan, results, orchestrator_model)
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

        This is more reliable than prompt-based as JSON is guaranteed valid.
        """
        import google.generativeai as genai
        from google.generativeai.types import FunctionDeclaration, Tool, GenerateContentConfig

        # Define the function schema
        create_plan_function = FunctionDeclaration(
            name="create_execution_plan",
            description="Create a multi-step execution plan for agent orchestration",
            parameters={
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "Explanation of why this approach is optimal for the task"
                    },
                    "steps": {
                        "type": "array",
                        "description": "Ordered list of steps to execute",
                        "items": {
                            "type": "object",
                            "properties": {
                                "worker": {
                                    "type": "string",
                                    "enum": ["RAG", "Code", "Shell", "Memory", "Web", "Vision", "Browser", "Router"],
                                    "description": "Worker type to execute this step"
                                },
                                "input": {
                                    "type": "object",
                                    "description": "Input parameters for the worker (specific to worker type)"
                                },
                                "description": {
                                    "type": "string",
                                    "description": "What this step accomplishes"
                                },
                                "depends_on": {
                                    "type": "array",
                                    "items": {"type": "integer"},
                                    "description": "Array of step indices (0-based) this step depends on. Empty or omitted means no dependencies."
                                }
                            },
                            "required": ["worker", "input", "description"]
                        }
                    }
                },
                "required": ["reasoning", "steps"]
            }
        )

        # Create model with function calling
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash-exp",  # Latest Gemini Flash
            tools=[Tool(function_declarations=[create_plan_function])]
        )

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

Guidelines:
- Use multiple workers when task is complex
- Steps with depends_on can reference previous step outputs
- Steps without depends_on run in parallel
- Keep plans concise (1-5 steps)
- Be specific with input parameters

Call create_execution_plan with your plan."""

        # Generate with function calling
        response = await model.generate_content_async(prompt)

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

Available workers (Phase 3):
- RAG: Search persona lore and knowledge base (inputs: query, persona_name, top_k)
- Code: Analyze, generate, review, or execute code (inputs: task_type=analyze|generate|execute|review, code, language, prompt)
- Shell: Execute shell commands and file operations (inputs: operation=command|file_read|file_write|list_dir, command, path)
- Memory: Search user memories and profile (inputs: query, memory_type=episodic|persona|profile|all, persona_name, limit)
- Web: Fetch and analyze web pages (inputs: url, action=fetch|summarize|extract_links|extract_data)
- Vision: Analyze images (inputs: task_type=describe|ocr|detect|qa, image_path, question)
- Browser: Automate browser interactions (inputs: action=navigate|click|fill_form|extract|screenshot, url, selector)
- Router: Classify tasks and recommend workers (inputs: task_description, context)

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
            self.llm.set_mode(model)
            response_text = ""
            for chunk in self.llm.generate_response(
                message=prompt,
                system_prompt="",
                history=[],
            ):
                response_text += chunk

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
            self.llm.set_mode(model)
            response_text = ""
            for chunk in self.llm.generate_response(
                message=prompt,
                system_prompt="",
                history=[],
            ):
                response_text += chunk
            return response_text.strip()

        except Exception as e:
            logger.error(f"[Orchestrator] Synthesis failed: {e}")
            # Fallback: just concatenate results
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
        """Execute a single worker with TPM management."""
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

        # TPM check before calling worker
        estimated_tokens = self._estimate_tokens(json.dumps(worker_input))
        wait_seconds = self.tpm.request_tokens(estimated_tokens)
        if wait_seconds > 0:
            logger.warning(f"[Orchestrator] TPM quota exceeded, waiting {wait_seconds:.1f}s")
            await asyncio.sleep(wait_seconds)

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
