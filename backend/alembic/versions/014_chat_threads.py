"""Add chat_threads and thread_id to chat_messages.

Revision ID: 014
Revises: 013
Create Date: 2025-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_threads",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(128), nullable=False, server_default="Чат"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_threads_user_id", "chat_threads", ["user_id"])

    op.add_column("chat_messages", sa.Column("thread_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_chat_messages_thread_id_chat_threads",
        "chat_messages",
        "chat_threads",
        ["thread_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_chat_messages_thread_id", "chat_messages", ["thread_id"])
    op.create_index("ix_chat_messages_user_id_thread_id", "chat_messages", ["user_id", "thread_id"])

    # Backfill: one thread per user with existing messages, attach messages to it
    conn = op.get_bind()
    r = conn.execute(sa.text("SELECT DISTINCT user_id FROM chat_messages"))
    user_ids = [row[0] for row in r]
    for uid in user_ids:
        r2 = conn.execute(
            sa.text("INSERT INTO chat_threads (user_id, title) VALUES (:uid, 'Основной') RETURNING id"),
            {"uid": uid},
        )
        thread_row = r2.fetchone()
        if thread_row:
            thread_id = thread_row[0]
            conn.execute(sa.text("UPDATE chat_messages SET thread_id = :tid WHERE user_id = :uid"), {"tid": thread_id, "uid": uid})


def downgrade() -> None:
    op.drop_index("ix_chat_messages_user_id_thread_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_thread_id", table_name="chat_messages")
    op.drop_constraint("fk_chat_messages_thread_id_chat_threads", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "thread_id")
    op.drop_index("ix_chat_threads_user_id", table_name="chat_threads")
    op.drop_table("chat_threads")
