"""
Agent Service - Motor de execucao de tarefas no PC.
NOVO sistema para Ahri V3.
"""
import os
import json
import subprocess
import platform
import logging
import webbrowser
from datetime import datetime
from typing import Optional
from pathlib import Path

from src.models.schemas import AgentCapability, PermissionLevel, AgentTaskStatus

logger = logging.getLogger("ahri.agent")

# Mapeamento de capabilities para nivel de permissao
PERMISSION_MAP: dict[str, PermissionLevel] = {
    AgentCapability.FILE_READ: PermissionLevel.SAFE,
    AgentCapability.DIR_LIST: PermissionLevel.SAFE,
    AgentCapability.SYSTEM_INFO: PermissionLevel.SAFE,
    AgentCapability.CLIPBOARD_READ: PermissionLevel.SAFE,
    AgentCapability.BROWSER_OPEN: PermissionLevel.SAFE,
    AgentCapability.APP_LAUNCH: PermissionLevel.CONFIRM,
    AgentCapability.CLIPBOARD_WRITE: PermissionLevel.CONFIRM,
    AgentCapability.FILE_WRITE: PermissionLevel.CONFIRM,
    AgentCapability.FILE_DELETE: PermissionLevel.CONFIRM,
    AgentCapability.SHELL_EXECUTE: PermissionLevel.CONFIRM,
    AgentCapability.CODE_EXECUTE: PermissionLevel.CONFIRM,
    AgentCapability.SCREENSHOT: PermissionLevel.CONFIRM,
}


def get_permission_level(capability: str) -> PermissionLevel:
    """Retorna o nivel de permissao para uma capability."""
    return PERMISSION_MAP.get(capability, PermissionLevel.CONFIRM)


def execute_task(capability: str, parameters: dict) -> dict:
    """
    Executa uma tarefa do agente. Retorna dict com 'result' e 'error'.
    Esta funcao so deve ser chamada APOS aprovacao (se CONFIRM).
    """
    try:
        handler = CAPABILITY_HANDLERS.get(capability)
        if handler is None:
            return {"result": "", "error": f"Unknown capability: {capability}"}
        return handler(parameters)
    except Exception as e:
        logger.error(f"Agent task error ({capability}): {e}")
        return {"result": "", "error": str(e)}


# =============================================================================
# Capability Handlers
# =============================================================================

def _handle_file_read(params: dict) -> dict:
    path = params.get("path", "")
    if not path:
        return {"result": "", "error": "No path provided"}

    p = Path(path)
    if not p.exists():
        return {"result": "", "error": f"File not found: {path}"}
    if not p.is_file():
        return {"result": "", "error": f"Not a file: {path}"}

    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        # Limita tamanho para evitar overload
        if len(content) > 50000:
            content = content[:50000] + f"\n\n[... truncated, total {len(content)} chars]"
        return {"result": content, "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_dir_list(params: dict) -> dict:
    path = params.get("path", ".")

    p = Path(path)
    if not p.exists():
        return {"result": "", "error": f"Directory not found: {path}"}
    if not p.is_dir():
        return {"result": "", "error": f"Not a directory: {path}"}

    try:
        entries = []
        for item in sorted(p.iterdir()):
            prefix = "[DIR]" if item.is_dir() else "[FILE]"
            size = ""
            if item.is_file():
                size = f" ({item.stat().st_size} bytes)"
            entries.append(f"{prefix} {item.name}{size}")

        return {"result": "\n".join(entries), "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_system_info(params: dict) -> dict:
    import psutil  # Optional dependency

    info = {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "hostname": platform.node(),
        "cpu_count": os.cpu_count(),
        "cwd": os.getcwd(),
        "user": os.getenv("USERNAME") or os.getenv("USER", "unknown"),
        "datetime": datetime.now().isoformat(),
    }

    try:
        import psutil
        info["cpu_percent"] = psutil.cpu_percent()
        info["memory_total_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
        info["memory_used_percent"] = psutil.virtual_memory().percent
        info["disk_usage_percent"] = psutil.disk_usage("/").percent
    except ImportError:
        pass

    return {"result": json.dumps(info, indent=2), "error": ""}


def _handle_browser_open(params: dict) -> dict:
    url = params.get("url", "")
    if not url:
        return {"result": "", "error": "No URL provided"}

    webbrowser.open(url)
    return {"result": f"Opened: {url}", "error": ""}


def _handle_file_write(params: dict) -> dict:
    path = params.get("path", "")
    content = params.get("content", "")
    if not path:
        return {"result": "", "error": "No path provided"}

    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return {"result": f"Written: {path} ({len(content)} chars)", "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_file_delete(params: dict) -> dict:
    path = params.get("path", "")
    if not path:
        return {"result": "", "error": "No path provided"}

    p = Path(path)
    if not p.exists():
        return {"result": "", "error": f"File not found: {path}"}

    try:
        p.unlink()
        return {"result": f"Deleted: {path}", "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_shell_execute(params: dict) -> dict:
    command = params.get("command", "")
    if not command:
        return {"result": "", "error": "No command provided"}

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=params.get("cwd"),
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]: {result.stderr}"
        output += f"\n[EXIT CODE]: {result.returncode}"
        return {"result": output, "error": ""}
    except subprocess.TimeoutExpired:
        return {"result": "", "error": "Command timed out (30s)"}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_code_execute(params: dict) -> dict:
    code = params.get("code", "")
    language = params.get("language", "python")
    if not code:
        return {"result": "", "error": "No code provided"}

    if language != "python":
        return {"result": "", "error": f"Language not supported: {language}"}

    try:
        result = subprocess.run(
            ["python", "-c", code],
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]: {result.stderr}"
        return {"result": output, "error": ""}
    except subprocess.TimeoutExpired:
        return {"result": "", "error": "Code execution timed out (30s)"}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_clipboard_read(params: dict) -> dict:
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        content = root.clipboard_get()
        root.destroy()
        return {"result": content, "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_clipboard_write(params: dict) -> dict:
    text = params.get("text", "")
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()
        root.destroy()
        return {"result": f"Copied to clipboard ({len(text)} chars)", "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


def _handle_screenshot(params: dict) -> dict:
    return {"result": "", "error": "Screenshot not yet implemented (Fase 3)"}


def _handle_app_launch(params: dict) -> dict:
    path = params.get("path", "")
    if not path:
        return {"result": "", "error": "No application path provided"}

    try:
        os.startfile(path)
        return {"result": f"Launched: {path}", "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}


# Handler registry
CAPABILITY_HANDLERS = {
    AgentCapability.FILE_READ: _handle_file_read,
    AgentCapability.DIR_LIST: _handle_dir_list,
    AgentCapability.SYSTEM_INFO: _handle_system_info,
    AgentCapability.BROWSER_OPEN: _handle_browser_open,
    AgentCapability.FILE_WRITE: _handle_file_write,
    AgentCapability.FILE_DELETE: _handle_file_delete,
    AgentCapability.SHELL_EXECUTE: _handle_shell_execute,
    AgentCapability.CODE_EXECUTE: _handle_code_execute,
    AgentCapability.CLIPBOARD_READ: _handle_clipboard_read,
    AgentCapability.CLIPBOARD_WRITE: _handle_clipboard_write,
    AgentCapability.SCREENSHOT: _handle_screenshot,
    AgentCapability.APP_LAUNCH: _handle_app_launch,
}
