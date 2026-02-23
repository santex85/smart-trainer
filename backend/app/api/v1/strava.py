"""Strava: OAuth link, sync activities, list activities from DB."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete_profile import AthleteProfile
from app.models.strava_activity import StravaActivity
from app.models.strava_credentials import StravaCredentials
from app.models.strava_sync_queue import StravaSyncQueue
from app.models.user import User
from app.services.crypto import decrypt_value, encrypt_value
from app.services.strava_client import exchange_code, get_current_athlete, strava_can_make_request
from app.services.strava_sync import run_sync_or_enqueue, sync_user_strava_activities
from app.services.tss import compute_activity_tss

router = APIRouter(prefix="/strava", tags=["strava"])


@router.get("/status")
async def get_strava_status(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Return whether Strava is linked for the current user."""
    uid = user.id
    r = await session.execute(select(StravaCredentials).where(StravaCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if not creds:
        return {"linked": False}
    return {"linked": True, "athlete_id": str(creds.strava_athlete_id) if creds.strava_athlete_id else None}


@router.get("/authorize-url")
async def get_authorize_url(user: Annotated[User, Depends(get_current_user)]) -> dict:
    """Return URL to redirect user to Strava OAuth authorization page. State carries user_id for callback."""
    from app.config import settings

    if not settings.strava_client_id or not settings.strava_redirect_uri:
        raise HTTPException(status_code=503, detail="Strava app not configured.")
    url = (
        "https://www.strava.com/oauth/authorize"
        f"?client_id={settings.strava_client_id}"
        f"&redirect_uri={settings.strava_redirect_uri}"
        "&response_type=code"
        "&scope=activity:read_all,read"
        "&approval_prompt=force"
        f"&state={user.id}"
    )
    return {"url": url}


@router.get("/callback")
async def strava_callback(
    session: Annotated[AsyncSession, Depends(get_db)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Exchange code for tokens, store credentials, run first sync or enqueue. State must be user_id from authorize-url."""
    if error:
        raise HTTPException(status_code=400, detail=f"Strava authorization failed: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code parameter.")
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter.")
    try:
        uid = int(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state.")
    r = await session.execute(select(User).where(User.id == uid))
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="User not found.")
    try:
        data = await exchange_code(code)
    except Exception as e:
        logging.exception("Strava token exchange failed: %s", e)
        raise HTTPException(status_code=400, detail="Failed to exchange code for tokens.")
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    expires_at = data.get("expires_at")
    athlete = data.get("athlete") or {}
    athlete_id = athlete.get("id")
    if not refresh_token:
        raise HTTPException(status_code=400, detail="No refresh token in response.")
    encrypted = encrypt_value(refresh_token)
    expires_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc) if expires_at else None
    r = await session.execute(select(StravaCredentials).where(StravaCredentials.user_id == uid))
    creds = r.scalar_one_or_none()
    if creds:
        creds.encrypted_refresh_token = encrypted
        creds.access_token = access_token
        creds.expires_at = expires_dt
        creds.strava_athlete_id = athlete_id
    else:
        session.add(
            StravaCredentials(
                user_id=uid,
                encrypted_refresh_token=encrypted,
                access_token=access_token,
                expires_at=expires_dt,
                strava_athlete_id=athlete_id,
            )
        )
    await session.flush()
    # Fetch full athlete profile from Strava and upsert athlete_profile (if rate limit allows)
    if strava_can_make_request():
        try:
            athlete_data = await get_current_athlete(access_token)
            if athlete_data:
                r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
                profile = r.scalar_one_or_none()
                now = datetime.now(timezone.utc)
                if profile:
                    profile.strava_weight_kg = athlete_data.get("weight")
                    profile.strava_ftp = athlete_data.get("ftp")
                    profile.strava_firstname = athlete_data.get("firstname")
                    profile.strava_lastname = athlete_data.get("lastname")
                    profile.strava_profile_url = athlete_data.get("profile") or athlete_data.get("profile_medium")
                    profile.strava_sex = athlete_data.get("sex")
                    profile.strava_updated_at = now
                else:
                    session.add(
                        AthleteProfile(
                            user_id=uid,
                            strava_weight_kg=athlete_data.get("weight"),
                            strava_ftp=athlete_data.get("ftp"),
                            strava_firstname=athlete_data.get("firstname"),
                            strava_lastname=athlete_data.get("lastname"),
                            strava_profile_url=athlete_data.get("profile") or athlete_data.get("profile_medium"),
                            strava_sex=athlete_data.get("sex"),
                            strava_updated_at=now,
                        )
                    )
                await session.flush()
        except Exception as e:
            logging.warning("Failed to fetch Strava athlete profile: %s", e)
    status = await run_sync_or_enqueue(session, uid)
    await session.commit()
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Strava connected</title></head><body>"
        "<p>Strava connected. You can close this window and return to the app.</p>"
        f"<p>Status: {status}</p>"
        "</body></html>"
    )
    return HTMLResponse(content=html)


@router.post("/unlink")
async def unlink_strava(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Remove Strava credentials and all synced activities for the current user."""
    uid = user.id
    await session.execute(delete(StravaActivity).where(StravaActivity.user_id == uid))
    await session.execute(delete(StravaSyncQueue).where(StravaSyncQueue.user_id == uid))
    await session.execute(delete(StravaCredentials).where(StravaCredentials.user_id == uid))
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    if profile:
        profile.strava_weight_kg = None
        profile.strava_ftp = None
        profile.strava_firstname = None
        profile.strava_lastname = None
        profile.strava_profile_url = None
        profile.strava_sex = None
        profile.strava_updated_at = None
    await session.commit()
    return {"status": "unlinked"}


@router.post("/sync")
async def trigger_sync(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Run sync now if rate limit allows, otherwise enqueue. Returns status: syncing | queued."""
    uid = user.id
    r = await session.execute(select(StravaCredentials).where(StravaCredentials.user_id == uid))
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Strava not linked.")
    status = await run_sync_or_enqueue(session, uid)
    await session.commit()
    if status == "queued":
        return {"status": "queued", "message": "Sync scheduled; will run when rate limit allows."}
    return {"status": "syncing"}


def _effective_ftp_from_profile(profile: AthleteProfile | None) -> float | None:
    if not profile:
        return None
    v = profile.ftp if profile.ftp is not None else profile.strava_ftp
    return float(v) if v is not None else None


@router.get("/activities")
async def get_activities(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """Return activities from DB (default last 14 days). TSS is computed (power/suffer_score/duration)."""
    uid = user.id
    to_date = to_date or date.today()
    from_date = from_date or (to_date - timedelta(days=14))
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    ftp = _effective_ftp_from_profile(profile)
    r = await session.execute(
        select(StravaActivity)
        .where(
            StravaActivity.user_id == uid,
            StravaActivity.start_date >= datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            StravaActivity.start_date < datetime.combine(to_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc),
        )
        .order_by(StravaActivity.start_date.desc())
    )
    rows = r.scalars().all()
    out = []
    for a in rows:
        start_iso = a.start_date.isoformat() if a.start_date else None
        distance_km = round(a.distance_m / 1000, 1) if a.distance_m is not None else None
        tss = compute_activity_tss(a, ftp)
        out.append({
            "id": str(a.strava_id),
            "name": a.name,
            "start_date": start_iso,
            "duration_sec": a.moving_time_sec,
            "distance_km": distance_km,
            "tss": tss,
            "type": a.type,
        })
    return out


# TrainingPeaks/Intervals-style CTL/ATL/TSB (exponential moving average of TSS)
CTL_TAU = 42  # days
ATL_TAU = 7   # days


@router.get("/fitness")
async def get_fitness(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict | None:
    """Compute CTL/ATL/TSB from Strava activities (custom TSS: power/suffer_score/duration). Formula: TrainingPeaks/Intervals EMA."""
    uid = user.id
    to_date = date.today()
    from_date = to_date - timedelta(days=90)
    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    ftp = _effective_ftp_from_profile(profile)
    r = await session.execute(
        select(StravaActivity).where(
            StravaActivity.user_id == uid,
            StravaActivity.start_date >= datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            StravaActivity.start_date < datetime.combine(to_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc),
        )
    )
    activities = r.scalars().all()
    # TSS by date (sum if multiple activities per day), using computed TSS
    tss_by_date: dict[date, float] = {}
    for a in activities:
        if a.start_date:
            d = a.start_date.date() if hasattr(a.start_date, "date") else a.start_date
            tss = compute_activity_tss(a, ftp)
            tss_by_date[d] = tss_by_date.get(d, 0.0) + tss
    if not tss_by_date:
        return None
    # Run EMA over every day from first activity to today (TSS=0 on rest days) so CTL/ATL decay
    first_date = min(tss_by_date.keys())
    ctl, atl = 0.0, 0.0
    d = first_date
    while d <= to_date:
        tss = tss_by_date.get(d, 0.0)
        ctl = ctl + (tss - ctl) / CTL_TAU
        atl = atl + (tss - atl) / ATL_TAU
        d += timedelta(days=1)
    tsb = ctl - atl
    return {
        "ctl": round(ctl, 1),
        "atl": round(atl, 1),
        "tsb": round(tsb, 1),
        "date": to_date.isoformat(),
    }
