from __future__ import annotations

from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    # From Strava (GET /athlete), overwritten on each fetch
    strava_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    strava_ftp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strava_firstname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    strava_lastname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    strava_profile_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    strava_sex: Mapped[str | None] = mapped_column(String(8), nullable=True)
    strava_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Manual overrides / fields not in Strava API (height, birth_year)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ftp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="athlete_profile")
