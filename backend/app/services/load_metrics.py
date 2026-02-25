"""CTL/ATL/TSB computation from unified workouts (manual + FIT)."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workout import Workout

CTL_TAU = 42  # days
ATL_TAU = 7   # days


async def compute_fitness_from_workouts(
    session: AsyncSession,
    user_id: int,
    *,
    from_days: int = 90,
    as_of: date | None = None,
) -> dict | None:
    """
    Compute CTL, ATL, TSB from workouts in the last from_days.
    Returns {"ctl", "atl", "tsb", "date"} or None if no workouts.
    """
    to_date = as_of or date.today()
    from_date = to_date - timedelta(days=from_days)
    from_dt = datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc)
    r = await session.execute(
        select(Workout.start_date, Workout.tss).where(
            Workout.user_id == user_id,
            Workout.start_date >= from_dt,
            Workout.start_date < to_dt,
        )
    )
    tss_by_date: dict[date, float] = {}
    for row in r.all():
        start_date, tss_val = row
        if start_date:
            d = start_date.date() if hasattr(start_date, "date") else start_date
            tss = float(tss_val) if tss_val is not None else 0.0
            tss_by_date[d] = tss_by_date.get(d, 0.0) + tss
    if not tss_by_date:
        return None
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
