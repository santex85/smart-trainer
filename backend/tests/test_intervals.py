"""Tests for Intervals.icu API: status, link, unlink, sync (mocked)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_intervals_status_not_linked(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/intervals/status", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["linked"] is False


@pytest.mark.asyncio
async def test_intervals_link(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/intervals/link",
        json={"athlete_id": "athlete-123", "api_key": "test-api-key"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "linked"
    assert data["athlete_id"] == "athlete-123"


@pytest.mark.asyncio
async def test_intervals_status_linked(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/v1/intervals/link",
        json={"athlete_id": "athlete-456", "api_key": "key"},
        headers=auth_headers,
    )
    resp = await client.get("/api/v1/intervals/status", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["linked"] is True
    assert resp.json()["athlete_id"] == "athlete-456"


@pytest.mark.asyncio
async def test_intervals_unlink(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/v1/intervals/link",
        json={"athlete_id": "u", "api_key": "k"},
        headers=auth_headers,
    )
    resp = await client.post("/api/v1/intervals/unlink", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "unlinked"
    status = await client.get("/api/v1/intervals/status", headers=auth_headers)
    assert status.json()["linked"] is False


@pytest.mark.asyncio
async def test_intervals_sync_not_linked(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/v1/intervals/sync", headers=auth_headers)
    assert resp.status_code == 400
    assert "not linked" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_intervals_sync_success(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/v1/intervals/link",
        json={"athlete_id": "a1", "api_key": "k1"},
        headers=auth_headers,
    )
    with patch(
        "app.services.intervals_sync.sync_intervals_to_db",
        new_callable=AsyncMock,
        return_value=(5, 3),
    ):
        resp = await client.post("/api/v1/intervals/sync", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "synced"
    assert data["activities_synced"] == 5
    assert data["wellness_days_synced"] == 3
