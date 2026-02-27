"""Tests for photo/nutrition analyze endpoints (Gemini mocked)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


# Minimal JPEG bytes (valid magic)
JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c\x20$.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.7\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00\x00?\x00\xfd\xe9\x1f\xff\xd9"
)


@pytest.mark.asyncio
async def test_photo_analyze_food_mock(client: AsyncClient, auth_headers: dict):
    """POST /photo/analyze with save=true and mocked Gemini returns food result."""
    with patch(
        "app.services.gemini_photo_analyzer.classify_and_analyze_image",
        new_callable=AsyncMock,
        return_value=(
            "food",
            type(
                "Result",
                (),
                {
                    "name": "Oatmeal",
                    "portion_grams": 250.0,
                    "calories": 300.0,
                    "protein_g": 10.0,
                    "fat_g": 6.0,
                    "carbs_g": 50.0,
                },
            )(),
        ),
    ):
        resp = await client.post(
            "/api/v1/photo/analyze",
            files={"file": ("plate.jpg", JPEG_BYTES, "image/jpeg")},
            data={"meal_type": "breakfast"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "food"
    assert data["food"]["name"] == "Oatmeal"
    assert data["food"]["calories"] == 300


@pytest.mark.asyncio
async def test_nutrition_analyze_invalid_file(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/nutrition/analyze",
        files={"file": ("x.txt", b"not an image", "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_nutrition_analyze_success_mock(client: AsyncClient, auth_headers: dict):
    with patch(
        "app.services.gemini_nutrition.analyze_food_from_image",
        new_callable=AsyncMock,
        return_value=type(
            "Result",
            (),
            {
                "name": "Salad",
                "portion_grams": 200.0,
                "calories": 150.0,
                "protein_g": 5.0,
                "fat_g": 10.0,
                "carbs_g": 12.0,
            },
        )(),
    ):
        resp = await client.post(
            "/api/v1/nutrition/analyze",
            files={"file": ("food.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Salad"
    assert "id" in data
    assert data["calories"] == 150
