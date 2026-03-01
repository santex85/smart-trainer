"""Shared helpers for merging workout data (raw JSON) across sources."""


def merge_raw(existing: dict | None, incoming: dict | None) -> dict:
    """Deep merge incoming into existing; prefer non-null from incoming. Preserve existing 'series' if incoming has no series."""
    out = dict(existing or {})
    if not incoming:
        return out
    for k, v in incoming.items():
        if v is None:
            continue
        if k == "series" and isinstance(out.get(k), list):
            # Keep existing series if incoming doesn't have one (e.g. from Intervals)
            if isinstance(v, list) and v:
                out[k] = v
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge_raw(out[k], v)
        else:
            out[k] = v
    return out
