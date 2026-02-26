"""Backfill wellness_cache.sleep_hours from sleep_extractions (unified sleep schema).

Revision ID: 013
Revises: 012
Create Date: 2025-02-23

"""
import json
from datetime import datetime
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_date(value: str) -> str | None:
    """Return ISO date YYYY-MM-DD or None if unparseable."""
    if not value:
        return None
    s = str(value).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            datetime.strptime(s[:10], "%Y-%m-%d")
            return s[:10]
        except ValueError:
            pass
    parts = s.replace("-", "/").split("/")
    if len(parts) >= 2:
        try:
            day = int(parts[0])
            month = int(parts[1])
            year = int(parts[2]) if len(parts) >= 3 else datetime.utcnow().year
            if 1 <= month <= 12 and 1 <= day <= 31 and 2000 <= year <= 2100:
                return f"{year:04d}-{month:02d}-{day:02d}"
        except (ValueError, IndexError):
            pass
    return None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, user_id, extracted_data FROM sleep_extractions")).fetchall()
    for row in rows:
        try:
            data = json.loads(row[2]) if isinstance(row[2], str) else row[2]
        except (json.JSONDecodeError, TypeError):
            continue
        date_str = _normalize_date(str(data.get("date") or ""))
        if not date_str:
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
