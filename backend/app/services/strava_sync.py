"""
Sync Strava activities: fetch from API with pagination, upsert into strava_activities.
Respects rate limit; can be run from queue worker.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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

    def _float(v: Any) -> float | None:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        return None

    def _int(v: Any) -> int | None:
        if v is None:
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        return None

    def _str(v: Any, max_len: int = 512) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s[:max_len] if s else None

    def _bool(v: Any) -> bool | None:
        if v is None:
            return None
        return bool(v)

    now_utc = datetime.now(timezone.utc)
    rows = []
    for item in activities:
        strava_id = item.get("id")
        if strava_id is None:
            continue
        start_date = _parse_start_date(item)
        if not start_date:
            continue
        name = _str(item.get("name"), 512)
        description = _str(item.get("description"), 10000)
        act_type = _str(item.get("type"), 64)
        sport_type = _str(item.get("sport_type"), 64)
        workout_type = _int(item.get("workout_type"))
        moving_time = _int(item.get("moving_time"))
        elapsed_time = _int(item.get("elapsed_time"))
        distance = _float(item.get("distance"))
        total_elevation_gain = _float(item.get("total_elevation_gain"))
        elev_high = _float(item.get("elev_high"))
        elev_low = _float(item.get("elev_low"))
        average_speed = _float(item.get("average_speed"))
        max_speed = _float(item.get("max_speed"))
        average_heartrate = _float(item.get("average_heartrate"))
        max_heartrate = _float(item.get("max_heartrate"))
        average_watts = _float(item.get("average_watts"))
        kilojoules = _float(item.get("kilojoules"))
        suffer_score = _float(item.get("suffer_score"))
        start_date_local = _str(item.get("start_date_local"), 64)
        tz = _str(item.get("timezone"), 128)
        trainer = _bool(item.get("trainer"))
        commute = _bool(item.get("commute"))
        manual = _bool(item.get("manual"))
        private = _bool(item.get("private"))
        rows.append({
            "user_id": user_id,
            "strava_id": strava_id,
            "start_date": start_date,
            "start_date_local": start_date_local,
            "timezone": tz,
            "name": name,
            "description": description,
            "type": act_type,
            "sport_type": sport_type,
            "workout_type": workout_type,
            "moving_time_sec": moving_time,
            "elapsed_time_sec": elapsed_time,
            "distance_m": distance,
            "total_elevation_gain_m": total_elevation_gain,
            "elev_high_m": elev_high,
            "elev_low_m": elev_low,
            "average_speed_m_s": average_speed,
            "max_speed_m_s": max_speed,
            "average_heartrate": average_heartrate,
            "max_heartrate": max_heartrate,
            "average_watts": average_watts,
            "kilojoules": kilojoules,
            "suffer_score": suffer_score,
            "trainer": trainer,
            "commute": commute,
            "manual": manual,
            "private": private,
            "raw": item,
            "synced_at": now_utc,
        })

    if rows:
        stmt = pg_insert(StravaActivity).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "strava_id"],
            set_={
                "start_date": stmt.excluded.start_date,
                "start_date_local": stmt.excluded.start_date_local,
                "timezone": stmt.excluded.timezone,
                "name": stmt.excluded.name,
                "description": stmt.excluded.description,
                "type": stmt.excluded.type,
                "sport_type": stmt.excluded.sport_type,
                "workout_type": stmt.excluded.workout_type,
                "moving_time_sec": stmt.excluded.moving_time_sec,
                "elapsed_time_sec": stmt.excluded.elapsed_time_sec,
                "distance_m": stmt.excluded.distance_m,
                "total_elevation_gain_m": stmt.excluded.total_elevation_gain_m,
                "elev_high_m": stmt.excluded.elev_high_m,
                "elev_low_m": stmt.excluded.elev_low_m,
                "average_speed_m_s": stmt.excluded.average_speed_m_s,
                "max_speed_m_s": stmt.excluded.max_speed_m_s,
                "average_heartrate": stmt.excluded.average_heartrate,
                "max_heartrate": stmt.excluded.max_heartrate,
                "average_watts": stmt.excluded.average_watts,
                "kilojoules": stmt.excluded.kilojoules,
                "suffer_score": stmt.excluded.suffer_score,
                "trainer": stmt.excluded.trainer,
                "commute": stmt.excluded.commute,
                "manual": stmt.excluded.manual,
                "private": stmt.excluded.private,
                "raw": stmt.excluded.raw,
                "synced_at": stmt.excluded.synced_at,
            },
        )
        await session.execute(stmt)
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
