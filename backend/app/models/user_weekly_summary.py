"""Weekly AI-generated summary of athlete state (training, sleep, nutrition) for RAG context."""

from __future__ import annotations

from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserWeeklySummary(Base):
    __tablename__ = "user_weekly_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "week_start_date", name="uq_user_weekly_summary_user_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="weekly_summaries")
