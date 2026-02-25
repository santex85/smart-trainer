"""Add indexes and uniqueness for context queries (food_log, chat_messages, sleep_extractions, strava_activities, wellness_cache).

Revision ID: 007
Revises: 006
Create Date: 2025-02-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_food_log_user_id_timestamp",
        "food_log",
        ["user_id", "timestamp"],
        unique=False,
    )
    op.create_index(
        "ix_chat_messages_user_id_timestamp",
        "chat_messages",
        ["user_id", "timestamp"],
        unique=False,
    )
    op.create_index(
        "ix_sleep_extractions_user_id_created_at",
        "sleep_extractions",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_strava_activities_user_id_start_date",
        "strava_activities",
        ["user_id", "start_date"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_wellness_cache_user_id_date",
        "wellness_cache",
        ["user_id", "date"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_wellness_cache_user_id_date", "wellness_cache", type_="unique")
    op.drop_index("ix_strava_activities_user_id_start_date", table_name="strava_activities")
    op.drop_index("ix_sleep_extractions_user_id_created_at", table_name="sleep_extractions")
    op.drop_index("ix_chat_messages_user_id_timestamp", table_name="chat_messages")
    op.drop_index("ix_food_log_user_id_timestamp", table_name="food_log")
