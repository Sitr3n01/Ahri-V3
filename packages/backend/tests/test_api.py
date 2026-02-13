"""
Testes basicos da API - Fase 1.
Usa httpx.AsyncClient com FastAPI TestClient.
Fixtures em conftest.py.
"""
import pytest
from httpx import AsyncClient


# =============================================================================
# Health
# =============================================================================

class TestHealth:
    async def test_health_check(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


# =============================================================================
# Auth
# =============================================================================

class TestAuth:
    async def test_login_success(self, client: AsyncClient):
        resp = await client.post("/auth/login", json={"password": "ahri"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient):
        resp = await client.post("/auth/login", json={"password": "wrong"})
        assert resp.status_code == 401

    async def test_refresh_token(self, client: AsyncClient):
        # Login
        login_resp = await client.post("/auth/login", json={"password": "ahri"})
        refresh_token = login_resp.json()["refresh_token"]

        # Refresh
        resp = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    async def test_protected_endpoint_without_token(self, client: AsyncClient):
        resp = await client.get("/personas")
        assert resp.status_code == 403  # No token


# =============================================================================
# Personas
# =============================================================================

class TestPersonas:
    async def test_list_personas(self, client: AsyncClient, auth_headers):
        resp = await client.get("/personas", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "personas" in data
        assert "active" in data
        assert isinstance(data["personas"], list)

    async def test_activate_nonexistent_persona(self, client: AsyncClient, auth_headers):
        """Ativar persona inexistente retorna 404."""
        resp = await client.post("/personas/nonexistent_xyz/activate", headers=auth_headers)
        assert resp.status_code == 404


# =============================================================================
# Memory
# =============================================================================

class TestMemory:
    async def test_get_profile(self, client: AsyncClient, auth_headers):
        resp = await client.get("/memory/profile", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Verifica campos do schema
        assert "name" in data
        assert "archetype" in data
        assert "attributes" in data
        assert "knowledge_tracker" in data

    async def test_get_profile_creates_default(self, client: AsyncClient, auth_headers):
        """Primeira chamada cria perfil default."""
        resp = await client.get("/memory/profile", headers=auth_headers)
        assert resp.status_code == 200


# =============================================================================
# Sessions
# =============================================================================

class TestSessions:
    async def test_list_sessions_empty(self, client: AsyncClient, auth_headers):
        resp = await client.get("/sessions", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) == 0  # Sem sessões inicialmente

    async def test_create_session(self, client: AsyncClient, auth_headers):
        resp = await client.post(
            "/sessions",
            headers=auth_headers,
            json={"title": "Test Session"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Session"
        assert "id" in data

    async def test_get_session(self, client: AsyncClient, auth_headers):
        # Cria sessão
        create_resp = await client.post(
            "/sessions",
            headers=auth_headers,
            json={"title": "Session to Get"},
        )
        session_id = create_resp.json()["id"]

        # Carrega sessão
        resp = await client.get(f"/sessions/{session_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Session to Get"
        assert "messages" in data
        assert isinstance(data["messages"], list)

    async def test_rename_session(self, client: AsyncClient, auth_headers):
        # Cria sessão
        create_resp = await client.post(
            "/sessions",
            headers=auth_headers,
            json={"title": "Old Name"},
        )
        session_id = create_resp.json()["id"]

        # Renomeia
        resp = await client.put(
            f"/sessions/{session_id}",
            headers=auth_headers,
            json={"title": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "renamed"

    async def test_delete_session(self, client: AsyncClient, auth_headers):
        # Cria sessão
        create_resp = await client.post(
            "/sessions",
            headers=auth_headers,
            json={"title": "To Delete"},
        )
        session_id = create_resp.json()["id"]

        # Deleta
        resp = await client.delete(f"/sessions/{session_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

        # Verifica que não existe mais
        resp = await client.get(f"/sessions/{session_id}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_get_nonexistent_session(self, client: AsyncClient, auth_headers):
        resp = await client.get("/sessions/99999", headers=auth_headers)
        assert resp.status_code == 404


# =============================================================================
# Agent
# =============================================================================

class TestAgent:
    async def test_execute_safe_task(self, client: AsyncClient, auth_headers):
        """Tasks SAFE são executadas automaticamente."""
        resp = await client.post(
            "/agent/execute",
            headers=auth_headers,
            json={"capability": "system_info", "parameters": {}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["result"]  # Deve ter info do sistema

    async def test_execute_confirm_task_stays_pending(self, client: AsyncClient, auth_headers):
        """Tasks CONFIRM ficam pendentes até aprovação."""
        resp = await client.post(
            "/agent/execute",
            headers=auth_headers,
            json={"capability": "shell_execute", "parameters": {"command": "echo test"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert data["permission_level"] == "CONFIRM"

    async def test_approve_pending_task(self, client: AsyncClient, auth_headers):
        """Aprovar uma task pendente a executa."""
        # Cria task pendente
        create_resp = await client.post(
            "/agent/execute",
            headers=auth_headers,
            json={"capability": "shell_execute", "parameters": {"command": "echo hello"}},
        )
        task_id = create_resp.json()["id"]

        # Aprova
        resp = await client.post(f"/agent/{task_id}/approve", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("completed", "failed")

    async def test_task_status(self, client: AsyncClient, auth_headers):
        """Consulta status de uma task."""
        create_resp = await client.post(
            "/agent/execute",
            headers=auth_headers,
            json={"capability": "system_info", "parameters": {}},
        )
        task_id = create_resp.json()["id"]

        resp = await client.get(f"/agent/{task_id}/status", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == task_id


# =============================================================================
# Search (sem API keys, testa graceful degradation)
# =============================================================================

class TestSearch:
    async def test_search_disabled(self, client: AsyncClient, auth_headers):
        """Sem API keys, retorna erro graceful."""
        resp = await client.post(
            "/search",
            headers=auth_headers,
            json={"query": "test query"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
