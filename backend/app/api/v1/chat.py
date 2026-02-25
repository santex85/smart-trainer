"""Chat with AI coach: history, send message, optional orchestrator run."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete_profile import AthleteProfile
from app.models.chat_message import ChatMessage, MessageRole
from app.models.food_log import FoodLog
from app.models.sleep_extraction import SleepExtraction
from app.models.strava_activity import StravaActivity
from app.models.user import User
from app.models.wellness_cache import WellnessCache
from app.services.orchestrator import run_daily_decision

router = APIRouter(prefix="/chat", tags=["chat"])

CHAT_SYSTEM = """You are a sports coach. You have the following context about the athlete. Use it to give brief, practical advice.
- Reply in 3–6 short bullets. If a section has no data, say "No data" for that topic; never invent numbers.
- Only use numbers that appear in the context; if context is empty for a section, say you don't have that data."""


# Context limits: last N days, last M workouts, max chars per section to keep prompts smaller
CHAT_CONTEXT_DAYS = 7
CHAT_WORKOUTS_LIMIT = 10
CHAT_SECTION_MAX_CHARS = 1200


async def _build_athlete_context(session: AsyncSession, user_id: int) -> str:
    """Build a compressed text summary: profile, food/wellness today + last N days, last M workouts. No passwords/tokens."""
    today = date.today()

    # Athlete profile (weight, height, age, ftp, display_name, sex) — no tokens
    r_user = await session.execute(select(User.email).where(User.id == user_id))
    user_row = r_user.one_or_none()
    email = user_row[0] if user_row else None
    r_prof = await session.execute(select(AthleteProfile).where(AthleteProfile.user_id == user_id))
    profile = r_prof.scalar_one_or_none()
    athlete = {}
    if profile:
        if profile.weight_kg is not None:
            athlete["weight_kg"] = float(profile.weight_kg)
        elif profile.strava_weight_kg is not None:
            athlete["weight_kg"] = float(profile.strava_weight_kg)
        if profile.height_cm is not None:
            athlete["height_cm"] = float(profile.height_cm)
        if profile.birth_year is not None:
            athlete["birth_year"] = profile.birth_year
            athlete["age_years"] = today.year - profile.birth_year
        if profile.ftp is not None:
            athlete["ftp"] = profile.ftp
        elif profile.strava_ftp is not None:
            athlete["ftp"] = profile.strava_ftp
        if profile.strava_firstname or profile.strava_lastname:
            athlete["display_name"] = " ".join(filter(None, [profile.strava_firstname, profile.strava_lastname])).strip()
        if profile.strava_sex:
            athlete["sex"] = profile.strava_sex
    if not athlete.get("display_name") and email:
        athlete["display_name"] = email

    # Food today (sum and entries)
    r = await session.execute(
        select(FoodLog.name, FoodLog.portion_grams, FoodLog.calories, FoodLog.protein_g, FoodLog.fat_g, FoodLog.carbs_g, FoodLog.meal_type, FoodLog.timestamp).where(
            FoodLog.user_id == user_id,
            FoodLog.timestamp >= datetime.combine(today, datetime.min.time()),
            FoodLog.timestamp < datetime.combine(today + timedelta(days=1), datetime.min.time()),
        )
    )
    rows = r.all()
    food_sum = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0}
    food_entries = []
    for row in rows:
        food_sum["calories"] += row[2] or 0
        food_sum["protein_g"] += row[3] or 0
        food_sum["fat_g"] += row[4] or 0
        food_sum["carbs_g"] += row[5] or 0
        food_entries.append({
            "name": row[0], "portion_grams": row[1], "calories": row[2], "protein_g": row[3], "fat_g": row[4], "carbs_g": row[5],
            "meal_type": row[6], "timestamp": row[7].isoformat() if row[7] else None,
        })

    # Wellness today (sleep, RHR, HRV) and load (CTL/ATL/TSB)
    r = await session.execute(
        select(WellnessCache).where(
            WellnessCache.user_id == user_id,
            WellnessCache.date == today,
        )
    )
    w = r.scalar_one_or_none()
    wellness_today = None
    ctl_atl_tsb = None
    if w:
        wellness_today = {"sleep_hours": w.sleep_hours, "rhr": w.rhr, "hrv": w.hrv}
        ctl_atl_tsb = {"ctl": w.ctl, "atl": w.atl, "tsb": w.tsb}
    if wellness_today is None:
        wellness_today = {}
    if wellness_today.get("sleep_hours") is None:
        # Enrich with sleep from latest photo extraction so "Wellness today" shows sleep when only from photos
        sleep_from = today - timedelta(days=3)
        r_w = await session.execute(
            select(SleepExtraction.extracted_data).where(
                SleepExtraction.user_id == user_id,
                SleepExtraction.created_at >= datetime.combine(sleep_from, datetime.min.time()).replace(tzinfo=timezone.utc),
            ).order_by(SleepExtraction.created_at.desc()).limit(1)
        )
        row_w = r_w.one_or_none()
        if row_w:
            try:
                data = json.loads(row_w[0]) if isinstance(row_w[0], str) else row_w[0]
                hours = data.get("actual_sleep_hours") or data.get("sleep_hours")
                if hours is not None:
                    wellness_today["sleep_hours"] = float(hours)
                    wellness_today["sleep_source"] = "photo"
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    # Sleep extractions (from photos, last N days only)
    sleep_from = today - timedelta(days=CHAT_CONTEXT_DAYS)
    r = await session.execute(
        select(SleepExtraction.created_at, SleepExtraction.extracted_data).where(
            SleepExtraction.user_id == user_id,
            SleepExtraction.created_at >= datetime.combine(sleep_from, datetime.min.time()).replace(tzinfo=timezone.utc),
        ).order_by(SleepExtraction.created_at.desc()).limit(20)
    )
    sleep_entries = []
    for created_at, data_json in r.all():
        try:
            data = json.loads(data_json) if isinstance(data_json, str) else data_json
        except (json.JSONDecodeError, TypeError):
            continue
        created_date = created_at.date() if created_at and hasattr(created_at, "date") else None
        sleep_entries.append({
            "date": created_date.isoformat() if created_date else None,
            "recorded_at": created_at.isoformat() if created_at else None,
            "sleep_date": data.get("date"),
            "sleep_hours": data.get("sleep_hours"),
            "actual_sleep_hours": data.get("actual_sleep_hours"),
            "quality_score": data.get("quality_score"),
            "deep_sleep_min": data.get("deep_sleep_min"),
            "rem_min": data.get("rem_min"),
        })
    sleep_summary = json.dumps(sleep_entries, default=str) if sleep_entries else "No sleep data from photos."

    # Wellness history (last N days)
    wellness_from = today - timedelta(days=CHAT_CONTEXT_DAYS)
    r_well = await session.execute(
        select(WellnessCache.date, WellnessCache.sleep_hours, WellnessCache.rhr, WellnessCache.hrv, WellnessCache.ctl, WellnessCache.atl, WellnessCache.tsb).where(
            WellnessCache.user_id == user_id,
            WellnessCache.date >= wellness_from,
            WellnessCache.date <= today,
        ).order_by(WellnessCache.date.asc())
    )
    wellness_history = []
    for row in r_well.all():
        wellness_history.append({
            "date": row[0].isoformat() if row[0] else None,
            "sleep_hours": row[1], "rhr": row[2], "hrv": row[3], "ctl": row[4], "atl": row[5], "tsb": row[6],
        })

    # Recent Strava activities (last N days, capped count)
    from_date = today - timedelta(days=CHAT_CONTEXT_DAYS)
    r = await session.execute(
        select(
            StravaActivity.name, StravaActivity.start_date, StravaActivity.type, StravaActivity.sport_type,
            StravaActivity.moving_time_sec, StravaActivity.elapsed_time_sec, StravaActivity.distance_m,
            StravaActivity.total_elevation_gain_m, StravaActivity.average_heartrate, StravaActivity.max_heartrate,
            StravaActivity.average_watts, StravaActivity.suffer_score,
        ).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_date >= datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            StravaActivity.start_date < datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc),
        ).order_by(StravaActivity.start_date.desc()).limit(CHAT_WORKOUTS_LIMIT)
    )
    activities = r.all()
    workouts = []
    for row in activities:
        name, start_dt, act_type, sport_type, moving_sec, elapsed_sec, dist_m, elev_m, avg_hr, max_hr, avg_watts, tss = row
        d = start_dt.date() if start_dt and hasattr(start_dt, "date") else None
        workouts.append({
            "date": d.isoformat() if d else None,
            "name": name,
            "type": act_type,
            "sport_type": sport_type,
            "moving_time_sec": moving_sec,
            "elapsed_time_sec": elapsed_sec,
            "distance_km": round(dist_m / 1000, 1) if dist_m is not None else None,
            "elevation_gain_m": round(elev_m, 0) if elev_m is not None else None,
            "average_heartrate": avg_hr,
            "max_heartrate": max_hr,
            "average_watts": avg_watts,
            "tss": tss,
        })

    def _cap(s: str, limit: int = CHAT_SECTION_MAX_CHARS) -> str:
        s = s.strip()
        return s if len(s) <= limit else s[: limit - 3] + "..."

    parts = [
        "## Athlete profile (weight, height, age, FTP, name, sex)",
        _cap(json.dumps(athlete, default=str)),
        "## Food today (sum)",
        f"Calories: {food_sum['calories']:.0f}, Protein: {food_sum['protein_g']:.0f}g, Fat: {food_sum['fat_g']:.0f}g, Carbs: {food_sum['carbs_g']:.0f}g",
        "## Food today (entries)",
        _cap(json.dumps(food_entries, default=str)),
        "## Wellness today (sleep, RHR, HRV)",
        _cap(json.dumps(wellness_today or {})),
        "## Load (CTL/ATL/TSB)",
        _cap(json.dumps(ctl_atl_tsb or {})),
        "## Wellness history (last %d days)" % CHAT_CONTEXT_DAYS,
        _cap(json.dumps(wellness_history, default=str)),
        "## Sleep (from photos, last %d days)" % CHAT_CONTEXT_DAYS,
        _cap(sleep_summary),
        "## Recent workouts (Strava, last %d)" % CHAT_WORKOUTS_LIMIT,
        _cap(json.dumps(workouts, default=str)),
    ]
    return "\n".join(parts)


class SendMessageBody(BaseModel):
    message: str
    run_orchestrator: bool = False  # if True, run daily decision and include in context


@router.get("/history")
async def get_history(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
) -> list[dict]:
    """Return recent chat messages (user + assistant)."""
    uid = user.id
    r = await session.execute(
        select(ChatMessage).where(ChatMessage.user_id == uid).order_by(ChatMessage.timestamp.desc()).limit(limit)
    )
    rows = r.scalars().all()
    return [
        {"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat() if m.timestamp else None}
        for m in reversed(rows)
    ]


@router.post("/send", response_model=dict)
async def send_message(
    session: Annotated[AsyncSession, Depends(get_db)],
    body: SendMessageBody,
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Append user message, optionally run orchestrator, then get AI reply and return it."""
    uid = user.id
    session.add(
        ChatMessage(user_id=uid, role=MessageRole.user.value, content=body.message)
    )
    await session.flush()

    reply = ""
    if body.run_orchestrator:
        result = await run_daily_decision(session, uid, date.today())
        reply = f"Decision: {result.decision.value}. {result.reason}"
        if result.suggestions_next_days:
            reply += f"\n\n{result.suggestions_next_days}"
    else:
        # Coach LLM with athlete context (nutrition, wellness, load, recent Strava workouts)
        import google.generativeai as genai
        from app.config import settings
        from app.services.gemini_common import run_generate_content
        context = await _build_athlete_context(session, uid)
        genai.configure(api_key=settings.google_gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        prompt = f"{CHAT_SYSTEM}\n\nContext:\n{context}\n\nUser message: {body.message}"
        response = await run_generate_content(model, prompt)
        reply = response.text if response and response.text else "No response."

    session.add(
        ChatMessage(user_id=uid, role=MessageRole.assistant.value, content=reply)
    )
    await session.commit()
    return {"reply": reply}


@router.post("/orchestrator/run", response_model=dict)
async def run_orchestrator(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    for_date: date | None = None,
) -> dict:
    """Run daily decision (Go/Modify/Skip) for today and return result. May update Intervals and add chat message."""
    uid = user.id
    result = await run_daily_decision(session, uid, for_date or date.today())
    await session.commit()
    return {
        "decision": result.decision.value,
        "reason": result.reason,
        "modified_plan": result.modified_plan.model_dump() if result.modified_plan else None,
        "suggestions_next_days": result.suggestions_next_days,
    }


