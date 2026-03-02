"""Expo Push Notifications: send to devices via Expo push API."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.http_client import get_http_client

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(token: str, title: str, body: str) -> None:
    """Send a push notification via Expo. Fire-and-forget; logs errors."""
    if not token or not token.strip():
        return
    token = token.strip()
    title = (title or "Smart Trainer").strip() or "Smart Trainer"
    body = (body or "").strip()[:200]
    try:
        client = get_http_client()
        await client.post(
            EXPO_PUSH_URL,
            json={
                "to": token,
                "title": title[:100],
                "body": body,
            },
        )
    except Exception as e:
        logger.warning("Expo push send failed: %s", e)


async def send_push_to_user(
    session: AsyncSession,
    user_id: int,
    title: str,
    body: str,
) -> None:
    """Load user's push token and send notification if present."""
    if not (title or "").strip():
        logger.debug("send_push_to_user: skipping empty title for user_id=%s", user_id)
        return
    r = await session.execute(select(User.push_token).where(User.id == user_id))
    row = r.one_or_none()
    if row and row[0]:
        await send_expo_push(row[0], title, body)
        logger.debug("Push sent to user_id=%s", user_id)
    else:
        logger.debug("Push skipped for user_id=%s (no token)", user_id)
