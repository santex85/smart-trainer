"""FIT workout processing: TSS estimation, summary, save from FIT with deduplication."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.models.workout import Workout

# Default TSS per hour when no power (by sport)
DEFAULT_TSS_PER_HOUR: dict[str, float] = {
    "running": 60.0,
    "cycling": 55.0,
    "swimming": 65.0,
    "generic": 50.0,
}
DEFAULT_TSS_PER_HOUR_FALLBACK = 50.0


def estimate_tss_from_fit(
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


def fit_data_to_summary(data: dict) -> str:
    """Build a short text summary of parsed FIT session for AI context."""
    parts = []
    start = data.get("start_date")
    if start:
        parts.append(f"Date/time: {start}")
    if data.get("duration_sec"):
        m = data["duration_sec"] // 60
        parts.append(f"Duration: {m} min")
    if data.get("distance_m"):
        parts.append(f"Distance: {data['distance_m'] / 1000:.1f} km")
    if data.get("sport"):
        parts.append(f"Sport: {data['sport']}")
    if data.get("avg_heart_rate") is not None:
        parts.append(f"Avg HR: {data['avg_heart_rate']} bpm")
    if data.get("max_heart_rate") is not None:
        parts.append(f"Max HR: {data['max_heart_rate']} bpm")
    if data.get("avg_power") is not None:
        parts.append(f"Avg power: {data['avg_power']} W")
    if data.get("normalized_power") is not None:
        parts.append(f"NP: {data['normalized_power']} W")
    if data.get("total_calories") is not None:
        parts.append(f"Calories: {data['total_calories']}")
    return "; ".join(parts) if parts else "No session data"


async def save_workout_from_fit(
    session: AsyncSession,
    user_id: int,
    fit_data: dict,
    content: bytes,
) -> Workout | None:
    """
    Save workout from FIT data. Deduplicates by checksum.
    Returns the created Workout, or None if already exists (deduplicated).
    """
    checksum = hashlib.sha256(content).hexdigest()
    r = await session.execute(select(Workout).where(Workout.user_id == user_id, Workout.fit_checksum == checksum))
    if r.scalar_one_or_none() is not None:
        return None

    r2 = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == user_id))
    profile = r2.scalar_one_or_none()
    ftp = None
    if profile and profile.ftp is not None:
        ftp = float(profile.ftp)

    start_date = fit_data["start_date"]
    if isinstance(start_date, datetime) and start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)

    duration_sec = fit_data.get("duration_sec") or 0
    tss = estimate_tss_from_fit(
        duration_sec,
        fit_data.get("avg_power"),
        fit_data.get("normalized_power"),
        ftp,
        fit_data.get("sport"),
    )
    sport_name = (fit_data.get("sport") or "Workout").capitalize()
    w = Workout(
        user_id=user_id,
        start_date=start_date,
        name=sport_name,
        type=sport_name,
        duration_sec=duration_sec or None,
        distance_m=fit_data.get("distance_m"),
        tss=tss if tss > 0 else None,
        source="fit",
        fit_checksum=checksum,
        raw=fit_data.get("raw"),
    )
    session.add(w)
    return w
