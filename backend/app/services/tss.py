"""
Custom TSS (Training Stress Score) from Strava data.
Uses power when available and FTP, else suffer_score, else duration/type estimate.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.strava_activity import StravaActivity

# Default TSS per hour when no power and no suffer_score (by activity type)
DEFAULT_TSS_PER_HOUR: dict[str, float] = {
    "Run": 60.0,
    "Ride": 55.0,
    "VirtualRide": 55.0,
    "Swim": 65.0,
    "Walk": 35.0,
    "Hike": 40.0,
    "Other": 50.0,
}
DEFAULT_TSS_PER_HOUR_FALLBACK = 50.0


def compute_activity_tss(
    activity: StravaActivity,
    effective_ftp: float | None,
) -> float:
    """
    Compute TSS for one activity.
    Priority: 1) power + FTP, 2) suffer_score, 3) duration/type estimate.
    """
    duration_sec = activity.moving_time_sec or 0
    if duration_sec <= 0:
        return 0.0

    raw = activity.raw or {}
    # 1) Power-based TSS (cycling): NP and FTP
    np_watts = raw.get("weighted_average_watts") or raw.get("average_watts")
    if np_watts is not None and effective_ftp is not None and effective_ftp > 0:
        try:
            np_val = float(np_watts)
            ftp_val = float(effective_ftp)
            if np_val > 0 and ftp_val > 0:
                # TSS = (t * NP^2) / (FTP^2 * 36), t in seconds (Coggan/Allen)
                tss = (duration_sec * np_val * np_val) / (ftp_val * ftp_val * 36.0)
                return round(tss, 1)
        except (TypeError, ValueError):
            pass

    # 2) Strava suffer_score (Relative Effort)
    if activity.suffer_score is not None:
        try:
            return float(activity.suffer_score)
        except (TypeError, ValueError):
            pass

    # 3) Estimate from duration and type
    act_type = (activity.type or "Other").strip() or "Other"
    tss_per_hour = DEFAULT_TSS_PER_HOUR.get(act_type, DEFAULT_TSS_PER_HOUR_FALLBACK)
    hours = duration_sec / 3600.0
    return round(hours * tss_per_hour, 1)
