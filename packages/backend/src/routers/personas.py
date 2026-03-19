"""
Personas: listar, detalhar, ativar, criar e excluir personas.
"""
from fastapi import APIRouter, HTTPException

from src.dependencies import AuthDep, SettingsDep
from src.models.schemas import PersonaListResponse, PersonaDetail, UpdatePersonaRequest, CreatePersonaRequest
from src.services.persona_service import (
    list_personas,
    get_persona_detail,
    get_active_persona,
    set_active_persona,
    update_persona,
    create_persona,
    delete_persona,
)

router = APIRouter()


@router.get("", response_model=PersonaListResponse)
async def list_personas_endpoint(auth: AuthDep, settings: SettingsDep):
    """Lista todas as personas disponíveis."""
    personas = list_personas()
    return PersonaListResponse(personas=personas, active=get_active_persona())


@router.get("/{name}", response_model=PersonaDetail)
async def get_persona(name: str, auth: AuthDep, settings: SettingsDep):
    """Detalhes de uma persona específica."""
    detail = get_persona_detail(name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Persona '{name}' not found")
    return detail


@router.post("/{name}/activate")
async def activate_persona(name: str, auth: AuthDep, settings: SettingsDep):
    """Troca a persona ativa."""
    # Valida que a persona existe
    detail = get_persona_detail(name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Persona '{name}' not found")

    active = set_active_persona(name)
    return {"active": active}


@router.put("/{name}", response_model=PersonaDetail)
async def update_persona_endpoint(name: str, request: UpdatePersonaRequest, auth: AuthDep, settings: SettingsDep):
    """Atualiza dados de uma persona."""
    updated = update_persona(name, request)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Persona '{name}' not found")
    return updated


@router.post("/create", response_model=PersonaDetail)
async def create_persona_endpoint(request: CreatePersonaRequest, auth: AuthDep, settings: SettingsDep):
    """Cria uma nova persona."""
    try:
        created = create_persona(request)
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}")
async def delete_persona_endpoint(name: str, auth: AuthDep, settings: SettingsDep):
    """Remove uma persona e seus arquivos."""
    if name.lower() == "ahri":
        raise HTTPException(status_code=400, detail="Cannot delete the default persona")
    success = delete_persona(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Persona '{name}' not found")
    return {"status": "deleted", "name": name}
