"""Tests for Intervals.icu webhook endpoint."""

import pytest
from sqlalchemy import delete, select

from app.db.session import async_session_maker
from app.models.intervals_credentials import IntervalsCredentials
from app.models.user import User
from app.services.crypto import encrypt_value


@pytest.mark.asyncio
async def test_webhook_missing_athlete_id(client):
    """Webhook with missing or invalid athlete_id returns 400."""
    res = await client.post("/api/v1/intervals/webhook", json={})
    assert res.status_code == 400
    res2 = await client.post("/api/v1/intervals/webhook", json={"athlete_id": ""})
    assert res2.status_code == 400


@pytest.mark.asyncio
async def test_webhook_unknown_athlete_returns_200(client):
    """Webhook with unknown athlete_id returns 200 (idempotent ack)."""
    res = await client.post(
        "/api/v1/intervals/webhook",
        json={"athlete_id": "unknown_athlete_123", "type": "activity"},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}


@pytest.mark.asyncio
async def test_webhook_with_existing_athlete_returns_200(client):
    """Webhook with existing athlete_id returns 200 and enqueues sync."""
    async with async_session_maker() as session:
        user = User(email="webhook@test.com", password_hash="hash")
        session.add(user)
        await session.flush()
        session.add(
            IntervalsCredentials(
                user_id=user.id,
                athlete_id="athlete_webhook_test",
                encrypted_token_or_key=encrypt_value("fake-api-key"),
            )
        )
        await session.commit()

    try:
        res = await client.post(
            "/api/v1/intervals/webhook",
            json={"athlete_id": "athlete_webhook_test", "type": "wellness"},
        )
        assert res.status_code == 200
        assert res.json() == {"ok": True}
    finally:
        async with async_session_maker() as session:
            r = await session.execute(
                select(IntervalsCredentials).where(
                    IntervalsCredentials.athlete_id == "athlete_webhook_test"
                )
            )
            creds = r.scalar_one_or_none()
            if creds:
                await session.delete(creds)
            await session.execute(delete(User).where(User.email == "webhook@test.com"))
            await session.commit()
