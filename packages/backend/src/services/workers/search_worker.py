"""
Search Worker - Specialized agent for web search via Google Custom Search Engine.

Uses the existing SearchService to perform web searches and optionally
synthesizes results with an LLM for a coherent summary.

Capabilities:
- Web search via Google CSE API
- Result synthesis with LLM summarization
- Quota-aware (respects daily search limits)
"""
import time
import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.database import AgentWorkerTask
from src.services.workers.base_worker import BaseWorker
from src.services.search_service import SearchService

logger = logging.getLogger("ahri.worker.search")


class SearchWorker(BaseWorker):
    """Worker for web search via Google Custom Search Engine."""

    ROLE_PROMPT = (
        "[ROLE: Research Analyst]\n"
        "You perform web searches and synthesize findings into actionable answers.\n"
        "Prioritize authoritative sources. Cross-reference multiple results.\n"
        "Distinguish facts from opinions. Note when information may be outdated.\n"
        "Output: JSON with 'summary', 'sources', and 'confidence' fields."
    )

    def __init__(self, llm_service):
        super().__init__(
            llm_service=llm_service,
            worker_type="Search",
            default_model="LITE"
        )

    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: Dict[str, Any]
    ) -> AgentWorkerTask:
        """
        Perform a web search and optionally synthesize results.

        Input format:
        {
            "query": "search terms",
            "max_results": 5,           (optional, default: 5)
            "synthesize": true,          (optional, default: true)
            "_orchestrator_params": {}   (injected by orchestrator)
        }
        """
        task = await self._create_task_record(db, execution_id, input_data)
        start_time = time.time()

        try:
            query = input_data.get("query", "")
            max_results = input_data.get("max_results", 5)
            synthesize = input_data.get("synthesize", True)

            if not query:
                return await self._fail_task(db, task, "No search query provided", start_time)

            # Extract orchestrator params
            orch_params = input_data.get("_orchestrator_params", {})
            api_key = orch_params.get("api_key")
            thinking_budget = orch_params.get("thinking_budget", 0)

            logger.info(f"[SearchWorker] Searching: '{query}' (max: {max_results})")

            # Use SearchService to perform the search
            search_service = SearchService(db)
            search_result = await search_service.search(query, max_results=max_results)

            if search_result.get("error"):
                return await self._fail_task(
                    db, task,
                    f"Search failed: {search_result['error']}",
                    start_time
                )

            results = search_result.get("results", [])
            remaining_quota = search_result.get("remaining_quota", 0)

            output = {
                "query": query,
                "results": results,
                "result_count": len(results),
                "remaining_quota": remaining_quota,
            }

            # Optionally synthesize results with LLM
            if synthesize and results:
                results_text = "\n\n".join(
                    f"**{r['title']}** ({r['link']})\n{r['snippet']}"
                    for r in results
                )
                synthesis_prompt = (
                    f"Based on these web search results for '{query}', "
                    f"provide a concise, informative summary:\n\n{results_text}\n\n"
                    f"Summarize the key findings in 2-4 sentences."
                )

                summary = await self._call_llm(
                    synthesis_prompt,
                    api_key=api_key,
                    thinking_budget=thinking_budget,
                )
                output["summary"] = summary

            tokens_used = len(query) // 4 + sum(len(str(r)) for r in results) // 4
            return await self._complete_task(db, task, output, tokens_used, start_time)

        except Exception as e:
            logger.error(f"[SearchWorker] Error: {e}")
            return await self._fail_task(db, task, str(e), start_time)
