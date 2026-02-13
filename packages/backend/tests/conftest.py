"""
Pytest configuration and shared fixtures.
"""
import pytest
from httpx import AsyncClient, ASGITransport

from src.main import app
from src.models.database import init_db, close_db


@pytest.fixture(autouse=True)
async def setup_db():
    """Inicializa banco de teste em memória para cada teste."""
    await init_db("sqlite+aiosqlite:///:memory:")
    yield
    await close_db()


@pytest.fixture
async def client():
    """Client HTTP para testes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient):
    """Headers com JWT token válido."""
    resp = await client.post("/auth/login", json={"password": "ahri"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
