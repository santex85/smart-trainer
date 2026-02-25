"""Tests for load metrics (CTL/ATL/TSB) from workouts."""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.load_metrics import compute_fitness_from_workouts


@pytest.mark.asyncio
async def test_compute_fitness_returns_none_when_no_workouts():
    """With no workouts in DB, compute_fitness_from_workouts returns None."""
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    result = await compute_fitness_from_workouts(session, 1)
    assert result is None


@pytest.mark.asyncio
async def test_compute_fitness_returns_ctl_atl_tsb_when_workouts_exist():
    """With TSS data, compute_fitness_from_workouts returns dict with ctl, atl, tsb, date."""
    today = date(2026, 2, 25)
    # One workout 7 days ago with TSS 50
    start_dt = datetime.combine(today - timedelta(days=7), datetime.min.time()).replace(tzinfo=timezone.utc)
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(all=MagicMock(return_value=[(start_dt, 50.0)]))
    )
    result = await compute_fitness_from_workouts(session, 1, as_of=today)
    assert result is not None
    assert "ctl" in result
    assert "atl" in result
    assert "tsb" in result
    assert "date" in result
    assert result["date"] == today.isoformat()
    assert isinstance(result["ctl"], (int, float))
    assert isinstance(result["atl"], (int, float))
    assert isinstance(result["tsb"], (int, float))
