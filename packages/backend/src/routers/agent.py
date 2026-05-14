"""
Compatibility endpoints for the legacy /agent API.

The V4 engine lives under /engine/v2, but the desktop/web clients and older
tests still rely on the small task API shape from V3. These endpoints keep that
contract alive while new agent work moves to the engine router.
"""
import subprocess
import time
from itertools import count
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.dependencies import AuthDep

router = APIRouter()


class AgentExecuteRequest(BaseModel):
    capability: str
    parameters: dict[str, Any] = Field(default_factory=dict)


_task_ids = count(1)
_tasks: dict[int, dict[str, Any]] = {}


def _store_task(task: dict[str, Any]) -> dict[str, Any]:
    task_id = next(_task_ids)
    task["id"] = task_id
    task["created_at"] = time.time()
    _tasks[task_id] = task
    return task


def _system_info() -> dict[str, Any]:
    import os
    import platform

    return {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "python_version": platform.python_version(),
        "cwd": os.getcwd(),
    }


@router.post("/execute")
async def execute_agent_task(request: AgentExecuteRequest, auth: AuthDep):
    """Execute or enqueue a legacy agent capability."""
    if request.capability == "system_info":
        return _store_task({
            "capability": request.capability,
            "parameters": request.parameters,
            "permission_level": "SAFE",
            "status": "completed",
            "result": _system_info(),
        })

    if request.capability == "shell_execute":
        return _store_task({
            "capability": request.capability,
            "parameters": request.parameters,
            "permission_level": "CONFIRM",
            "status": "pending",
            "result": None,
        })

    raise HTTPException(status_code=400, detail=f"Unknown capability: {request.capability}")


@router.post("/{task_id}/approve")
async def approve_agent_task(task_id: int, auth: AuthDep):
    """Approve and run a pending legacy task."""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task["status"] != "pending":
        return task

    if task["capability"] != "shell_execute":
        task["status"] = "completed"
        return task

    command = str(task.get("parameters", {}).get("command", ""))
    if not command:
        task.update({"status": "failed", "error": "Missing command"})
        return task

    try:
        completed = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        task.update({
            "status": "completed" if completed.returncode == 0 else "failed",
            "result": {
                "stdout": completed.stdout,
                "stderr": completed.stderr,
                "returncode": completed.returncode,
            },
        })
    except Exception as exc:
        task.update({"status": "failed", "error": str(exc)})

    return task


@router.get("/{task_id}/status")
async def get_agent_task_status(task_id: int, auth: AuthDep):
    """Return a legacy task status."""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
