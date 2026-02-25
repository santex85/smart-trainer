"""
Shared long-lived httpx.AsyncClient for Strava and Intervals.icu.
Initialized in app lifespan to avoid creating a new client per request.
"""
from __future__ import annotations

import httpx

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return the shared async HTTP client. Must be initialized via init_http_client() first."""
    if _http_client is None:
        raise RuntimeError("HTTP client not initialized; ensure app lifespan has run init_http_client().")
    return _http_client


def init_http_client(timeout: float = 30.0) -> httpx.AsyncClient:
    """Create and store the shared client. Call from app lifespan startup."""
    global _http_client
    if _http_client is not None:
        return _http_client
    _http_client = httpx.AsyncClient(timeout=timeout)
    return _http_client


async def close_http_client() -> None:
    """Close the shared client. Call from app lifespan shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
