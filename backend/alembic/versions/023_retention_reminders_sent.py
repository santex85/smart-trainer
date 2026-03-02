"""Add retention_reminders_sent table for idempotent retention push tracking.

Revision ID: 023
Revises: 022
Create Date: 2025-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "retention_reminders_sent",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("reminder_type", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", "reminder_type", name="uq_retention_reminder_user_date_type"),
    )
    op.create_index("ix_retention_reminders_sent_user_id", "retention_reminders_sent", ["user_id"], unique=False)
    op.create_index("ix_retention_reminders_sent_date", "retention_reminders_sent", ["date"], unique=False)
    op.create_index("ix_retention_reminders_sent_reminder_type", "retention_reminders_sent", ["reminder_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_retention_reminders_sent_reminder_type", table_name="retention_reminders_sent")
    op.drop_index("ix_retention_reminders_sent_date", table_name="retention_reminders_sent")
    op.drop_index("ix_retention_reminders_sent_user_id", table_name="retention_reminders_sent")
    op.drop_table("retention_reminders_sent")
