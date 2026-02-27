from __future__ import annotations

from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    push_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    push_platform: Mapped[str | None] = mapped_column(String(32), nullable=True)

    food_logs: Mapped[list["FoodLog"]] = relationship("FoodLog", back_populates="user")
    wellness_cache: Mapped[list["WellnessCache"]] = relationship("WellnessCache", back_populates="user")
    chat_messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="user")
    chat_threads: Mapped[list["ChatThread"]] = relationship(
        "ChatThread", back_populates="user", cascade="all, delete-orphan"
    )
    intervals_credentials: Mapped["IntervalsCredentials | None"] = relationship(
        "IntervalsCredentials", back_populates="user", uselist=False
    )
    strava_credentials: Mapped["StravaCredentials | None"] = relationship(
        "StravaCredentials", back_populates="user", uselist=False
    )
    strava_activities: Mapped[list["StravaActivity"]] = relationship(
        "StravaActivity", back_populates="user", cascade="all, delete-orphan"
    )
    strava_sync_queue: Mapped[list["StravaSyncQueue"]] = relationship(
        "StravaSyncQueue", back_populates="user", cascade="all, delete-orphan"
    )
    sleep_extractions: Mapped[list["SleepExtraction"]] = relationship(
        "SleepExtraction", back_populates="user", cascade="all, delete-orphan"
    )
    athlete_profile: Mapped["AthleteProfile | None"] = relationship(
        "AthleteProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    workouts: Mapped[list["Workout"]] = relationship(
        "Workout", back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
