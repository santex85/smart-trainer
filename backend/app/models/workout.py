"""Unified workout: manual entry or FIT import. Used for load (CTL/ATL/TSB) and orchestrator context."""

from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)  # e.g. Run, Ride, Swim
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    tss: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")  # manual | fit | intervals
    external_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # Intervals.icu activity id
    fit_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # for FIT dedup
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="workouts")
