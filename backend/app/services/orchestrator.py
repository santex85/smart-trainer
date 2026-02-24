"""
AI Orchestrator: aggregates nutrition, wellness, load; applies 3-level hierarchy;
returns Go/Modify/Skip with optional modified plan. TZ: Level 1 (sleep, HRV, RHR, calories)
cannot be overridden by Level 2 (TSS, CTL, ATL). Level 3: polarised intensity (Seiler).
"""
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chat_message import ChatMessage, MessageRole
from app.models.food_log import FoodLog
from app.models.sleep_extraction import SleepExtraction
from app.models.wellness_cache import WellnessCache
from app.schemas.orchestrator import Decision, ModifiedPlanItem, OrchestratorResponse
from app.services.intervals_client import create_event, update_event
from app.services.crypto import decrypt_value
from app.models.intervals_credentials import IntervalsCredentials

GENERATION_CONFIG = {
    "temperature": 0.3,
    "max_output_tokens": 2048,
    "response_mime_type": "application/json",
}

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_PROMPT = """You are a sports physiologist coach. Your ONLY task is to decide whether the athlete should do the planned workout today: Go, Modify, or Skip. Output ONLY valid JSON.

Hierarchy (NEVER violate):
- Level 1 (primary): Readiness — sleep quality/duration, HRV, RHR, calorie/carb deficit from food log. If Level 1 is critical (e.g. very poor sleep + low carbs), you MUST block hard training (Modify or Skip). Level 2 cannot override Level 1.
- Level 2 (secondary): Training load math — TSS, CTL, ATL. Use to decide intensity, but never override Level 1.
- Level 3 (diagnostic): Prefer polarised distribution (Seiler); minimise grey zone (Zone 3); preserve quality in Zone 4+ when fresh.

Output format (strict JSON):
{
  "decision": "Go" | "Modify" | "Skip",
  "reason": "short explanation",
  "modified_plan": { "title": "...", "start_date": "ISO datetime", "end_date": "ISO or null", "description": "..." } or null,
  "suggestions_next_days": "optional text for next 7-14 days" or null
}
No metaphors, no long text. Only the JSON object."""


def _build_context(
    food_sum: dict[str, float],
    wellness_today: dict[str, Any] | None,
    events_today: list[dict],
    ctl_atl_tsb: dict[str, float] | None,
) -> str:
    parts = [
        "## Food today (sum)",
        f"Calories: {food_sum.get('calories', 0):.0f}, Protein: {food_sum.get('protein_g', 0):.0f}g, Fat: {food_sum.get('fat_g', 0):.0f}g, Carbs: {food_sum.get('carbs_g', 0):.0f}g",
        "## Wellness today",
        json.dumps(wellness_today or {}),
        "## Load (CTL/ATL/TSB)",
        json.dumps(ctl_atl_tsb or {}),
        "## Planned workouts today",
        json.dumps(events_today),
    ]
    return "\n".join(parts)


def _parse_llm_response(text: str) -> OrchestratorResponse:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    data = json.loads(text)
    decision = data.get("decision", "Go")
    if isinstance(decision, str):
        decision = Decision(decision) if decision in ("Go", "Modify", "Skip") else Decision.GO
    modified = data.get("modified_plan")
    if modified and isinstance(modified, dict):
        modified = ModifiedPlanItem(**modified)
    else:
        modified = None
    return OrchestratorResponse(
        decision=decision,
        reason=data.get("reason", ""),
        modified_plan=modified,
        suggestions_next_days=data.get("suggestions_next_days"),
    )


async def run_daily_decision(
    session: AsyncSession,
    user_id: int,
    today: date | None = None,
) -> OrchestratorResponse:
    """
    Aggregate context from food_log, wellness_cache, and Intervals events;
    call Gemini; return validated decision; on Modify/Skip optionally update
    Intervals and write to chat.
    """
    today = today or date.today()
    oldest_food = today
    newest_food = today

    # Food sum for today
    r = await session.execute(
        select(
            FoodLog.calories,
            FoodLog.protein_g,
            FoodLog.fat_g,
            FoodLog.carbs_g,
        ).where(
            FoodLog.user_id == user_id,
            FoodLog.timestamp >= datetime.combine(oldest_food, datetime.min.time()),
            FoodLog.timestamp < datetime.combine(newest_food + timedelta(days=1), datetime.min.time()),
        )
    )
    rows = r.all()
    food_sum = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0}
    for row in rows:
        food_sum["calories"] += row[0] or 0
        food_sum["protein_g"] += row[1] or 0
        food_sum["fat_g"] += row[2] or 0
        food_sum["carbs_g"] += row[3] or 0

    # Wellness today (from wellness_cache; if no sleep_hours, add from latest sleep_extraction)
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
        wellness_today = {
            "sleep_hours": w.sleep_hours,
            "rhr": w.rhr,
            "hrv": w.hrv,
        }
        ctl_atl_tsb = {"ctl": w.ctl, "atl": w.atl, "tsb": w.tsb}
    if wellness_today is None:
        wellness_today = {}
    if wellness_today.get("sleep_hours") is None:
        # Use latest sleep from photo extractions (last 3 days)
        from_dt = datetime.combine(today - timedelta(days=3), datetime.min.time()).replace(tzinfo=timezone.utc)
        r2 = await session.execute(
            select(SleepExtraction.extracted_data).where(
                SleepExtraction.user_id == user_id,
                SleepExtraction.created_at >= from_dt,
            ).order_by(SleepExtraction.created_at.desc()).limit(1)
        )
        row2 = r2.one_or_none()
        if row2:
            try:
                data = json.loads(row2[0]) if isinstance(row2[0], str) else row2[0]
                hours = data.get("actual_sleep_hours") or data.get("sleep_hours")
                if hours is not None:
                    wellness_today["sleep_hours"] = float(hours)
                    wellness_today["sleep_source"] = "photo"
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    # Events today: fetch from API (we need credentials)
    events_today: list[dict] = []
    r = await session.execute(select(IntervalsCredentials).where(IntervalsCredentials.user_id == user_id))
    creds = r.scalar_one_or_none()
    if creds:
        from app.services.intervals_client import get_events
        api_key = decrypt_value(creds.encrypted_token_or_key)
        if api_key:
            try:
                evs = await get_events(creds.athlete_id, api_key, today, today)
                events_today = [
                    {"id": e.id, "title": e.title, "start_date": e.start_date.isoformat() if e.start_date else None, "type": e.type}
                    for e in evs
                ]
            except Exception:
                pass

    context = _build_context(food_sum, wellness_today, events_today, ctl_atl_tsb)

    genai.configure(api_key=settings.google_gemini_api_key)
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config=GENERATION_CONFIG,
        safety_settings=SAFETY_SETTINGS,
    )
    response = model.generate_content([SYSTEM_PROMPT, "\n\nContext:\n" + context])
    if not response or not response.text:
        return OrchestratorResponse(decision=Decision.GO, reason="No AI response; defaulting to Go.")
    try:
        result = _parse_llm_response(response.text)
    except (json.JSONDecodeError, Exception):
        return OrchestratorResponse(decision=Decision.GO, reason="Parse error; defaulting to Go.")

    # On Modify: optionally push to Intervals and write to chat
    if result.decision in (Decision.MODIFY, Decision.SKIP) and result.reason:
        msg = f"Decision: {result.decision.value}. {result.reason}"
        if result.suggestions_next_days:
            msg += f"\n\nNext days: {result.suggestions_next_days}"
        session.add(
            ChatMessage(
                user_id=user_id,
                role=MessageRole.assistant.value,
                content=msg,
            )
        )
        api_key = decrypt_value(creds.encrypted_token_or_key) if creds else None
        if result.decision == Decision.MODIFY and result.modified_plan and creds and api_key:
            try:
                start = datetime.fromisoformat(result.modified_plan.start_date.replace("Z", "+00:00"))
                end = None
                if result.modified_plan.end_date:
                    end = datetime.fromisoformat(result.modified_plan.end_date.replace("Z", "+00:00"))
                await create_event(
                    creds.athlete_id,
                    api_key,
                    {
                        "title": result.modified_plan.title,
                        "start_date": start,
                        "end_date": end,
                        "description": result.modified_plan.description,
                        "type": result.modified_plan.type,
                    },
                )
            except Exception:
                pass  # log and leave plan unchanged

    return result
