"""Tests for load metrics (CTL/ATL/TSB) from workouts."""

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
