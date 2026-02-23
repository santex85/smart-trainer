"""
Sync Strava activities: fetch from API with pagination, upsert into strava_activities.
Respects rate limit; can be run from queue worker.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strava_activity import StravaActivity
from app.models.strava_credentials import StravaCredentials
from app.models.strava_sync_queue import StravaSyncQueue
from app.services.crypto import decrypt_value
from app.services.strava_client import (
    get_all_activities_paginated,
    refresh_access_token,
    strava_can_make_request,
)

logger = logging.getLogger(__name__)


def _parse_start_date(item: dict) -> datetime | None:
    raw = item.get("start_date_local") or item.get("start_date")
    if not raw:
        return None
    try:
        if isinstance(raw, str):
            if "T" in raw:
                return datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return datetime.fromisoformat(raw + "T00:00:00+00:00")
        return None
    except (ValueError, TypeError):
        return None


async def _ensure_access_token(session: AsyncSession, creds: StravaCredentials) -> str:
    """Refresh token if expired; return access_token. On 401 (revoked) deletes credentials and raises."""
    from app.services.crypto import encrypt_value

    now = datetime.now(timezone.utc)
    if creds.access_token and creds.expires_at and creds.expires_at > now:
        return creds.access_token
    refresh_token = decrypt_value(creds.encrypted_refresh_token)
    if not refresh_token:
        raise ValueError("Strava refresh token decryption failed")
    try:
        data = await refresh_access_token(refresh_token)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            uid = creds.user_id
            await session.execute(delete(StravaActivity).where(StravaActivity.user_id == uid))
            await session.execute(delete(StravaSyncQueue).where(StravaSyncQueue.user_id == uid))
            await session.execute(delete(StravaCredentials).where(StravaCredentials.user_id == uid))
            await session.commit()
            logger.info("Strava token revoked (401); unlinked user_id=%s", uid)
            raise ValueError("Strava access was revoked; unlinked.") from e
        raise
    new_access = data.get("access_token")
    new_refresh = data.get("refresh_token")
    expires_at = data.get("expires_at")
    if new_access:
        creds.access_token = new_access
        if expires_at:
            creds.expires_at = datetime.fromtimestamp(expires_at, tz=timezone.utc)
        if new_refresh:
            creds.encrypted_refresh_token = encrypt_value(new_refresh)
        await session.flush()
    return creds.access_token or new_access


async def sync_user_strava_activities(session: AsyncSession, user_id: int) -> None:
    """
    Fetch all activities from Strava (paginated) and upsert into strava_activities.
    Caller should check strava_can_make_request() and enqueue if false.
    """
    r = await session.execute(select(StravaCredentials).where(StravaCredentials.user_id == user_id))
    creds = r.scalar_one_or_none()
    if not creds:
        logger.warning("Strava sync: no credentials for user_id=%s", user_id)
        return
    access_token = await _ensure_access_token(session, creds)
    after_epoch = int((datetime.now(timezone.utc) - timedelta(days=365)).timestamp())
    before_epoch = int(datetime.now(timezone.utc).timestamp())
    activities = await get_all_activities_paginated(access_token, after_epoch, before_epoch)
    logger.info("Strava sync: user_id=%s fetched %s activities", user_id, len(activities))
    for item in activities:
        strava_id = item.get("id")
        if strava_id is None:
            continue
        start_date = _parse_start_date(item)
        if not start_date:
            continue
        name = item.get("name")
        moving_time = item.get("moving_time")
        distance = item.get("distance")
        suffer_score = item.get("suffer_score")
        if suffer_score is not None and not isinstance(suffer_score, (int, float)):
            suffer_score = None
        act_type = item.get("type")
        # Upsert: update if exists
        existing = await session.execute(
            select(StravaActivity).where(
                StravaActivity.user_id == user_id,
                StravaActivity.strava_id == strava_id,
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.start_date = start_date
            row.name = name
            row.moving_time_sec = moving_time
            row.distance_m = distance
            row.suffer_score = float(suffer_score) if suffer_score is not None else None
            row.type = act_type
            row.raw = item
            row.synced_at = datetime.now(timezone.utc)
        else:
            session.add(
                StravaActivity(
                    user_id=user_id,
                    strava_id=strava_id,
                    start_date=start_date,
                    name=name,
                    moving_time_sec=moving_time,
                    distance_m=distance,
                    suffer_score=float(suffer_score) if suffer_score is not None else None,
                    type=act_type,
                    raw=item,
                )
            )
    await session.flush()


async def run_sync_or_enqueue(session: AsyncSession, user_id: int) -> str:
    """
    If rate limit allows, run sync immediately. Otherwise enqueue and return status.
    Returns "syncing" or "queued".
    """
    if strava_can_make_request():
        await sync_user_strava_activities(session, user_id)
        return "syncing"
    # Enqueue
    session.add(
        StravaSyncQueue(user_id=user_id, status="pending")
    )
    await session.flush()
    return "queued"


async def process_sync_queue_one(session: AsyncSession) -> bool:
    """
    Process one pending job from strava_sync_queue if rate limit allows.
    Returns True if a job was processed, False otherwise.
    """
    if not strava_can_make_request():
        return False
    r = await session.execute(
        select(StravaSyncQueue)
        .where(StravaSyncQueue.status == "pending")
        .order_by(StravaSyncQueue.requested_at)
        .limit(1)
    )
    job = r.scalar_one_or_none()
    if not job:
        return False
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    await session.flush()
    try:
        await sync_user_strava_activities(session, job.user_id)
        job.status = "done"
        job.finished_at = datetime.now(timezone.utc)
    except Exception as e:
        logger.exception("Strava sync queue job %s failed: %s", job.id, e)
        job.status = "failed"
        job.finished_at = datetime.now(timezone.utc)
        job.error_message = str(e)[:500]
    await session.flush()
    return True
