from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SleepExtraction(Base):
    __tablename__ = "sleep_extractions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    extracted_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string

    user: Mapped["User"] = relationship("User", back_populates="sleep_extractions")
