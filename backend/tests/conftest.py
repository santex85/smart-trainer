"""Pytest configuration and shared fixtures for API tests."""

import asyncio
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

# Set test DB before app imports so config/engine use it
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://smart_trainer:smart_trainer@localhost:5432/smart_trainer",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ENCRYPTION_KEY", "x" * 32)

from app.core.auth import create_access_token, hash_password
from app.db.base import Base
from app.db.session import async_session_maker, engine, init_db
from app.main import app
from app.models.user import User

pytest_plugins = ["pytest_asyncio"]


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def ensure_db():
    """Create tables and init HTTP client once per test session (no scheduler)."""
    await init_db()
    from app.services.http_client import init_http_client

    init_http_client(timeout=30.0)
    yield
    from app.services.http_client import close_http_client

    await close_http_client()


async def _truncate_all():
    """Truncate all tables in reverse dependency order so tests start clean."""
    tables = [t.name for t in reversed(Base.metadata.sorted_tables)]
    if not tables:
        return
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE " + ", ".join(tables) + " RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def client(ensure_db):
    """Yield AsyncClient. No session override; use clean_db + test_user for isolated state."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def clean_db(ensure_db):
    """Truncate all tables so the next test has a clean DB."""
    await _truncate_all()
    yield


@pytest_asyncio.fixture
async def test_user(clean_db, client):
    """Create a user via DB (committed) and return (user_id, email, access_token)."""
    async with async_session_maker() as session:
        user = User(
            email="test@test.com",
            password_hash=hash_password("password123"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        token = create_access_token(user.id, user.email)
        return user.id, user.email, token


@pytest_asyncio.fixture
def auth_headers(test_user):
    """Return dict of Authorization header for test_user."""
    _, __, token = test_user
    return {"Authorization": f"Bearer {token}"}
