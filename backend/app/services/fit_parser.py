"""Parse FIT files and extract session summary and optional time series for workout ingestion."""

import hashlib
import io
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Max series points to store (e.g. ~1 point per 2–5 sec for long activities)
MAX_SERIES_POINTS = 3600
# Target interval in seconds between sampled points when downsampling
SERIES_INTERVAL_SEC = 2


def _get_value(msg: Any, name: str):
    """Get raw value from fitparse message field, or None."""
    try:
        field = msg.get(name)
        if field is None:
            return None
        return field.value
    except Exception:
        return None


def _extract_series(fitfile: Any, start_time: datetime | None) -> list[dict] | None:
    """
    Extract record messages into a time series: elapsed_sec, power, speed, heart_rate.
    Downsample to at most MAX_SERIES_POINTS points, ~1 point per SERIES_INTERVAL_SEC.
    """
    records = list(fitfile.get_messages("record"))
    if not records:
        return None
    if start_time is None:
        start_time = _get_value(records[0], "timestamp")
    if start_time is None or not isinstance(start_time, datetime):
        return None
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    series: list[dict] = []
    last_elapsed = -SERIES_INTERVAL_SEC - 1
    for msg in records:
        ts = _get_value(msg, "timestamp")
        if ts is None:
            continue
        if isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        try:
            elapsed = int((ts - start_time).total_seconds())
        except (TypeError, ValueError):
            continue
        if elapsed < 0:
            continue
        # Downsample
        if elapsed - last_elapsed < SERIES_INTERVAL_SEC and len(series) > 0:
            continue
        if len(series) >= MAX_SERIES_POINTS:
            break
        power = _get_value(msg, "power")
        speed = _get_value(msg, "speed") or _get_value(msg, "enhanced_speed")
        if speed is not None and isinstance(speed, (int, float)):
            # FIT speed often in m/s; keep as-is or convert to km/h: * 3.6
            pass
        hr = _get_value(msg, "heart_rate")
        point: dict = {
            "elapsed_sec": elapsed,
            "power": int(power) if power is not None else None,
            "speed": round(float(speed), 2) if speed is not None else None,
            "heart_rate": int(hr) if hr is not None else None,
        }
        series.append(point)
        last_elapsed = elapsed
    return series if series else None


def parse_fit_session(file_content: bytes) -> dict | None:
    """
    Parse FIT file and return a single session summary suitable for Workout.
    Returns dict with: start_date (datetime), duration_sec, distance_m, avg_heart_rate,
    max_heart_rate, avg_power, total_calories (kJ), sport, raw (dict), or None on error.
    """
    try:
        from fitparse import FitFile
    except ImportError:
        logger.warning("fitparse not installed; FIT upload disabled")
        return None

    try:
        fitfile = FitFile(io.BytesIO(file_content))
        fitfile.parse()
    except Exception as e:
        logger.warning("FIT parse failed: %s", e)
        try:
            import sentry_sdk
            sentry_sdk.set_context("fit_parse", {"content_length": len(file_content)})
            sentry_sdk.capture_exception(e)
        except Exception:
            pass
        return None

    start_time = None
    duration_sec = None
    distance_m = None
    total_elapsed = None
    avg_hr = None
    max_hr = None
    avg_power = None
    normalized_power = None
    total_calories = None  # often in kJ in FIT
    sport = None

    for msg in fitfile.get_messages("session"):
        start_time = _get_value(msg, "start_time")
        if start_time is None:
            start_time = _get_value(msg, "timestamp")
        total_elapsed = _get_value(msg, "total_elapsed_time")
        total_timer = _get_value(msg, "total_timer_time")
        if total_elapsed is not None:
            duration_sec = int(total_elapsed)
        elif total_timer is not None and duration_sec is None:
            duration_sec = int(total_timer)
        dist = _get_value(msg, "total_distance")
        if dist is not None:
            distance_m = float(dist)
        avg_hr = _get_value(msg, "avg_heart_rate")
        max_hr = _get_value(msg, "max_heart_rate")
        avg_power = _get_value(msg, "avg_power")
        normalized_power = _get_value(msg, "normalized_power")
        total_calories = _get_value(msg, "total_calories")
        sport = _get_value(msg, "sport")
        break

    if start_time is None:
        for msg in fitfile.get_messages("activity"):
            start_time = _get_value(msg, "local_timestamp") or _get_value(msg, "timestamp")
            if start_time is not None:
                break
    if start_time is None:
        for msg in fitfile.get_messages("record"):
            start_time = _get_value(msg, "timestamp")
            if start_time is not None:
                break
    if start_time is None:
        logger.warning("FIT: no start_time found")
        return None

    if duration_sec is None and total_elapsed is not None:
        duration_sec = int(total_elapsed)
    if duration_sec is None:
        duration_sec = 0

    if isinstance(start_time, datetime) and start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)

    raw = {
        "avg_heart_rate": avg_hr,
        "max_heart_rate": max_hr,
        "avg_power": avg_power,
        "normalized_power": normalized_power,
        "total_calories": total_calories,
        "sport": str(sport) if sport is not None else None,
    }
    series = _extract_series(fitfile, start_time)
    if series:
        raw["series"] = series

    return {
        "start_date": start_time,
        "duration_sec": duration_sec,
        "distance_m": distance_m,
        "avg_heart_rate": avg_hr,
        "max_heart_rate": max_hr,
        "avg_power": avg_power,
        "normalized_power": normalized_power,
        "total_calories": total_calories,
        "sport": str(sport) if sport is not None else None,
        "raw": raw,
        "series": series,
    }
