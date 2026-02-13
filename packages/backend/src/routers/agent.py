"""
Agent: execução de tarefas no PC.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy import select

from src.dependencies import AuthDep, DbDep
from src.models.schemas import AgentExecuteRequest, AgentApproveRequest, AgentTaskSchema
from src.models.database import AgentTask
from src.services.agent_service import get_permission_level, execute_task as run_agent_task

logger = logging.getLogger("ahri.router.agent")

router = APIRouter()


@router.post("/execute", response_model=AgentTaskSchema)
async def execute_task(request: AgentExecuteRequest, auth: AuthDep, db: DbDep):
    """Submete uma tarefa para execução pelo agente."""
    perm = get_permission_level(request.capability.value)

    # Cria registro no banco
    task = AgentTask(
        capability=request.capability.value,
        parameters=request.parameters,
        permission_level=perm.value,
        status="pending",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Se SAFE, executa automaticamente
    if perm.value == "SAFE":
        task.status = "running"
        await db.commit()

        result = run_agent_task(request.capability.value, request.parameters)

        task.status = "completed" if not result.get("error") else "failed"
        task.result = result.get("result", "")
        task.error = result.get("error", "")
        task.completed_at = datetime.utcnow()
        await db.commit()

    return AgentTaskSchema(
        id=task.id,
        capability=task.capability,
        parameters=task.parameters,
        permission_level=task.permission_level,
        status=task.status,
        result=task.result,
        error=task.error,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


@router.post("/{task_id}/approve", response_model=AgentTaskSchema)
async def approve_task(task_id: int, auth: AuthDep, db: DbDep):
    """Aprova uma tarefa pendente de confirmação e a executa."""
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "pending":
        raise HTTPException(status_code=400, detail=f"Task is not pending (status: {task.status})")

    # Executa a tarefa aprovada
    task.status = "running"
    await db.commit()

    exec_result = run_agent_task(task.capability, task.parameters)

    task.status = "completed" if not exec_result.get("error") else "failed"
    task.result = exec_result.get("result", "")
    task.error = exec_result.get("error", "")
    task.completed_at = datetime.utcnow()
    await db.commit()

    return AgentTaskSchema(
        id=task.id,
        capability=task.capability,
        parameters=task.parameters,
        permission_level=task.permission_level,
        status=task.status,
        result=task.result,
        error=task.error,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


@router.get("/{task_id}/status", response_model=AgentTaskSchema)
async def task_status(task_id: int, auth: AuthDep, db: DbDep):
    """Consulta o status de uma tarefa."""
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return AgentTaskSchema(
        id=task.id,
        capability=task.capability,
        parameters=task.parameters,
        permission_level=task.permission_level,
        status=task.status,
        result=task.result,
        error=task.error,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


@router.websocket("/ws")
async def agent_websocket(websocket: WebSocket):
    """WebSocket para updates de status de tarefas do agente."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "approve":
                task_id = data.get("task_id")
                # TODO: Implementar aprovação via WebSocket em Fase 3
                await websocket.send_json({
                    "type": "status",
                    "task_id": task_id,
                    "status": "approved",
                })
            else:
                await websocket.send_json({"type": "error", "detail": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info("Agent WebSocket client disconnected")
