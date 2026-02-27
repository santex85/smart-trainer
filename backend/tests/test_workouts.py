"""Tests for workouts API: CRUD, list, fitness."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_workout(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/workouts",
        json={
            "start_date": "2026-02-25T12:00:00Z",
            "name": "Easy Run",
            "type": "Run",
            "duration_sec": 1800,
            "tss": 40,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Easy Run"
    assert data["source"] == "manual"
    assert data["tss"] == 40


@pytest.mark.asyncio
async def test_list_workouts_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/workouts?from_date=2026-01-01&to_date=2026-12-31",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 0
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_list_workouts_after_create(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/v1/workouts",
        json={
            "start_date": "2026-02-25T12:00:00Z",
            "name": "Ride",
            "type": "Ride",
            "duration_sec": 3600,
            "tss": 55,
        },
        headers=auth_headers,
    )
    resp = await client.get(
        "/api/v1/workouts?from_date=2026-02-01&to_date=2026-02-28",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [w["name"] for w in data["items"]]
    assert "Ride" in names


@pytest.mark.asyncio
async def test_get_fitness_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/workouts/fitness", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data is None or isinstance(data, dict)


@pytest.mark.asyncio
async def test_update_workout(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/v1/workouts",
        json={
            "start_date": "2026-02-26T10:00:00Z",
            "name": "Swim",
            "type": "Swim",
            "duration_sec": 2400,
            "tss": 45,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    wid = create.json()["id"]
    resp = await client.patch(
        f"/api/v1/workouts/{wid}",
        json={"name": "Swim updated", "tss": 50},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Swim updated"
    assert resp.json()["tss"] == 50


@pytest.mark.asyncio
async def test_delete_workout(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/v1/workouts",
        json={
            "start_date": "2026-02-27T08:00:00Z",
            "name": "To Delete",
            "type": "Run",
            "duration_sec": 600,
            "tss": 10,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    wid = create.json()["id"]
    resp = await client.delete(f"/api/v1/workouts/{wid}", headers=auth_headers)
    assert resp.status_code == 204
