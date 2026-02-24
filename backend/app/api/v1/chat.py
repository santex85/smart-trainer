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
from app.models.chat_message import ChatMessage, MessageRole
from app.models.food_log import FoodLog
from app.models.sleep_extraction import SleepExtraction
from app.models.strava_activity import StravaActivity
from app.models.user import User
from app.models.wellness_cache import WellnessCache
from app.services.orchestrator import run_daily_decision

router = APIRouter(prefix="/chat", tags=["chat"])

CHAT_SYSTEM = """You are a sports coach. You have the following context about the athlete. Use it to give brief, practical advice. If context is empty for a section, say you don't have that data."""


async def _build_athlete_context(session: AsyncSession, user_id: int) -> str:
    """Build a text summary of athlete data: food today, wellness, load, recent Strava workouts."""
    today = date.today()

    # Food today
    r = await session.execute(
        select(FoodLog.calories, FoodLog.protein_g, FoodLog.fat_g, FoodLog.carbs_g).where(
            FoodLog.user_id == user_id,
            FoodLog.timestamp >= datetime.combine(today, datetime.min.time()),
            FoodLog.timestamp < datetime.combine(today + timedelta(days=1), datetime.min.time()),
        )
    )
    rows = r.all()
    food_sum = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0}
    for row in rows:
        food_sum["calories"] += row[0] or 0
        food_sum["protein_g"] += row[1] or 0
        food_sum["fat_g"] += row[2] or 0
        food_sum["carbs_g"] += row[3] or 0

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

    # Sleep extractions (from photos, last 30 days)
    sleep_from = today - timedelta(days=30)
    r = await session.execute(
        select(SleepExtraction.created_at, SleepExtraction.extracted_data).where(
            SleepExtraction.user_id == user_id,
            SleepExtraction.created_at >= datetime.combine(sleep_from, datetime.min.time()).replace(tzinfo=timezone.utc),
        ).order_by(SleepExtraction.created_at.desc()).limit(60)
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

    # Recent Strava activities (last 14 days)
    from_date = today - timedelta(days=14)
    r = await session.execute(
        select(StravaActivity.name, StravaActivity.start_date, StravaActivity.moving_time_sec, StravaActivity.distance_m, StravaActivity.suffer_score).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_date >= datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            StravaActivity.start_date < datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc),
        ).order_by(StravaActivity.start_date.desc()).limit(50)
    )
    activities = r.all()
    workouts = []
    for name, start_dt, moving_sec, dist_m, tss in activities:
        d = start_dt.date() if start_dt and hasattr(start_dt, "date") else None
        workouts.append({
            "date": d.isoformat() if d else None,
            "name": name,
            "moving_time_sec": moving_sec,
            "distance_km": round(dist_m / 1000, 1) if dist_m is not None else None,
            "tss": tss,
        })

    parts = [
        "## Food today (sum)",
        f"Calories: {food_sum['calories']:.0f}, Protein: {food_sum['protein_g']:.0f}g, Fat: {food_sum['fat_g']:.0f}g, Carbs: {food_sum['carbs_g']:.0f}g",
        "## Wellness today (sleep, RHR, HRV)",
        json.dumps(wellness_today or {}),
        "## Load (CTL/ATL/TSB)",
        json.dumps(ctl_atl_tsb or {}),
        "## Sleep (from photos, last 30 days)",
        sleep_summary,
        "## Recent workouts (Strava, last 14 days)",
        json.dumps(workouts, default=str),
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
        context = await _build_athlete_context(session, uid)
        genai.configure(api_key=settings.google_gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        prompt = f"{CHAT_SYSTEM}\n\nContext:\n{context}\n\nUser message: {body.message}"
        response = model.generate_content(prompt)
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


