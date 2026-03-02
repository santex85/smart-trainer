"""Unit tests for rate_limit module (photo AI daily limit)."""

from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.core.rate_limit import (
    PHOTO_AI_KEY_TTL_SECONDS,
    RATE_LIMIT_MESSAGE,
    check_and_consume_photo_ai_limit,
    _redis_key_photo_ai,
)


class FakeRedisPipeline:
    """In-memory pipeline that mimics Redis INCR + TTL for rate limit tests."""

    def __init__(self, store: dict):
        self._store = store
        self._key: str | None = None
        self._incr_result = 0
        self._ttl_result = -1

    def incr(self, key: str):
        self._key = key
        self._store[key] = self._store.get(key, 0) + 1
        self._incr_result = self._store[key]
        return self

    def ttl(self, key: str):
        self._ttl_result = -1 if self._store.get(key, 0) == 0 else PHOTO_AI_KEY_TTL_SECONDS
        return self

    async def execute(self):
        return [self._incr_result, self._ttl_result]


class FakeRedis:
    """In-memory Redis-like client for testing."""

    def __init__(self):
        self._store: dict[str, int] = {}

    def pipeline(self):
        return FakeRedisPipeline(self._store)

    async def expire(self, key: str, ttl: int):
        pass

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_redis_key_format():
    assert _redis_key_photo_ai(1, date(2026, 3, 1)) == "rate_limit:photo_ai:1:2026-03-01"
    assert _redis_key_photo_ai(42, date(2025, 12, 31)) == "rate_limit:photo_ai:42:2025-12-31"


@pytest.mark.asyncio
async def test_check_and_consume_photo_ai_limit_free_under_limit():
    """Free user under daily limit: no exception."""
    fake = FakeRedis()
    with patch("app.core.rate_limit.get_redis", return_value=fake):
        with patch("app.core.rate_limit.settings") as mock_settings:
            mock_settings.rate_limit_photo_ai_enabled = True
            mock_settings.free_daily_photo_limit = 5
            mock_settings.premium_photo_analyses_per_day = 0
        await check_and_consume_photo_ai_limit(10, is_premium=False)
    assert fake._store.get(_redis_key_photo_ai(10, date.today())) == 1


@pytest.mark.asyncio
async def test_check_and_consume_photo_ai_limit_free_over_limit():
    """Free user over daily limit: raises 429 with Retry-After."""
    fake = FakeRedis()
    key = _redis_key_photo_ai(10, date.today())
    fake._store[key] = 5  # already at limit
    with patch("app.core.rate_limit.get_redis", return_value=fake):
        with patch("app.core.rate_limit.settings") as mock_settings:
            mock_settings.rate_limit_photo_ai_enabled = True
            mock_settings.free_daily_photo_limit = 5
            mock_settings.premium_photo_analyses_per_day = 0
        with pytest.raises(HTTPException) as exc_info:
            await check_and_consume_photo_ai_limit(10, is_premium=False)
    assert exc_info.value.status_code == 429
    assert RATE_LIMIT_MESSAGE in str(exc_info.value.detail)
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_check_and_consume_photo_ai_limit_premium_unlimited():
    """Premium user: no limit (premium_photo_analyses_per_day=0)."""
    fake = FakeRedis()
    key = _redis_key_photo_ai(10, date.today())
    fake._store[key] = 100
    with patch("app.core.rate_limit.get_redis", return_value=fake):
        with patch("app.core.rate_limit.settings") as mock_settings:
            mock_settings.rate_limit_photo_ai_enabled = True
            mock_settings.free_daily_photo_limit = 5
            mock_settings.premium_photo_analyses_per_day = 0
        await check_and_consume_photo_ai_limit(10, is_premium=True)
    assert fake._store[key] == 101


@pytest.mark.asyncio
async def test_check_and_consume_photo_ai_limit_disabled():
    """When rate limit is disabled, get_redis returns None and no exception."""
    with patch("app.core.rate_limit.get_redis", return_value=None):
        await check_and_consume_photo_ai_limit(10, is_premium=False)
