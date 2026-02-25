"""Workouts API: CRUD for manual (and later FIT) training entries; fitness (CTL/ATL/TSB) from workouts."""

import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.models.workout import Workout
from app.schemas.workout import WorkoutCreate, WorkoutUpdate
from app.services.fit_parser import parse_fit_session
from app.services.load_metrics import compute_fitness_from_workouts

# Default TSS per hour when no power (by sport)
DEFAULT_TSS_PER_HOUR: dict[str, float] = {
    "running": 60.0,
    "cycling": 55.0,
    "swimming": 65.0,
    "generic": 50.0,
}
DEFAULT_TSS_PER_HOUR_FALLBACK = 50.0

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _row_to_response(row: Workout) -> dict:
    return {
        "id": row.id,
        "start_date": row.start_date.isoformat() if row.start_date else None,
        "name": row.name,
        "type": row.type,
        "duration_sec": row.duration_sec,
        "distance_m": row.distance_m,
        "tss": row.tss,
        "source": row.source,
        "notes": row.notes,
    }


@router.get("", response_model=list[dict])
async def list_workouts(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """List workouts for the current user in the given date range."""
    uid = user.id
    to_date = to_date or date.today()
    from_date = from_date or (to_date - timedelta(days=14))
    from_dt = datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc)
    r = await session.execute(
        select(Workout).where(
            Workout.user_id == uid,
            Workout.start_date >= from_dt,
            Workout.start_date < to_dt,
        ).order_by(Workout.start_date.desc())
    )
    rows = r.scalars().all()
    return [_row_to_response(row) for row in rows]


@router.post("", response_model=dict, status_code=201)
async def create_workout(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: WorkoutCreate,
) -> dict:
    """Create a manual workout entry."""
    uid = user.id
    start = body.start_date
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    w = Workout(
        user_id=uid,
        start_date=start,
        name=body.name,
        type=body.type,
        duration_sec=body.duration_sec,
        distance_m=body.distance_m,
        tss=body.tss,
        notes=body.notes,
        source="manual",
    )
    session.add(w)
    await session.commit()
    await session.refresh(w)
    return _row_to_response(w)


@router.patch("/{workout_id}", response_model=dict)
async def update_workout(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    workout_id: int,
    body: WorkoutUpdate,
) -> dict:
    """Update a workout (only manual workouts should be updated)."""
    uid = user.id
    r = await session.execute(select(Workout).where(Workout.id == workout_id, Workout.user_id == uid))
    w = r.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workout not found.")
    if body.start_date is not None:
        start = body.start_date
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        w.start_date = start
    if body.name is not None:
        w.name = body.name
    if body.type is not None:
        w.type = body.type
    if body.duration_sec is not None:
        w.duration_sec = body.duration_sec
    if body.distance_m is not None:
        w.distance_m = body.distance_m
    if body.tss is not None:
        w.tss = body.tss
    if body.notes is not None:
        w.notes = body.notes
    await session.commit()
    await session.refresh(w)
    return _row_to_response(w)


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    workout_id: int,
) -> None:
    """Delete a workout."""
    uid = user.id
    r = await session.execute(select(Workout).where(Workout.id == workout_id, Workout.user_id == uid))
    w = r.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workout not found.")
    await session.delete(w)
    await session.commit()


@router.get("/fitness", response_model=dict | None)
async def get_fitness(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict | None:
    """Compute CTL/ATL/TSB from workouts (manual + FIT) over the last 90 days. Returns None if no workouts."""
    return await compute_fitness_from_workouts(session, user.id)


def _estimate_tss_from_fit(
    duration_sec: int,
    avg_power: float | None,
    normalized_power: float | None,
    ftp: float | None,
    sport: str | None,
) -> float:
    """Estimate TSS from FIT session: power-based if FTP and power available, else duration/sport."""
    if duration_sec <= 0:
        return 0.0
    np = normalized_power or avg_power
    if np is not None and ftp is not None and ftp > 0 and np > 0:
        # TSS = (t * NP^2) / (FTP^2 * 36), t in seconds
        return round((duration_sec * np * np) / (ftp * ftp * 36.0), 1)
    key = (sport or "generic").lower()
    if "run" in key:
        key = "running"
    elif "cycl" in key or "bike" in key:
        key = "cycling"
    elif "swim" in key:
        key = "swimming"
    else:
        key = "generic"
    tss_per_hour = DEFAULT_TSS_PER_HOUR.get(key, DEFAULT_TSS_PER_HOUR_FALLBACK)
    return round((duration_sec / 3600.0) * tss_per_hour, 1)


@router.post("/upload-fit", response_model=dict, status_code=201)
async def upload_fit(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="FIT file")],
) -> dict:
    """Upload a FIT file; parse session, dedupe by checksum, create workout with source=fit."""
    if not file.filename or not file.filename.lower().endswith(".fit"):
        raise HTTPException(status_code=400, detail="Expected a .fit file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    checksum = hashlib.sha256(content).hexdigest()
    uid = user.id

    r = await session.execute(
        select(Workout).where(Workout.user_id == uid, Workout.fit_checksum == checksum)
    )
    existing = r.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="This FIT file was already imported.")

    data = parse_fit_session(content)
    if not data:
        raise HTTPException(status_code=400, detail="Could not parse FIT file or no session found.")

    start_date = data["start_date"]
    if isinstance(start_date, datetime) and start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)

    r = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == uid))
    profile = r.scalar_one_or_none()
    ftp = None
    if profile and (profile.ftp is not None or profile.strava_ftp is not None):
        ftp = float(profile.ftp if profile.ftp is not None else profile.strava_ftp)

    duration_sec = data.get("duration_sec") or 0
    tss = _estimate_tss_from_fit(
        duration_sec,
        data.get("avg_power"),
        data.get("normalized_power"),
        ftp,
        data.get("sport"),
    )

    sport_name = (data.get("sport") or "Workout").capitalize()
    w = Workout(
        user_id=uid,
        start_date=start_date,
        name=sport_name,
        type=sport_name,
        duration_sec=duration_sec or None,
        distance_m=data.get("distance_m"),
        tss=tss if tss > 0 else None,
        source="fit",
        fit_checksum=checksum,
        raw=data.get("raw"),
    )
    session.add(w)
    await session.commit()
    await session.refresh(w)
    return _row_to_response(w)
