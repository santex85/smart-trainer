"""Pydantic schemas for Intervals.icu API request/response."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class WellnessDay(BaseModel):
    """Single day wellness data from Intervals.icu."""

    date: date
    sleep_hours: float | None = None
    rhr: float | None = None  # resting heart rate
    hrv: float | None = None
    ctl: float | None = None
    atl: float | None = None
    tsb: float | None = None
    weight_kg: float | None = None  # API field "weight", assumed kg
    sport_info: list[dict[str, Any]] | None = None  # Intervals sportInfo: [{type, eftp, wPrime, pMax}]
    raw: dict[str, Any] | None = None


class Activity(BaseModel):
    """Completed activity (workout) from Intervals.icu."""

    id: str
    name: str | None = None
    start_date: datetime | None = None
    icu_training_load: float | None = None  # TSS
    icu_ctl: float | None = None
    icu_atl: float | None = None
    raw: dict[str, Any] | None = None


class Event(BaseModel):
    """Planned workout (event) from Intervals.icu."""

    id: str
    start_date: datetime | None = None
    end_date: datetime | None = None
    title: str | None = None
    type: str | None = None
    raw: dict[str, Any] | None = None


class EventCreate(BaseModel):
    """Payload to create/update an event (workout plan)."""

    title: str
    start_date: datetime
    end_date: datetime | None = None
    type: str = "workout"
    description: str | None = None
    # Extend with Intervals.icu-specific fields as needed
    raw: dict[str, Any] | None = None
