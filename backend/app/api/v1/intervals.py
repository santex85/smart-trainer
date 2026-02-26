"""Intervals.icu: store credentials, events, activities. Wellness is separate (see wellness router)."""

import asyncio
import logging
from datetime import date, timedelta
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.intervals_credentials import IntervalsCredentials
from app.models.user import User
from app.services.crypto import decrypt_value, encrypt_value
from app.services.intervals_client import get_activities, get_activity_single, get_events
from app.services.intervals_sync import sync_intervals_to_db

router = APIRouter(prefix="/intervals", tags=["intervals"])


class LinkIntervalsBody(BaseModel):
    athlete_id: str
    api_key: str


@router.get("/status")
async def get_intervals_status(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Return whether Intervals.icu is linked for the current user (no key in response)."""
    uid = user.id
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if not creds:
        return {"linked": False}
    return {"linked": True, "athlete_id": creds.athlete_id}


@router.post("/link")
async def link_intervals(
    session: Annotated[AsyncSession, Depends(get_db)],
    body: LinkIntervalsBody,
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Store Intervals.icu athlete_id and API key (encrypted)."""
    uid = user.id
    encrypted = encrypt_value(body.api_key)
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    existing = r.scalar_one_or_none()
    if existing:
        existing.encrypted_token_or_key = encrypted
        existing.athlete_id = body.athlete_id
    else:
        session.add(
            IntervalsCredentials(
                user_id=uid,
                encrypted_token_or_key=encrypted,
                athlete_id=body.athlete_id,
            )
        )
    await session.commit()
    return {"status": "linked", "athlete_id": body.athlete_id}


@router.post("/unlink")
async def unlink_intervals(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Remove Intervals.icu credentials for the current user."""
    uid = user.id
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if creds:
        session.delete(creds)
        await session.commit()
    return {"status": "unlinked"}


@router.post("/sync")
async def trigger_sync(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Fetch activities and wellness from Intervals.icu and save to our DB."""
    uid = user.id
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if not creds:
        raise HTTPException(status_code=400, detail="Intervals.icu is not linked.")
    api_key = decrypt_value(creds.encrypted_token_or_key)
    if not api_key:
        logging.warning("Intervals.icu: API key decryption failed for user_id=%s", uid)
        raise HTTPException(status_code=500, detail="Invalid stored credentials.")
    try:
        activities_count, wellness_count = await sync_intervals_to_db(
            session, uid, creds.athlete_id, api_key
        )
    except httpx.TimeoutException as e:
        logging.exception("Intervals sync failed for user_id=%s: %s", uid, e)
        raise HTTPException(
            status_code=503,
            detail="Sync timed out. Intervals.icu is slow; try again later.",
        )
    except httpx.HTTPStatusError as e:
        logging.exception("Intervals sync failed for user_id=%s: %s", uid, e)
        if e.response.status_code in (401, 403):
            raise HTTPException(
                status_code=503,
                detail="Invalid Intervals.icu API key or athlete ID. Check Settings.",
            )
        raise HTTPException(
            status_code=503,
            detail="Intervals.icu sync failed. Try again later or check your connection.",
        )
    except Exception as e:
        logging.exception("Intervals sync failed for user_id=%s: %s", uid, e)
        raise HTTPException(
            status_code=503,
            detail="Intervals.icu sync failed. Try again later or check your connection.",
        )
    logging.info(
        "Intervals sync completed for user_id=%s: activities_synced=%s, wellness_days_synced=%s",
        uid,
        activities_count,
        wellness_count,
    )
    if wellness_count == 0:
        logging.warning(
            "Intervals sync returned 0 wellness days for user_id=%s; Intervals.icu may have no wellness data for the range.",
            uid,
        )
    return {
        "status": "synced",
        "user_id": uid,
        "activities_synced": activities_count,
        "wellness_days_synced": wellness_count,
    }


@router.get("/events")
async def get_events_from_api(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """Fetch planned events from Intervals.icu for date range."""
    uid = user.id
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if not creds:
        return []
    api_key = decrypt_value(creds.encrypted_token_or_key)
    if not api_key:
        logging.warning("Intervals.icu: API key decryption failed for user_id=%s", uid)
        return []
    to_date = to_date or date.today()
    from_date = from_date or (to_date - timedelta(days=7))
    try:
        events = await get_events(creds.athlete_id, api_key, from_date, to_date)
    except Exception as e:
        logging.exception("Intervals.icu get_events failed for user_id=%s: %s", uid, e)
        return []
    return [
        {
            "id": e.id,
            "title": e.title,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "type": e.type,
        }
        for e in events
    ]


@router.get("/activities")
async def get_activities_from_api(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """Fetch completed activities (workouts) from Intervals.icu for date range."""
    uid = user.id
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if not creds:
        return []
    api_key = decrypt_value(creds.encrypted_token_or_key)
    if not api_key:
        logging.warning("Intervals.icu: API key decryption failed for user_id=%s", uid)
        return []
    to_date = to_date or date.today()
    from_date = from_date or (to_date - timedelta(days=14))
    try:
        activities = await get_activities(creds.athlete_id, api_key, from_date, to_date, limit=100)
    except Exception as e:
        logging.exception("Intervals.icu get_activities failed for user_id=%s: %s", uid, e)
        return []
    # Enrich with full details when list returns only id/start_date (single-activity fetch).
    # Skip for Strava: API returns _note "STRAVA activities are not available via the API" and single-activity GET returns same minimal object.
    raw_get = lambda a: a.raw or {}
    need_detail = [
        a for a in activities
        if a.id
        and raw_get(a).get("source") != "STRAVA"
        and (not a.name and not raw_get(a).get("moving_time") and not raw_get(a).get("movingTime"))
    ]
    detail_by_id: dict[str, dict] = {}
    if need_detail:
        results = await asyncio.gather(
            *[get_activity_single(api_key, a.id) for a in need_detail],
            return_exceptions=True,
        )
        for a, res in zip(need_detail, results):
            if isinstance(res, dict):
                detail_by_id[a.id] = res
    out = []
    for a in activities:
        raw = dict(a.raw or {})
        if a.id in detail_by_id:
            raw.update(detail_by_id[a.id])
        name = a.name or raw.get("title") or raw.get("name") or ("Strava" if raw.get("source") == "STRAVA" else None)
        duration_sec = raw.get("moving_time") or raw.get("movingTime") or raw.get("duration")
        if duration_sec is None and isinstance(raw.get("length"), (int, float)):
            duration_sec = raw.get("length")
        distance_m = raw.get("distance") or raw.get("length")
        distance_km = round(float(distance_m) / 1000, 1) if isinstance(distance_m, (int, float)) and distance_m else None
        start_date_out = a.start_date.isoformat() if a.start_date else raw.get("start_date_local") or raw.get("start_date") or raw.get("startDate")
        tss_out = a.icu_training_load if a.icu_training_load is not None else raw.get("icu_training_load") or raw.get("training_load") or raw.get("tss")
        out.append({
            "id": a.id,
            "name": name,
            "start_date": start_date_out,
            "duration_sec": int(duration_sec) if isinstance(duration_sec, (int, float)) else None,
            "distance_km": distance_km,
            "tss": tss_out,
        })
    return out
