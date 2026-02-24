from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class StravaActivity(Base):
    __tablename__ = "strava_activities"
    __table_args__ = (UniqueConstraint("user_id", "strava_id", name="uq_strava_activities_user_strava_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    strava_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    start_date_local: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    workout_type: Mapped[int | None] = mapped_column(Integer, nullable=True)
    moving_time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elapsed_time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_elevation_gain_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    elev_high_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    elev_low_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_speed_m_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_speed_m_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_heartrate: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_heartrate: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_watts: Mapped[float | None] = mapped_column(Float, nullable=True)
    kilojoules: Mapped[float | None] = mapped_column(Float, nullable=True)
    suffer_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    trainer: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    commute: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manual: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    private: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="strava_activities")
