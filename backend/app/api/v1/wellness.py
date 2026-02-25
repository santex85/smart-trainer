"""Wellness API: user-entered sleep, RHR, HRV. Independent of Intervals."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.wellness_cache import WellnessCache
from app.schemas.wellness import WellnessUpsertBody

router = APIRouter(prefix="/wellness", tags=["wellness"])


def _row_to_response(row: WellnessCache) -> dict:
    return {
        "date": row.date.isoformat(),
        "sleep_hours": row.sleep_hours,
        "rhr": row.rhr,
        "hrv": row.hrv,
        "ctl": row.ctl,
        "atl": row.atl,
        "tsb": row.tsb,
        "weight_kg": row.weight_kg,
        "sport_info": row.sport_info,
    }


@router.get("", response_model=list[dict])
async def get_wellness(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """Return wellness entries for date range from DB only (no Intervals sync)."""
    uid = user.id
    to_date = to_date or date.today()
    from_date = from_date or (to_date - timedelta(days=30))
    r = await session.execute(
        select(WellnessCache).where(
            WellnessCache.user_id == uid,
            WellnessCache.date >= from_date,
            WellnessCache.date <= to_date,
        ).order_by(WellnessCache.date.asc())
    )
    rows = r.scalars().all()
    return [_row_to_response(row) for row in rows]


@router.put("", response_model=dict)
async def upsert_wellness(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: WellnessUpsertBody,
) -> dict:
    """Create or update one day of wellness. Only sleep_hours, rhr, hrv are writable; ctl/atl/tsb remain from DB or null."""
    uid = user.id
    r = await session.execute(
        select(WellnessCache).where(
            WellnessCache.user_id == uid,
            WellnessCache.date == body.date,
        )
    )
    row = r.scalar_one_or_none()
    if row:
        if body.sleep_hours is not None:
            row.sleep_hours = body.sleep_hours
        if body.rhr is not None:
            row.rhr = body.rhr
        if body.hrv is not None:
            row.hrv = body.hrv
        if body.weight_kg is not None:
            row.weight_kg = body.weight_kg
    else:
        session.add(
            WellnessCache(
                user_id=uid,
                date=body.date,
                sleep_hours=body.sleep_hours,
                rhr=body.rhr,
                hrv=body.hrv,
                weight_kg=body.weight_kg,
            )
        )
    await session.commit()
    r2 = await session.execute(
        select(WellnessCache).where(
            WellnessCache.user_id == uid,
            WellnessCache.date == body.date,
        )
    )
    saved = r2.scalar_one()
    return _row_to_response(saved)
