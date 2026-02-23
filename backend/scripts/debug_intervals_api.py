#!/usr/bin/env python3
"""One-off: call Intervals.icu API and print raw responses.
Usage: ATHLETE_ID=your_athlete_id API_KEY=your_key python scripts/debug_intervals_api.py"""
import asyncio
import json
import os
from datetime import date, timedelta

import httpx

BASE = "https://intervals.icu/api/v1"
ATHLETE_ID = os.environ.get("ATHLETE_ID", "")
API_KEY = os.environ.get("API_KEY", "")
AUTH = ("API_KEY", API_KEY) if API_KEY else None


async def main():
    if not AUTH or not API_KEY:
        print("Set API_KEY in environment")
        return
    if not ATHLETE_ID:
        print("Set ATHLETE_ID (your Intervals.icu athlete id) in environment")
        return
    to_date = date.today()
    from_date = to_date - timedelta(days=14)
    from_iso = from_date.isoformat()
    to_iso = to_date.isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1) Wellness
        print("=== GET /athlete/{}/wellness?oldest={}&newest={} ===".format(ATHLETE_ID, from_iso, to_iso))
        r = await client.get(
            f"{BASE}/athlete/{ATHLETE_ID}/wellness",
            params={"oldest": from_iso, "newest": to_iso},
            auth=AUTH,
        )
        print("Status:", r.status_code)
        if r.status_code == 200 and r.content:
            data = r.json()
            print("Keys in first item:", list(data[0].keys()) if isinstance(data, list) and data else "N/A")
            print(json.dumps(data[:3] if isinstance(data, list) and len(data) > 3 else data, indent=2, default=str))
        else:
            print(r.text[:500])
        print()

        # 2) Activities list (with fields)
        print("=== GET /athlete/{}/activities?oldest={}&newest={}&fields=... ===".format(ATHLETE_ID, from_iso, to_iso))
        r = await client.get(
            f"{BASE}/athlete/{ATHLETE_ID}/activities",
            params={
                "oldest": from_iso,
                "newest": to_iso,
                "limit": 5,
                "fields": "id,name,start_date_local,type,distance,moving_time,icu_training_load",
            },
            auth=AUTH,
        )
        print("Status:", r.status_code)
        if r.status_code == 200 and r.content:
            data = r.json()
            print("Keys in first item:", list(data[0].keys()) if isinstance(data, list) and data else "N/A")
            print(json.dumps(data, indent=2, default=str))
            first_id = data[0].get("id") if isinstance(data, list) and data else None
        else:
            print(r.text[:500])
            first_id = None
        print()

        # 3) Single activity (no fields param)
        if first_id:
            print("=== GET /activity/{} ===".format(first_id))
            r = await client.get(f"{BASE}/activity/{first_id}", auth=AUTH)
            print("Status:", r.status_code)
            if r.status_code == 200 and r.content:
                data = r.json()
                print("Top-level keys:", list(data.keys()))
                print(json.dumps(data, indent=2, default=str)[:3000])
            else:
                print(r.text[:500])


if __name__ == "__main__":
    asyncio.run(main())
