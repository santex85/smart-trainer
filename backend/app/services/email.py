"""Resend email: password reset, service notifications."""

import logging
from typing import Sequence

from app.config import settings
from app.services.http_client import get_http_client

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(
    to: str | Sequence[str],
    subject: str,
    html: str,
    text: str | None = None,
) -> None:
    """Send email via Resend API. Fire-and-forget; logs errors."""
    if not settings.resend_api_key or not settings.resend_api_key.strip():
        logger.debug("Resend: skipping send (RESEND_API_KEY not configured)")
        return
    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        logger.debug("Resend: skipping send (no recipients)")
        return
    payload: dict = {
        "from": settings.mail_from,
        "to": recipients,
        "subject": (subject or "").strip() or "Notification",
        "html": (html or "").strip() or "<p></p>",
    }
    if text is not None and text.strip():
        payload["text"] = text.strip()
    try:
        client = get_http_client()
        resp = await client.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key.strip()}"},
            json=payload,
        )
        if resp.status_code >= 400:
            logger.warning("Resend send failed: %s %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("Resend send failed: %s", e)


async def send_password_reset(to: str, reset_link: str) -> None:
    """Send password reset email with link."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <p>You requested a password reset. Click the link below to set a new password:</p>
  <p><a href="{reset_link}" style="color: #0066cc;">Reset password</a></p>
  <p>If you didn't request this, you can ignore this email. The link expires in 1 hour.</p>
</body>
</html>
""".strip()
    text = f"You requested a password reset. Open this link to set a new password:\n{reset_link}\n\nIf you didn't request this, ignore this email. The link expires in 1 hour."
    await send_email(to, "Reset your password", html, text=text)


async def send_service_notification(to: str, subject: str, body: str) -> None:
    """Send a service/administrative notification."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <p>{body.replace(chr(10), '<br>')}</p>
</body>
</html>
""".strip()
    await send_email(to, subject, html, text=body)
