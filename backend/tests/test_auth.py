"""Tests for auth endpoints: register, login, me, refresh."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient, clean_db):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@test.com", "password": "securepass123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "newuser@test.com"
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, clean_db):
    """Second register with same email returns 400. Create first user via DB so it persists."""
    from app.core.auth import hash_password
    from app.db.session import async_session_maker
    from app.models.user import User

    async with async_session_maker() as session:
        session.add(
            User(email="dup@test.com", password_hash=hash_password("x")),
        )
        await session.commit()
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "dup@test.com", "password": "other"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@test.com", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "test@test.com"
    assert "access_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@test.com", "password": "wrong"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@test.com"


@pytest.mark.asyncio
async def test_me_unauthorized(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
