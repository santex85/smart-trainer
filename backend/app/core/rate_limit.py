"""
Rate limiting for AI-consuming endpoints (e.g. photo analysis).
Uses Redis for per-user daily counters; free users get a cap, premium unlimited (or high cap).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy singleton for async Redis client
_redis_client = None

# TTL for daily key: 26 hours so keys expire after the day window
PHOTO_AI_KEY_TTL_SECONDS = 26 * 3600

# Message and header for 429
RATE_LIMIT_MESSAGE = (
    "Дневной лимит анализа фото исчерпан. Перейдите на Premium для безлимита."
)


def _redis_key_photo_ai(user_id: int, day: date) -> str:
    return f"rate_limit:photo_ai:{user_id}:{day.isoformat()}"


def get_redis():
    """Return async Redis client (lazy connect). Returns None if Redis unavailable or disabled."""
    global _redis_client
    if not getattr(settings, "rate_limit_photo_ai_enabled", True):
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        from redis.asyncio import from_url
        _redis_client = from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        return _redis_client
    except Exception as e:
        logger.warning("Rate limit: Redis unavailable (%s), skipping photo AI limit", e)
        return None


async def close_redis() -> None:
    """Close Redis connection (e.g. on app shutdown)."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception as e:
            logger.warning("Rate limit: error closing Redis: %s", e)
        _redis_client = None


async def check_and_consume_photo_ai_limit(user_id: int, is_premium: bool) -> None:
    """
    Increment the daily photo-AI counter for the user and raise 429 if over limit.
    Free users: limited by free_daily_photo_limit per day (UTC).
    Premium: unlimited (or limited by premium_photo_analyses_per_day if set > 0).
    Raises HTTPException(429) with Retry-After header when limit exceeded.
    """
    if not getattr(settings, "rate_limit_photo_ai_enabled", True):
        return

    redis_client = get_redis()
    if redis_client is None:
        return

    today = date.today()
    key = _redis_key_photo_ai(user_id, today)

    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        results = await pipe.execute()
        new_count = int(results[0])
        ttl = int(results[1])

        if ttl == -1:
            await redis_client.expire(key, PHOTO_AI_KEY_TTL_SECONDS)

        limit: int | None
        if is_premium:
            premium_limit = getattr(settings, "premium_photo_analyses_per_day", 0)
            limit = premium_limit if premium_limit > 0 else None  # 0 = unlimited
        else:
            limit = getattr(settings, "free_daily_photo_limit", 5)

        if limit is not None and new_count > limit:
            # Seconds until midnight UTC (next day)
            now = datetime.now(timezone.utc)
            next_midnight = (
                now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
            )
            retry_after = int((next_midnight - now).total_seconds())
            raise HTTPException(
                status_code=429,
                detail=RATE_LIMIT_MESSAGE,
                headers={"Retry-After": str(max(1, retry_after))},
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Rate limit: Redis error in check_and_consume_photo_ai_limit: %s", e)
        # On Redis error, allow the request (fail open)
