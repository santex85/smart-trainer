"""Backfill wellness_cache.sleep_hours from sleep_extractions (unified sleep schema).

Revision ID: 013
Revises: 012
Create Date: 2025-02-23

"""
import json
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, user_id, extracted_data FROM sleep_extractions")).fetchall()
    for row in rows:
        try:
            data = json.loads(row[2]) if isinstance(row[2], str) else row[2]
        except (json.JSONDecodeError, TypeError):
            continue
        date_str = data.get("date")
        if not date_str:
            continue
        try:
            date_str = str(date_str)[:10]
        except (TypeError, ValueError):
            continue
        sh = data.get("actual_sleep_hours") if data.get("actual_sleep_hours") is not None else data.get("sleep_hours")
        if sh is None and data.get("sleep_minutes") is not None:
            sh = round(float(data["sleep_minutes"]) / 60.0, 2)
        if sh is None and data.get("actual_sleep_minutes") is not None:
            sh = round(float(data["actual_sleep_minutes"]) / 60.0, 2)
        if sh is None:
            continue
        try:
            sh = float(sh)
        except (TypeError, ValueError):
            continue
        conn.execute(
            text("""
            INSERT INTO wellness_cache (user_id, date, sleep_hours)
            VALUES (:uid, CAST(:d AS date), :sh)
            ON CONFLICT (user_id, date)
            DO UPDATE SET sleep_hours = COALESCE(wellness_cache.sleep_hours, EXCLUDED.sleep_hours)
            """),
            {"uid": row[1], "d": date_str, "sh": sh},
        )


def downgrade() -> None:
    pass
