"""
Strava API client: OAuth token exchange/refresh, list activities.
All requests go through _request() to track rate limits.
"""
import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

# In-memory rate limit (per process). Strava: 200/15min, 2000/day.
_usage_15min: list[float] = []  # timestamps of requests in last 15 min
_usage_daily: list[float] = []  # timestamps of requests in current day (UTC)
LIMIT_15MIN = 200
LIMIT_DAILY = 2000
THRESHOLD_15MIN = 180  # enqueue when >= this
THRESHOLD_DAILY = 1900


def _trim_usage():
    now = time.time()
    cutoff_15 = now - 15 * 60
    cutoff_day = now - 86400  # approx; exact day boundary would need calendar
    global _usage_15min, _usage_daily
    _usage_15min = [t for t in _usage_15min if t > cutoff_15]
    _usage_daily = [t for t in _usage_daily if t > now - 86400]


def strava_can_make_request() -> bool:
    """True if we are under threshold and can call Strava API."""
    _trim_usage()
    return len(_usage_15min) < THRESHOLD_15MIN and len(_usage_daily) < THRESHOLD_DAILY


def strava_record_request():
    t = time.time()
    _usage_15min.append(t)
    _usage_daily.append(t)


def strava_usage() -> tuple[int, int]:
    """Return (current 15min count, current daily count)."""
    _trim_usage()
    return len(_usage_15min), len(_usage_daily)


async def exchange_code(code: str, redirect_uri: str | None = None) -> dict[str, Any]:
    """Exchange authorization code for tokens. Does not count against activity rate limit (different endpoint)."""
    uri = redirect_uri or settings.strava_redirect_uri
    async with httpx.AsyncClient(timeout=30.0) as client:
        data: dict[str, str] = {
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "code": code,
            "grant_type": "authorization_code",
        }
        if uri:
            data["redirect_uri"] = uri
        r = await client.post(STRAVA_OAUTH_URL, data=data)
        r.raise_for_status()
        return r.json()


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    """Refresh access token. OAuth token endpoint has separate limits; we do not count it toward 200/15min."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            STRAVA_OAUTH_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        r.raise_for_status()
        return r.json()


async def _get_activities_page(
    access_token: str,
    after: int,
    before: int,
    page: int = 1,
    per_page: int = 200,
) -> tuple[list[dict], dict[str, str] | None]:
    """One page of activities. Returns (list, response_headers for rate limit)."""
    if not strava_can_make_request():
        raise RuntimeError("Strava rate limit threshold reached; enqueue sync.")
    strava_record_request()
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            params={"after": after, "before": before, "page": page, "per_page": per_page},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        r.raise_for_status()
        data = r.json()
        headers = dict(r.headers) if r.headers else None
        return data if isinstance(data, list) else [], headers


async def get_activities(
    access_token: str,
    after_epoch: int,
    before_epoch: int,
    per_page: int = 200,
) -> list[dict]:
    """Single page of activities."""
    if not strava_can_make_request():
        raise RuntimeError("Strava rate limit threshold reached; enqueue sync.")
    strava_record_request()
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            params={"after": after_epoch, "before": before_epoch, "page": 1, "per_page": per_page},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []


async def get_all_activities_paginated(
    access_token: str,
    after_epoch: int,
    before_epoch: int,
) -> list[dict]:
    """Fetch all activities with pagination. Stops when rate limit threshold is reached or no more data."""
    all_activities: list[dict] = []
    page = 1
    per_page = 200
    while True:
        if not strava_can_make_request():
            logger.warning("Strava rate limit threshold reached during pagination; stopping early.")
            break
        batch, _ = await _get_activities_page(access_token, after_epoch, before_epoch, page=page, per_page=per_page)
        if not batch:
            break
        all_activities.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return all_activities
