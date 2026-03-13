"""Intervals.icu OAuth login pending storage (Redis). TTL 5 minutes."""

import json
import logging
import secrets

from app.core.rate_limit import get_redis

logger = logging.getLogger(__name__)

PENDING_TTL_SECONDS = 300  # 5 minutes
PENDING_KEY_PREFIX = "intervals_pending:"


async def create_pending(
    athlete_id: str,
    athlete_name: str,
    encrypted_token: str,
    has_user: bool,
    user_id: int | None = None,
) -> str:
    """Store pending Intervals login data. Returns random key.
    user_id: when has_user=True, the existing user id."""
    redis_client = get_redis()
    if redis_client is None:
        raise RuntimeError("Redis unavailable for Intervals pending storage")
    key = secrets.token_urlsafe(32)
    redis_key = f"{PENDING_KEY_PREFIX}{key}"
    data: dict = {
        "athlete_id": athlete_id,
        "athlete_name": athlete_name,
        "encrypted_token": encrypted_token,
        "has_user": has_user,
    }
    if user_id is not None:
        data["user_id"] = user_id
    value = json.dumps(data)
    await redis_client.set(redis_key, value, ex=PENDING_TTL_SECONDS)
    return key


async def get_pending(key: str) -> dict | None:
    """Get pending data by key (read-only, does not delete)."""
    redis_client = get_redis()
    if redis_client is None:
        return None
    redis_key = f"{PENDING_KEY_PREFIX}{key}"
    value = await redis_client.get(redis_key)
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        logger.warning("Intervals pending invalid JSON: %s", value[:100])
        return None


async def get_and_delete_pending(key: str) -> dict | None:
    """Get pending data by key and delete. Returns None if not found or expired."""
    redis_client = get_redis()
    if redis_client is None:
        return None
    redis_key = f"{PENDING_KEY_PREFIX}{key}"
    value = await redis_client.get(redis_key)
    if value is None:
        return None
    await redis_client.delete(redis_key)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        logger.warning("Intervals pending invalid JSON: %s", value[:100])
        return None
