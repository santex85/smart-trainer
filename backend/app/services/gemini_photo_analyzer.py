"""
Single-call Gemini: classify image as food, sleep, or wellness (RHR/HRV) and return analysis in one round-trip.
"""
from __future__ import annotations

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from app.config import settings
from app.schemas.nutrition import NutritionAnalysisResult
from app.schemas.photo import WellnessPhotoResult
from app.schemas.sleep_extraction import SleepExtractionResult
from app.services.gemini_common import run_generate_content

# Reuse robust JSON parsing from sleep parser for the full response (trailing commas, truncation)
from app.services.gemini_sleep_parser import _parse_sleep_json

GENERATION_CONFIG = {
    "temperature": 0.2,
    "top_p": 0.95,
    "max_output_tokens": 4096,
    "response_mime_type": "application/json",
}

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_PROMPT = """You are an image analyzer. In ONE response you must:
1) Classify the image as "food", "sleep", or "wellness".
2) If food: fill "food" object; set "sleep" and "wellness" to null.
3) If sleep: fill "sleep" object; set "food" and "wellness" to null.
4) If wellness: fill "wellness" object with rhr and/or hrv; set "food" and "sleep" to null.

Classification:
- "food": a photo of a real meal, plate, or dish (actual food on a table/plate).
- "sleep": any screenshot, chart, or report from a sleep/health app showing sleep data (duration, stages, quality score, graphs, Oura/Garmin/Whoop/Apple Health/Fitbit, any UI with sleep hours or phases).
- "wellness": a screenshot or photo showing RHR (resting heart rate / пульс в покое) and/or HRV (heart rate variability), e.g. from Garmin Connect, Whoop, Oura, Apple Health, Fitbit, watch app, or any UI displaying these numbers.

Output ONLY a single JSON object with exactly these fields:
- type: string, either "food", "sleep", or "wellness"
- food: object or null (non-null only when type is "food")
- sleep: object or null (non-null only when type is "sleep")
- wellness: object or null (non-null only when type is "wellness"). When present: { "rhr": number or null, "hrv": number or null }. Extract the resting heart rate (bpm) and HRV (e.g. ms or score) from the image; use null if not visible.

When type is "food", set "food" to an object with exactly: name (short dish name), portion_grams, calories, protein_g, fat_g, carbs_g. All numbers non-negative. Set "sleep" and "wellness" to null.

When type is "sleep", set "sleep" to an object with optional fields (null for missing). Extract from sleep tracker screens. Do NOT round: use exact decimals. Fields: date, sleep_hours, sleep_minutes, actual_sleep_hours, actual_sleep_minutes, time_in_bed_min, quality_score, score_delta, efficiency_pct, rest_min, bedtime, wake_time, sleep_periods, deep_sleep_min, rem_min, light_sleep_min, awake_min, factor_ratings, sleep_phases, latency_min, awakenings, source_app, raw_notes. Set "food" and "wellness" to null.

When type is "wellness", set "wellness" to { "rhr": <number or null>, "hrv": <number or null> }. Extract only visible values. Set "food" and "sleep" to null.

Output ONLY valid JSON. No markdown, no code fences."""


async def classify_and_analyze_image(
    image_bytes: bytes,
) -> tuple[str, NutritionAnalysisResult | SleepExtractionResult | WellnessPhotoResult]:
    """
    Single Gemini call: classify image as food, sleep, or wellness and return the analysis.
    Returns ("food", NutritionAnalysisResult), ("sleep", SleepExtractionResult), or ("wellness", WellnessPhotoResult).
    """
    if not settings.google_gemini_api_key:
        raise ValueError("GOOGLE_GEMINI_API_KEY is not set")
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config=GENERATION_CONFIG,
        safety_settings=SAFETY_SETTINGS,
    )
    part = {"mime_type": "image/jpeg", "data": image_bytes}
    contents = [SYSTEM_PROMPT, part]
    response = await run_generate_content(model, contents)
    if not response or not response.text:
        raise ValueError("Empty response from Gemini")
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    data = _parse_sleep_json(text)

    kind = (data.get("type") or "food").strip().lower()
    if kind not in ("food", "sleep", "wellness"):
        kind = "food"

    if kind == "food":
        food_payload = data.get("food")
        if not food_payload or not isinstance(food_payload, dict):
            raise ValueError("Model returned type 'food' but food object is missing or invalid")
        return "food", NutritionAnalysisResult(**food_payload)

    if kind == "wellness":
        wellness_payload = data.get("wellness")
        if not wellness_payload or not isinstance(wellness_payload, dict):
            raise ValueError("Model returned type 'wellness' but wellness object is missing or invalid")
        rhr = wellness_payload.get("rhr")
        hrv = wellness_payload.get("hrv")
        if isinstance(rhr, (int, float)):
            rhr = int(rhr)
        else:
            rhr = None
        if isinstance(hrv, (int, float)):
            hrv = float(hrv)
        else:
            hrv = None
        return "wellness", WellnessPhotoResult(rhr=rhr, hrv=hrv)

    # kind == "sleep"
    sleep_payload = data.get("sleep")
    if not sleep_payload or not isinstance(sleep_payload, dict):
        raise ValueError("Model returned type 'sleep' but sleep object is missing or invalid")
    return "sleep", SleepExtractionResult(**sleep_payload)
