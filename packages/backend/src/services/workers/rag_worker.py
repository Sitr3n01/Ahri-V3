"""
RAG Worker - Retrieval-Augmented Generation for lore and knowledge queries.

Specializes in ChromaDB vector search and synthesizing answers from persona lore.
Uses Gemma 3 12B for better context understanding (128K tokens).
"""
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ...models.database import AgentWorkerTask
from ..vector_service import VectorService
from .base_worker import BaseWorker


class RAGWorker(BaseWorker):
    """
    RAG worker for vector database queries and lore retrieval.

    Input schema:
    {
        "query": str,              # Question or search query
        "persona_name": str,       # Persona to search (optional, searches all if empty)
        "top_k": int               # Number of results to retrieve (default: 5)
    }

    Output schema:
    {
        "answer": str,             # Synthesized answer from retrieved documents
        "sources": [               # List of source documents used
            {
                "text": str,
                "metadata": dict
            }
        ]
    }
    """

    def __init__(self, llm_service, vector_service: Optional[VectorService] = None):
        super().__init__(
            llm_service=llm_service,
            worker_type="RAG",
            default_model="GOOGLE"  # Gemma 3 27B via LLMService
        )
        self.vector_service = vector_service or VectorService()

    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: dict
    ) -> AgentWorkerTask:
        """Execute RAG query and return synthesized answer."""
        start_time = time.time()

        # Create task record
        task = await self._create_task_record(db, execution_id, input_data)

        try:
            # Extract input parameters
            query = input_data.get("query", "")
            persona_name = input_data.get("persona_name", "")
            top_k = input_data.get("top_k", 5)

            if not query:
                raise ValueError("Query is required")

            # Step 1: Retrieve from ChromaDB
            results = self.vector_service.query(
                query_text=query,
                persona_name=persona_name if persona_name else None,
                top_k=top_k
            )

            if not results:
                # No documents found - return empty answer
                output_data = {
                    "answer": f"No information found for query: {query}",
                    "sources": []
                }
                return await self._complete_task(db, task, output_data, 0, start_time)

            # Step 2: Format retrieved documents for LLM
            context_parts = []
            for i, result in enumerate(results, 1):
                doc_text = result.get("text", "")
                metadata = result.get("metadata", {})
                source_file = metadata.get("source_file", "unknown")
                context_parts.append(f"[Document {i} from {source_file}]\n{doc_text}\n")

            context = "\n".join(context_parts)

            # Step 3: Use Gemma 3 27B to synthesize answer
            prompt = f"""Based on the following retrieved documents, answer the user's question.

Retrieved Documents:
{context}

User Question: {query}

Instructions:
- Synthesize a clear, accurate answer based ONLY on the provided documents
- If the documents don't contain enough information, say so
- Keep the answer concise (2-3 paragraphs max)
- Cite which documents support your answer when relevant

Answer:"""

            answer = await self._call_llm(prompt, model=self.default_model)

            # Estimate tokens (prompt + response)
            tokens_used = self._estimate_tokens(prompt + answer)

            # Step 4: Format output
            output_data = {
                "answer": answer,
                "sources": [
                    {
                        "text": r.get("text", "")[:500],  # Truncate for storage
                        "metadata": r.get("metadata", {})
                    }
                    for r in results
                ]
            }

            return await self._complete_task(db, task, output_data, tokens_used, start_time)

        except Exception as e:
            return await self._fail_task(db, task, str(e), start_time)
