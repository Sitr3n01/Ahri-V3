"""
Personas: listar, detalhar e ativar personas.
"""
from fastapi import APIRouter, HTTPException

from src.dependencies import AuthDep, SettingsDep
from src.models.schemas import PersonaListResponse, PersonaDetail
from src.services.persona_service import (
    list_personas,
    get_persona_detail,
    get_active_persona,
    set_active_persona,
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
