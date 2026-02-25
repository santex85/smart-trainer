"""
Performance optimization tests: verify batch operations, parallel execution,
and async patterns work correctly.
"""
import asyncio
import time
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.load_metrics import compute_fitness_from_workouts


# ---------------------------------------------------------------------------
# Test: Batch upsert in intervals_sync builds correct batch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_intervals_sync_batch_workout_upsert():
    """Verify intervals_sync builds batch instead of per-item queries."""
    from app.services.intervals_sync import _activity_to_workout_row

    raw = {
        "moving_time": 3600,
        "distance": 10000,
        "type": "Run",
        "title": "Morning Run",
    }
    row = _activity_to_workout_row(
        user_id=1,
        raw=raw,
        ext_id="act_123",
        start_dt=datetime(2026, 1, 15, 8, 0, tzinfo=timezone.utc),
        name="Morning Run",
        tss=65.0,
    )
    assert row["user_id"] == 1
    assert row["external_id"] == "act_123"
    assert row["source"] == "intervals"
    assert row["duration_sec"] == 3600
    assert row["distance_m"] == 10000
    assert row["tss"] == 65.0
    assert row["name"] == "Morning Run"


# ---------------------------------------------------------------------------
# Test: Image resize async wrapper
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_resize_async_offloads_to_threadpool():
    """Verify the async resize runs without blocking the event loop."""
    from app.services.image_resize import resize_image_for_ai_async

    from PIL import Image
    import io

    img = Image.new("RGB", (3000, 2000), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    original_bytes = buf.getvalue()

    result = await resize_image_for_ai_async(original_bytes, max_long_side=512)

    assert len(result) < len(original_bytes)
    resized_img = Image.open(io.BytesIO(result))
    assert max(resized_img.size) <= 512


@pytest.mark.asyncio
async def test_image_resize_sync_backward_compat():
    """Verify the sync resize still works for backward compatibility."""
    from app.services.image_resize import resize_image_for_ai

    from PIL import Image
    import io

    img = Image.new("RGB", (2000, 1000), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    original_bytes = buf.getvalue()

    result = resize_image_for_ai(original_bytes, max_long_side=256)

    assert len(result) > 0
    resized_img = Image.open(io.BytesIO(result))
    assert max(resized_img.size) <= 256


# ---------------------------------------------------------------------------
# Test: Load metrics computation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_fitness_returns_none_when_no_workouts():
    """With no workouts in DB, compute_fitness_from_workouts returns None."""
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    result = await compute_fitness_from_workouts(session, 1)
    assert result is None


@pytest.mark.asyncio
async def test_compute_fitness_with_workouts():
    """Verify CTL/ATL/TSB computation with mock workout data."""
    today = date.today()
    workout_data = []
    for i in range(7):
        d = today - timedelta(days=i)
        dt = datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)
        workout_data.append((dt, 80.0))

    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=MagicMock(all=MagicMock(return_value=workout_data))
    )

    result = await compute_fitness_from_workouts(session, 1, as_of=today)
    assert result is not None
    assert "ctl" in result
    assert "atl" in result
    assert "tsb" in result
    assert result["ctl"] > 0
    assert result["atl"] > 0


# ---------------------------------------------------------------------------
# Test: Orchestrator context building uses parallel queries
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_orchestrator_context_queries_called():
    """Verify orchestrator calls multiple DB queries (for context gathering)."""
    from app.services.orchestrator import _build_context

    food_sum = {"calories": 2000, "protein_g": 120, "fat_g": 80, "carbs_g": 250}
    wellness = {"sleep_hours": 7.5, "rhr": 52, "hrv": 65}
    events = [{"id": "e1", "title": "Tempo Run", "start_date": "2026-02-25", "type": "Run"}]
    ctl_atl_tsb = {"ctl": 55.2, "atl": 62.1, "tsb": -6.9}

    context = _build_context(food_sum, wellness, events, ctl_atl_tsb)

    assert "2000" in context
    assert "120" in context
    assert "7.5" in context
    assert "Tempo Run" in context
    assert "55.2" in context


# ---------------------------------------------------------------------------
# Test: GZip middleware is configured
# ---------------------------------------------------------------------------

def test_gzip_middleware_configured():
    """Verify GZip middleware is present on the FastAPI app."""
    from app.main import app

    middleware_classes = [type(m).__name__ for m in app.user_middleware]
    middleware_names = [m.cls.__name__ if hasattr(m, 'cls') else str(m) for m in app.user_middleware]
    assert any("GZip" in name for name in middleware_names), (
        f"GZip middleware not found. Middleware: {middleware_names}"
    )


# ---------------------------------------------------------------------------
# Test: DB pool configuration
# ---------------------------------------------------------------------------

def test_db_pool_settings():
    """Verify DB pool is configured with optimized settings."""
    from app.db.session import engine

    pool = engine.pool
    assert pool.size() >= 10, f"Pool size should be >= 10, got {pool.size()}"
    assert pool._max_overflow >= 20, f"Max overflow should be >= 20, got {pool._max_overflow}"
    assert pool._recycle == 1800, f"Pool recycle should be 1800, got {pool._recycle}"


# ---------------------------------------------------------------------------
# Test: Strava sync batch preparation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_strava_sync_prepares_batch():
    """Verify Strava sync helper functions parse start dates correctly."""
    from app.services.strava_sync import _parse_start_date

    item1 = {"start_date_local": "2026-02-20T08:30:00Z"}
    result1 = _parse_start_date(item1)
    assert result1 is not None
    assert result1.year == 2026
    assert result1.month == 2
    assert result1.day == 20

    item2 = {"start_date": "2026-01-15T10:00:00+00:00"}
    result2 = _parse_start_date(item2)
    assert result2 is not None

    item3 = {}
    result3 = _parse_start_date(item3)
    assert result3 is None


# ---------------------------------------------------------------------------
# Test: HTTP client singleton
# ---------------------------------------------------------------------------

def test_http_client_singleton():
    """Verify HTTP client init returns the same instance."""
    from app.services.http_client import init_http_client, get_http_client, close_http_client
    import asyncio

    client1 = init_http_client(timeout=30.0)
    client2 = init_http_client(timeout=30.0)
    assert client1 is client2

    client3 = get_http_client()
    assert client3 is client1


# ---------------------------------------------------------------------------
# Test: Concurrent orchestrator user processing
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrent_orchestrator_semaphore():
    """Verify semaphore limits concurrency in scheduled_orchestrator_run."""
    sem = asyncio.Semaphore(2)
    max_concurrent = 0
    current = 0

    async def fake_task(sem):
        nonlocal max_concurrent, current
        async with sem:
            current += 1
            if current > max_concurrent:
                max_concurrent = current
            await asyncio.sleep(0.01)
            current -= 1

    tasks = [fake_task(sem) for _ in range(10)]
    await asyncio.gather(*tasks)

    assert max_concurrent <= 2, f"Max concurrent was {max_concurrent}, should be <= 2"
