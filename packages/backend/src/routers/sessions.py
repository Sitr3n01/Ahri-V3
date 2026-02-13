"""
Sessions: CRUD para sessões de chat.
"""
from fastapi import APIRouter, HTTPException

from src.dependencies import AuthDep, DbDep
from src.models.schemas import SessionSummary, SessionDetail, SessionCreateRequest, SessionRenameRequest, ChatMessageSchema
from src.services.session_service import SessionService
from src.services.persona_service import get_active_persona

router = APIRouter()


@router.get("", response_model=list[SessionSummary])
async def list_sessions(auth: AuthDep, db: DbDep, persona: str = ""):
    """Lista sessões de chat da persona ativa (ou especificada)."""
    svc = SessionService(db)
    persona_name = persona if persona else None
    sessions = await svc.list_sessions(persona_name)

    return [
        SessionSummary(
            id=s["id"],
            title=s["title"],
            persona_name=s["persona_name"],
            message_count=s["message_count"],
            created_at=s["created_at"],
            updated_at=s["updated_at"],
        )
        for s in sessions
    ]


@router.post("", response_model=SessionSummary)
async def create_session(request: SessionCreateRequest, auth: AuthDep, db: DbDep):
    """Cria uma nova sessão de chat."""
    svc = SessionService(db)
    session = await svc.create_session(title=request.title)

    return SessionSummary(
        id=session["id"],
        title=session["title"],
        persona_name=session["persona_name"],
        message_count=session["message_count"],
        created_at=session["created_at"],
        updated_at=session["updated_at"],
    )


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(session_id: int, auth: AuthDep, db: DbDep):
    """Carrega as mensagens de uma sessão."""
    svc = SessionService(db)
    session = await svc.get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionDetail(
        id=session["id"],
        title=session["title"],
        persona_name=session["persona_name"],
        message_count=session["message_count"],
        created_at=session["created_at"],
        updated_at=session["updated_at"],
        messages=[
            ChatMessageSchema(
                role=m["role"],
                content=m["content"],
                images=m.get("images", []),
                timestamp=m.get("timestamp", ""),
                meta=m.get("meta", {}),
            )
            for m in session["messages"]
        ],
    )


@router.put("/{session_id}")
async def rename_session(session_id: int, request: SessionRenameRequest, auth: AuthDep, db: DbDep):
    """Renomeia uma sessão."""
    svc = SessionService(db)
    success = await svc.rename_session(session_id, request.title)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "renamed", "title": request.title}


@router.delete("/{session_id}")
async def delete_session(session_id: int, auth: AuthDep, db: DbDep):
    """Deleta uma sessão e suas mensagens."""
    svc = SessionService(db)
    success = await svc.delete_session(session_id)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "deleted"}
