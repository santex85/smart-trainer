"""Pydantic schemas for workout API (manual and FIT)."""

from datetime import datetime

from pydantic import BaseModel, Field


class WorkoutCreate(BaseModel):
    """Body for creating a workout (manual entry)."""

    start_date: datetime
    name: str | None = None
    type: str | None = Field(None, max_length=64)
    duration_sec: int | None = Field(None, ge=0)
    distance_m: float | None = Field(None, ge=0)
    tss: float | None = Field(None, ge=0)
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    """Body for updating a workout (partial)."""

    start_date: datetime | None = None
    name: str | None = None
    type: str | None = Field(None, max_length=64)
    duration_sec: int | None = Field(None, ge=0)
    distance_m: float | None = Field(None, ge=0)
    tss: float | None = Field(None, ge=0)
    notes: str | None = None


class WorkoutResponse(BaseModel):
    """Single workout as returned by the API."""

    id: int
    start_date: str
    name: str | None
    type: str | None
    duration_sec: int | None
    distance_m: float | None
    tss: float | None
    source: str
    notes: str | None
