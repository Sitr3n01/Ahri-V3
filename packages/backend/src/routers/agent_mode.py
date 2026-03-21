"""
Agent Mode Router - Orchestrated multi-agent task execution endpoints.

Provides REST and WebSocket APIs for submitting tasks, checking status,
and streaming real-time updates from workers.

V2: Background execution (non-blocking), dual rate limiting (TPM+RPM).
"""
import asyncio
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db, AgentExecution
from ..models.schemas import (
    AgentModeExecuteRequest,
    AgentExecutionSchema,
    AgentWorkerTaskSchema,
    AgentExecutionStatus
)
from ..dependencies import get_llm_service, get_vector_service
from ..services.orchestrator_service import OrchestratorService
from ..services.tpm_manager import TPMManager, AgentKeyRotator
from ..config import get_settings

logger = logging.getLogger("ahri.agent_mode")
router = APIRouter(prefix="/agent-mode", tags=["agent-mode"])

# Global TPM+RPM manager (shared across requests, thread-safe)
_settings = get_settings()
tpm_manager = TPMManager(
    limit_tpm=_settings.agent_mode_tpm_limit,
    limit_rpm=_settings.agent_mode_rpm_limit
)

# Global key rotator for round-robin across multiple API keys
key_rotator = AgentKeyRotator(
    keys=_settings.agent_api_keys,
    rpm_per_key=_settings.agent_mode_rpm_limit
)

# Track background tasks to prevent garbage collection
_background_tasks: dict[int, asyncio.Task] = {}


def _vision_prepass_sync(images: list[str]) -> str:
    """
    Analyze images with Gemini Flash and return text descriptions.
    Synchronous — meant to run in executor from async context.

    This lets text-only models (flash-lite workers) understand image content.
    Uses vision key rotation for rate limit distribution.
    """
    import base64
    import io
    from PIL import Image
    from src.core.llm_clients import GeminiClient

    settings = get_settings()
    vision_keys = settings.vision_keys
    if not vision_keys:
        return ""

    descriptions = []
    for idx, img_b64 in enumerate(images):
        try:
            key = vision_keys[idx % len(vision_keys)]
            client = GeminiClient(api_key=key, model_name="gemini-2.5-flash")

            img_bytes = base64.b64decode(img_b64)
            img = Image.open(io.BytesIO(img_bytes))

            response = client.generate_content_sync(contents=[
                "Descreva esta imagem em detalhes para que outro modelo de IA (sem visão) "
                "possa entender completamente o conteúdo. Inclua: objetos, texto visível, "
                "cores, layout, pessoas, e qualquer informação relevante. Seja preciso e conciso.",
                img,
            ])
            descriptions.append(f"[Imagem {idx+1}]: {response.text}")
        except Exception as e:
            logger.error(f"[Vision Pre-pass] Failed to analyze image {idx+1}: {e}")
            descriptions.append(f"[Imagem {idx+1}]: (falha na análise: {e})")

    return "\n".join(descriptions)


async def _run_orchestration(
    execution_id: int,
    goal: str,
    orchestrator_model: str,
    reasoning_level: str = "medium",
    enable_thinking: bool = False,
    internet_search_enabled: bool = False,
    images: list[str] | None = None,
):
    """Run orchestration in background. Uses its own DB session."""
    from ..models.database import async_session_factory

    llm_service = get_llm_service()
    vector_service = get_vector_service()
    orchestrator = OrchestratorService(
        llm_service, vector_service, tpm_manager, key_rotator=key_rotator
    )

    # Vision pre-pass: analyze images with Gemini Flash, inject descriptions into goal
    enriched_goal = goal
    if images:
        logger.info(f"[AgentMode] Vision pre-pass for {len(images)} image(s)")
        loop = asyncio.get_running_loop()
        image_context = await loop.run_in_executor(None, _vision_prepass_sync, images)
        if image_context:
            enriched_goal = f"{goal}\n\n[CONTEXTO VISUAL - Análise das imagens enviadas]\n{image_context}"
            logger.info(f"[AgentMode] Vision context injected ({len(image_context)} chars)")

    async with async_session_factory() as db:
        try:
            await orchestrator.execute_task(
                db=db,
                goal=enriched_goal,
                orchestrator_model=orchestrator_model,
                execution_id=execution_id,
                reasoning_level=reasoning_level,
                enable_thinking=enable_thinking,
                internet_search_enabled=internet_search_enabled,
            )
        except Exception as e:
            logger.error(f"[AgentMode] Background execution {execution_id} failed: {e}")
            # Mark as failed in DB
            from sqlalchemy import select
            stmt = select(AgentExecution).where(AgentExecution.id == execution_id)
            result = await db.execute(stmt)
            execution = result.scalar_one_or_none()
            if execution:
                from datetime import datetime
                execution.status = AgentExecutionStatus.FAILED
                execution.error = str(e)
                execution.completed_at = datetime.utcnow()
                await db.commit()
        finally:
            _background_tasks.pop(execution_id, None)


@router.post("/execute", response_model=AgentExecutionSchema)
async def execute_task(
    request: AgentModeExecuteRequest,
    db: AsyncSession = Depends(get_db),
    llm_service = Depends(get_llm_service),
    vector_service = Depends(get_vector_service)
):
    """
    Submit a new agent mode task for execution.

    Returns IMMEDIATELY with execution record (status=planning).
    Orchestration runs in background via asyncio.create_task().
    Poll /agent-mode/{execution_id}/status or use WebSocket for updates.
    """
    try:
        # Step 1: Create execution record immediately
        execution = AgentExecution(
            goal=request.goal,
            orchestrator_model=request.orchestrator_model,
            status=AgentExecutionStatus.PLANNING
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        logger.info(f"[AgentMode] Created execution #{execution.id}, launching background task")

        # Step 2: Launch orchestration in background (non-blocking)
        task = asyncio.create_task(
            _run_orchestration(
                execution.id,
                request.goal,
                request.orchestrator_model,
                reasoning_level=getattr(request, 'reasoning_level', 'medium'),
                enable_thinking=getattr(request, 'enable_thinking', False),
                internet_search_enabled=getattr(request, 'internet_search_enabled', False),
                images=request.images if request.images else None,
            )
        )
        _background_tasks[execution.id] = task

        # Step 3: Return immediately
        return AgentExecutionSchema(
            id=execution.id,
            goal=execution.goal,
            orchestrator_model=execution.orchestrator_model,
            status=execution.status,
            plan=execution.plan or {},
            result=execution.result or "",
            error=execution.error or "",
            created_at=execution.created_at,
            completed_at=execution.completed_at,
            worker_tasks=[]
        )

    except Exception as e:
        logger.error(f"[AgentMode] Failed to create execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{execution_id}/status", response_model=AgentExecutionSchema)
async def get_execution_status(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    llm_service = Depends(get_llm_service),
    vector_service = Depends(get_vector_service)
):
    """
    Get current status of an execution, including worker tasks.

    Use this endpoint to poll for completion or retrieve final results.
    """
    orchestrator = OrchestratorService(llm_service, vector_service, tpm_manager)
    execution = await orchestrator.get_execution_status(db, execution_id)

    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    # Convert worker tasks to schemas
    worker_schemas = [
        AgentWorkerTaskSchema(
            id=task.id,
            execution_id=task.execution_id,
            worker_type=task.worker_type,
            model=task.model,
            input_data=task.input_data,
            output_data=task.output_data,
            tokens_used=task.tokens_used,
            duration_ms=task.duration_ms,
            status=task.status,
            error=task.error,
            created_at=task.created_at,
            completed_at=task.completed_at
        )
        for task in (execution.worker_tasks or [])
    ]

    return AgentExecutionSchema(
        id=execution.id,
        goal=execution.goal,
        orchestrator_model=execution.orchestrator_model,
        status=execution.status,
        plan=execution.plan,
        result=execution.result,
        error=execution.error,
        created_at=execution.created_at,
        completed_at=execution.completed_at,
        worker_tasks=worker_schemas
    )


@router.get("/{execution_id}/workers", response_model=List[AgentWorkerTaskSchema])
async def get_worker_tasks(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    llm_service = Depends(get_llm_service),
    vector_service = Depends(get_vector_service)
):
    """
    Get all worker tasks for an execution.

    Useful for displaying worker progress in UI.
    """
    orchestrator = OrchestratorService(llm_service, vector_service, tpm_manager)
    execution = await orchestrator.get_execution_status(db, execution_id)

    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    return [
        AgentWorkerTaskSchema(
            id=task.id,
            execution_id=task.execution_id,
            worker_type=task.worker_type,
            model=task.model,
            input_data=task.input_data,
            output_data=task.output_data,
            tokens_used=task.tokens_used,
            duration_ms=task.duration_ms,
            status=task.status,
            error=task.error,
            created_at=task.created_at,
            completed_at=task.completed_at
        )
        for task in (execution.worker_tasks or [])
    ]


@router.websocket("/ws/{execution_id}")
async def websocket_execution_stream(
    websocket: WebSocket,
    execution_id: int
):
    """
    WebSocket endpoint for real-time execution updates.

    Sends messages when:
    - Status changes (planning -> running -> completed/failed)
    - Worker starts (worker_started)
    - Worker completes (worker_completed)
    - Execution completes (execution_completed)
    - TPM quota info (tpm_status)

    Message format:
    {
        "type": "worker_started" | "worker_completed" | "execution_completed" | "status_update" | "tpm_status",
        "data": {...}
    }

    Phase 3: Real-time streaming with DB polling every 500ms
    """
    from ..dependencies import get_llm_service, get_vector_service
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from ..models.database import get_db, AgentWorkerTask
    from sqlalchemy import select

    await websocket.accept()
    llm_service = get_llm_service()
    vector_service = get_vector_service()
    orchestrator = OrchestratorService(llm_service, vector_service, tpm_manager)

    # Timeout configuration
    MAX_POLL_DURATION = 600  # 10 minutes maximum
    start_time = asyncio.get_event_loop().time()

    try:
        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "execution_id": execution_id,
            "timestamp": start_time
        })

        # Track last seen worker task IDs to detect new ones
        seen_worker_ids = set()
        last_execution_status = None

        # Poll database every 500ms for updates
        while True:
            # Check timeout
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > MAX_POLL_DURATION:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Execution timeout after {MAX_POLL_DURATION}s"
                })
                return
            async for db_session in get_db():
                try:
                    # Get current execution status
                    execution = await orchestrator.get_execution_status(db_session, execution_id)

                    if not execution:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Execution not found"
                        })
                        return

                    # Send execution status update if changed
                    if execution.status != last_execution_status:
                        await websocket.send_json({
                            "type": "status_update",
                            "data": {
                                "execution_id": execution.id,
                                "status": execution.status,
                                "plan": execution.plan,
                                "reasoning": execution.plan.get("reasoning") if execution.plan else None
                            }
                        })
                        last_execution_status = execution.status

                    # Check for new worker tasks
                    for task in (execution.worker_tasks or []):
                        if task.id not in seen_worker_ids:
                            # New task detected - send worker_started event
                            seen_worker_ids.add(task.id)

                            await websocket.send_json({
                                "type": "worker_started",
                                "data": {
                                    "task_id": task.id,
                                    "worker_type": task.worker_type,
                                    "model": task.model,
                                    "input_data": task.input_data,
                                    "created_at": str(task.created_at)
                                }
                            })

                        # If task is completed/failed, send completion event
                        if task.status in ["completed", "failed"] and task.completed_at:
                            await websocket.send_json({
                                "type": "worker_completed",
                                "data": {
                                    "task_id": task.id,
                                    "worker_type": task.worker_type,
                                    "status": task.status,
                                    "output_data": task.output_data if task.status == "completed" else None,
                                    "error": task.error if task.status == "failed" else None,
                                    "tokens_used": task.tokens_used,
                                    "duration_ms": task.duration_ms,
                                    "completed_at": str(task.completed_at)
                                }
                            })

                    # Send TPM + RPM status
                    tpm_status = tpm_manager.get_status()
                    await websocket.send_json({
                        "type": "tpm_status",
                        "data": {
                            "tokens_used_window": tpm_status["tokens_used_window"],
                            "tokens_remaining": tpm_status["tokens_remaining"],
                            "limit_tpm": tpm_status["limit_tpm"],
                            "utilization_percent": tpm_status["utilization_percent"],
                            "requests_used": tpm_status["requests_used"],
                            "requests_remaining": tpm_status["requests_remaining"],
                            "limit_rpm": tpm_status["limit_rpm"],
                            "rpm_utilization_percent": tpm_status["rpm_utilization_percent"],
                        }
                    })

                    # If execution is completed/failed, send final message and close
                    if execution.status in [AgentExecutionStatus.COMPLETED, AgentExecutionStatus.FAILED]:
                        await websocket.send_json({
                            "type": "execution_completed",
                            "data": {
                                "execution_id": execution.id,
                                "status": execution.status,
                                "result": execution.result,
                                "error": execution.error,
                                "completed_at": str(execution.completed_at),
                                "worker_count": len(execution.worker_tasks or [])
                            }
                        })
                        logger.info(f"[AgentMode WS] Execution {execution_id} {execution.status}, closing WebSocket")
                        return

                    break  # Exit db session loop
                except Exception as e:
                    logger.error(f"[AgentMode WS] Poll error: {e}")
                    break

            # Wait 500ms before next poll
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"[AgentMode] WebSocket disconnected for execution {execution_id}")
    except Exception as e:
        logger.error(f"[AgentMode WS] Error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
