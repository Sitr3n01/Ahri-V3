"""
Memory: perfil do usuário, aprender, esquecer.
"""
import logging

from fastapi import APIRouter, HTTPException

from src.dependencies import AuthDep, DbDep
from src.models.schemas import UserProfileSchema, MemorySaveRequest, MemoryLearnRequest, MemoryForgetRequest
from src.services.memory_service import MemoryService
from src.services.persona_service import get_active_persona
from src.services.vector_service import get_vector_service

logger = logging.getLogger("ahri.router.memory")

router = APIRouter()


@router.get("/profile", response_model=UserProfileSchema)
async def get_profile(auth: AuthDep, db: DbDep):
    """Retorna o perfil do usuário."""
    svc = MemoryService(db)
    profile = await svc.get_profile()

    up = profile.get("user_profile", {})
    return UserProfileSchema(
        name=up.get("name", ""),
        archetype=up.get("archetype", ""),
        learning_style=up.get("learning_style", ""),
        attributes=profile.get("attributes", {}),
        preferences=profile.get("preferences", {}),
        knowledge_tracker=profile.get("knowledge_tracker", {}),
        active_quests=profile.get("active_quests", {}),
        session_log=profile.get("session_log", []),
    )


@router.post("/profile")
async def save_profile_endpoint(profile: UserProfileSchema, auth: AuthDep, db: DbDep):
    """Salva/atualiza o perfil do usuário."""
    svc = MemoryService(db)

    # Convert schema back to service format
    data = {
        "user_profile": {
            "name": profile.name,
            "archetype": profile.archetype,
            "learning_style": profile.learning_style,
        },
        "attributes": profile.attributes,
        "preferences": profile.preferences,
        "knowledge_tracker": profile.knowledge_tracker,
        "active_quests": profile.active_quests,
        "session_log": profile.session_log,
    }

    await svc.save_profile(data)
    return {"status": "saved", "profile": profile}


@router.post("/save")
async def save_memory(request: MemorySaveRequest, auth: AuthDep, db: DbDep):
    """Salva uma memória manualmente via [[SAVE:]] tag ou UI."""
    persona = get_active_persona()

    try:
        vector_svc = get_vector_service(persona)
        vector_svc.add_dynamic_memory(request.title, request.content)
        return {"status": "saved", "title": request.title, "persona": persona}
    except Exception as e:
        logger.error(f"Memory save error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save memory: {e}")


@router.post("/learn")
async def learn_topic(request: MemoryLearnRequest, auth: AuthDep, db: DbDep):
    """Comando /aprender - adiciona conhecimento ao RAG."""
    persona = get_active_persona()

    try:
        vector_svc = get_vector_service(persona)
        vector_svc.add_dynamic_memory(request.topic, request.content)

        # Também registra no perfil do usuário
        svc = MemoryService(db)
        await svc.add_fact(f"Aprendeu: {request.topic}")

        return {"status": "learned", "topic": request.topic, "persona": persona}
    except Exception as e:
        logger.error(f"Learn error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to learn: {e}")


@router.post("/forget")
async def forget_topic(request: MemoryForgetRequest, auth: AuthDep, db: DbDep):
    """Comando /esquecer - remove conhecimento do RAG."""
    persona = get_active_persona()

    try:
        vector_svc = get_vector_service(persona)
        # Busca documentos que correspondem ao tópico e remove
        results = vector_svc.collection.get(
            where={"source": "dynamic"},
            include=["documents", "metadatas"],
        )

        deleted = 0
        if results and results["ids"]:
            for i, doc_id in enumerate(results["ids"]):
                metadata = results["metadatas"][i] if results["metadatas"] else {}
                doc_text = results["documents"][i] if results["documents"] else ""
                title = metadata.get("title", "")

                if request.topic.lower() in title.lower() or request.topic.lower() in doc_text.lower():
                    vector_svc.collection.delete(ids=[doc_id])
                    deleted += 1

        return {"status": "forgotten", "topic": request.topic, "deleted_count": deleted}
    except Exception as e:
        logger.error(f"Forget error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to forget: {e}")
