"""Sync Intervals.icu data into our DB: activities -> workouts, wellness -> wellness_cache (sleep, RHR, HRV, CTL/ATL/TSB)."""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

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

    if not wellness_days:
        logging.warning(
            "Intervals.icu get_wellness returned no days for range %s..%s (user_id=%s)",
            oldest.isoformat(),
            newest.isoformat(),
            user_id,
        )
    else:
        first_date = wellness_days[0].date.isoformat() if wellness_days[0].date else "?"
        last_date = wellness_days[-1].date.isoformat() if wellness_days[-1].date else "?"
        logging.info(
            "Intervals.icu get_wellness returned %s days for user_id=%s (first=%s, last=%s)",
            len(wellness_days),
            user_id,
            first_date,
            last_date,
        )

    # Deduplicate activities by external_id (same activity may appear with different id representation)
    seen_ids: set[str] = set()
    activities_deduped = []
    for a in activities:
        if not a.id or a.id in seen_ids:
            continue
        seen_ids.add(a.id)
        activities_deduped.append(a)

    # Batch upsert workouts by (user_id, external_id)
    workout_rows = []
    for a in activities_deduped:
        if not a.id:
            continue
        raw = dict(a.raw or {})
        start_dt = a.start_date
        name = a.name or raw.get("title") or raw.get("name")
        tss = a.icu_training_load if a.icu_training_load is not None else raw.get("icu_training_load") or raw.get("training_load") or raw.get("tss")
        workout_rows.append(_activity_to_workout_row(user_id, raw, a.id, start_dt, name, tss))
    if workout_rows:
        stmt_workouts = pg_insert(Workout).values(workout_rows)
        stmt_workouts = stmt_workouts.on_conflict_do_update(
            index_elements=["user_id", "external_id"],
            set_={
                "start_date": stmt_workouts.excluded.start_date,
                "name": stmt_workouts.excluded.name,
                "type": stmt_workouts.excluded.type,
                "duration_sec": stmt_workouts.excluded.duration_sec,
                "distance_m": stmt_workouts.excluded.distance_m,
                "tss": stmt_workouts.excluded.tss,
                "raw": stmt_workouts.excluded.raw,
            },
        )
        await session.execute(stmt_workouts)
    count_workouts = len(workout_rows)

    # Batch upsert wellness_cache: ctl, atl, tsb from Intervals; preserve existing sleep_hours/rhr/hrv/weight_kg via coalesce
    wellness_rows = []
    for w in wellness_days:
        if w.date is None:
            continue
        wellness_rows.append({
            "user_id": user_id,
            "date": w.date,
            "sleep_hours": w.sleep_hours,
            "rhr": float(w.rhr) if w.rhr is not None else None,
            "hrv": float(w.hrv) if w.hrv is not None else None,
            "ctl": w.ctl,
            "atl": w.atl,
            "tsb": w.tsb,
            "weight_kg": float(w.weight_kg) if w.weight_kg is not None else None,
            "sport_info": w.sport_info if w.sport_info else None,
        })
    if wellness_rows:
        stmt_wellness = pg_insert(WellnessCache).values(wellness_rows)
        stmt_wellness = stmt_wellness.on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={
                "ctl": stmt_wellness.excluded.ctl,
                "atl": stmt_wellness.excluded.atl,
                "tsb": stmt_wellness.excluded.tsb,
                "sleep_hours": func.coalesce(WellnessCache.sleep_hours, stmt_wellness.excluded.sleep_hours),
                "rhr": func.coalesce(WellnessCache.rhr, stmt_wellness.excluded.rhr),
                "hrv": func.coalesce(WellnessCache.hrv, stmt_wellness.excluded.hrv),
                "weight_kg": func.coalesce(WellnessCache.weight_kg, stmt_wellness.excluded.weight_kg),
                "sport_info": stmt_wellness.excluded.sport_info,
            },
        )
        await session.execute(stmt_wellness)
    count_wellness = len(wellness_rows)

    await session.commit()
    return (count_workouts, count_wellness)


async def sync_user_wellness(session: AsyncSession, user_id: int) -> None:
    """No-op: use sync_intervals_to_db for full Intervals sync."""
    pass


async def sync_all_users_wellness(session: AsyncSession) -> None:
    """No-op: use sync_intervals_to_db per user with Intervals linked."""
    pass
