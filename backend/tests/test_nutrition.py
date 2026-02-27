"""Tests for nutrition entries: create, get day, update, delete."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_nutrition_entry(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/nutrition/entries",
        json={
            "name": "Banana",
            "portion_grams": 120,
            "calories": 105,
            "protein_g": 1.3,
            "fat_g": 0.4,
            "carbs_g": 27,
            "meal_type": "snack",
            "date": "2026-02-26",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Banana"
    assert data["meal_type"] == "snack"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_nutrition_day(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/nutrition/day?date=2026-02-26",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "date" in data
    assert "entries" in data
    assert "totals" in data


@pytest.mark.asyncio
async def test_update_nutrition_entry(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/v1/nutrition/entries",
        json={
            "name": "Apple",
            "portion_grams": 150,
            "calories": 78,
            "protein_g": 0.4,
            "fat_g": 0.3,
            "carbs_g": 21,
            "date": "2026-02-27",
        },
        headers=auth_headers,
    )
    assert create.status_code == 200
    eid = create.json()["id"]
    resp = await client.patch(
        f"/api/v1/nutrition/entries/{eid}",
        json={"name": "Green Apple", "calories": 80},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Green Apple"
    assert resp.json()["calories"] == 80


@pytest.mark.asyncio
async def test_delete_nutrition_entry(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/v1/nutrition/entries",
        json={
            "name": "ToDelete",
            "portion_grams": 100,
            "calories": 50,
            "protein_g": 1,
            "fat_g": 1,
            "carbs_g": 10,
            "date": "2026-02-28",
        },
        headers=auth_headers,
    )
    assert create.status_code == 200
    eid = create.json()["id"]
    resp = await client.delete(
        f"/api/v1/nutrition/entries/{eid}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json().get("status") == "deleted"
