"""Sync Intervals.icu data into our DB: activities -> workouts, wellness -> wellness_cache (sleep, RHR, HRV, CTL/ATL/TSB)."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wellness_cache import WellnessCache
from app.models.workout import Workout
from app.services.intervals_client import get_activities, get_wellness


SYNC_DAYS = 90


def _activity_to_workout_row(user_id: int, raw: dict, ext_id: str, start_dt: datetime | None, name: str | None, tss: float | None) -> dict:
    duration_sec = raw.get("moving_time") or raw.get("movingTime") or raw.get("duration")
    if duration_sec is None and isinstance(raw.get("length"), (int, float)):
        duration_sec = raw.get("length")
    distance_m = raw.get("distance") or raw.get("length")
    if start_dt and start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    return {
        "user_id": user_id,
        "external_id": ext_id,
        "source": "intervals",
        "start_date": start_dt,
        "name": name or raw.get("title") or raw.get("name"),
        "type": raw.get("type"),
        "duration_sec": int(duration_sec) if isinstance(duration_sec, (int, float)) else None,
        "distance_m": float(distance_m) if isinstance(distance_m, (int, float)) else None,
        "tss": float(tss) if isinstance(tss, (int, float)) else None,
        "raw": raw,
    }


async def sync_intervals_to_db(
    session: AsyncSession,
    user_id: int,
    athlete_id: str,
    api_key: str,
) -> tuple[int, int]:
    """
    Fetch activities and wellness from Intervals.icu and upsert into workouts and wellness_cache.
    Returns (activities_upserted, wellness_days_upserted).
    """
    newest = date.today()
    oldest = newest - timedelta(days=SYNC_DAYS)
    activities = await get_activities(athlete_id, api_key, oldest, newest, limit=500)
    wellness_days = await get_wellness(athlete_id, api_key, oldest, newest)

    # Upsert workouts by (user_id, external_id)
    count_workouts = 0
    for a in activities:
        if not a.id:
            continue
        raw = dict(a.raw or {})
        start_dt = a.start_date
        name = a.name or raw.get("title") or raw.get("name")
        tss = a.icu_training_load if a.icu_training_load is not None else raw.get("icu_training_load") or raw.get("training_load") or raw.get("tss")
        row = _activity_to_workout_row(user_id, raw, a.id, start_dt, name, tss)
        stmt = (
            pg_insert(Workout)
            .values(
                user_id=row["user_id"],
                external_id=row["external_id"],
                source=row["source"],
                start_date=row["start_date"],
                name=row["name"],
                type=row["type"],
                duration_sec=row["duration_sec"],
                distance_m=row["distance_m"],
                tss=row["tss"],
                raw=row["raw"],
            )
            .on_conflict_do_update(
                index_elements=["user_id", "external_id"],
                set_={
                    "start_date": row["start_date"],
                    "name": row["name"],
                    "type": row["type"],
                    "duration_sec": row["duration_sec"],
                    "distance_m": row["distance_m"],
                    "tss": row["tss"],
                    "raw": row["raw"],
                },
            )
        )
        await session.execute(stmt)
        count_workouts += 1

    # Upsert wellness_cache: ctl, atl, tsb from Intervals; sleep_hours, rhr, hrv only when currently null (Variant A)
    count_wellness = 0
    for w in wellness_days:
        if w.date is None:
            continue
        r = await session.execute(
            select(WellnessCache).where(
                WellnessCache.user_id == user_id,
                WellnessCache.date == w.date,
            )
        )
        existing = r.scalar_one_or_none()
        if existing:
            existing.ctl = w.ctl
            existing.atl = w.atl
            existing.tsb = w.tsb
            if existing.sleep_hours is None and w.sleep_hours is not None:
                existing.sleep_hours = w.sleep_hours
            if existing.rhr is None and w.rhr is not None:
                existing.rhr = float(w.rhr)
            if existing.hrv is None and w.hrv is not None:
                existing.hrv = float(w.hrv)
        else:
            session.add(
                WellnessCache(
                    user_id=user_id,
                    date=w.date,
                    sleep_hours=w.sleep_hours,
                    rhr=float(w.rhr) if w.rhr is not None else None,
                    hrv=float(w.hrv) if w.hrv is not None else None,
                    ctl=w.ctl,
                    atl=w.atl,
                    tsb=w.tsb,
                )
            )
        count_wellness += 1

    await session.commit()
    return (count_workouts, count_wellness)


async def sync_user_wellness(session: AsyncSession, user_id: int) -> None:
    """No-op: use sync_intervals_to_db for full Intervals sync."""
    pass


async def sync_all_users_wellness(session: AsyncSession) -> None:
    """No-op: use sync_intervals_to_db per user with Intervals linked."""
    pass
