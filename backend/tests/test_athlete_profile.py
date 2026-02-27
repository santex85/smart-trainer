"""Tests for athlete profile: GET and PATCH."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_profile_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/athlete-profile", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "weight_kg" in data
    assert "ftp" in data
    assert data["display_name"] == "test@test.com"


@pytest.mark.asyncio
async def test_patch_profile(client: AsyncClient, auth_headers: dict):
    resp = await client.patch(
        "/api/v1/athlete-profile",
        json={"weight_kg": 72.5, "height_cm": 180, "ftp": 250, "birth_year": 1990},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["weight_kg"] == 72.5
    assert data["height_cm"] == 180
    assert data["ftp"] == 250
    assert data["birth_year"] == 1990
    assert data["weight_source"] == "manual"
    assert data["ftp_source"] == "manual"


@pytest.mark.asyncio
async def test_patch_profile_partial(client: AsyncClient, auth_headers: dict):
    await client.patch(
        "/api/v1/athlete-profile",
        json={"weight_kg": 70},
        headers=auth_headers,
    )
    resp = await client.get("/api/v1/athlete-profile", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["weight_kg"] == 70
