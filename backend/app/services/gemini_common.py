"""
Shared helpers for Gemini: run blocking generate_content in threadpool to avoid blocking the event loop.
Timeout and optional retry for transient errors (429, 5xx).
"""
from __future__ import annotations

import asyncio
import logging
import re

from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)

# Retry up to 3 times with exponential backoff (1s, 2s, 4s) for these status patterns
RETRYABLE_STATUS_PATTERN = re.compile(r"\b(429|5\d{2})\b")


def _is_retryable_error(exc: BaseException) -> bool:
    """True if the exception looks like 429 or 5xx."""
    msg = (getattr(exc, "message", None) or str(exc)) if exc else ""
    return bool(RETRYABLE_STATUS_PATTERN.search(msg))


async def run_generate_content(model, contents):
    """
    Run model.generate_content(contents) in a thread pool with timeout.
    Retries with exponential backoff on 429/5xx-like errors.
    """
    timeout = getattr(settings, "gemini_request_timeout_seconds", 90) or 90
    max_attempts = 3
    last_exc = None
    for attempt in range(max_attempts):
        try:
            def _call():
                return model.generate_content(contents)
            return await asyncio.wait_for(
                run_in_threadpool(_call),
                timeout=float(timeout),
            )
        except asyncio.TimeoutError as e:
            logger.warning("Gemini request timed out after %ss (attempt %d)", timeout, attempt + 1)
            last_exc = e
            if attempt == max_attempts - 1:
                raise
            delay = 2 ** attempt
            await asyncio.sleep(delay)
        except Exception as e:
            last_exc = e
            if attempt < max_attempts - 1 and _is_retryable_error(e):
                delay = 2 ** attempt
                logger.warning("Gemini request failed (attempt %d), retrying in %ss: %s", attempt + 1, delay, e)
                await asyncio.sleep(delay)
            else:
                raise
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("run_generate_content: unexpected exit")
