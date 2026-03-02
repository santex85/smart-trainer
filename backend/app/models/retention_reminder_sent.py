"""Track sent retention reminders to avoid duplicate pushes per user per day."""

from __future__ import annotations

from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RetentionReminderSent(Base):
    __tablename__ = "retention_reminders_sent"
    __table_args__ = (
        UniqueConstraint("user_id", "date", "reminder_type", name="uq_retention_reminder_user_date_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reminder_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="retention_reminders_sent")
