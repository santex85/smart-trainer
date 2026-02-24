"""
Single-call Gemini: classify image as food or sleep and return analysis in one round-trip.
"""
from __future__ import annotations

import json

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from app.config import settings
from app.schemas.nutrition import NutritionAnalysisResult
from app.schemas.sleep_extraction import SleepExtractionResult

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
1) Classify the image as either "food" or "sleep".
2) If food: analyze the meal and fill the "food" object; leave "sleep" null.
3) If sleep: extract sleep data and fill the "sleep" object; leave "food" null.

Classification:
- "food": a photo of a real meal, plate, or dish (actual food on a table/plate).
- "sleep": any screenshot, chart, or report from a sleep/health app showing sleep data (duration, stages, quality score, graphs, Oura/Garmin/Whoop/Apple Health/Fitbit, any UI with sleep hours or phases).

Output ONLY a single JSON object with exactly these three fields:
- type: string, either "food" or "sleep"
- food: object or null (see below; non-null only when type is "food")
- sleep: object or null (see below; non-null only when type is "sleep")

When type is "food", set "food" to an object with exactly: name (short dish name), portion_grams, calories, protein_g, fat_g, carbs_g. All numbers non-negative. Estimate dish density, hidden ingredients (oils, sauces), portion volume. No explanations. Set "sleep" to null.

When type is "sleep", set "sleep" to an object with optional fields (null for missing). Extract from sleep tracker screens (any language, e.g. Сон, Фазы сна, Факторы влияющие на показатели сна). Do NOT round: use exact decimals (7h 54m = 7.9). Fields:
- date (YYYY-MM-DD), sleep_hours, sleep_minutes, actual_sleep_hours, actual_sleep_minutes, time_in_bed_min
- quality_score (0-100), score_delta, efficiency_pct, rest_min
- bedtime, wake_time (HH:MM), sleep_periods (array of strings like "22:47 - 04:23")
- deep_sleep_min, rem_min, light_sleep_min, awake_min (minutes; estimate from "Фазы сна" graph if needed)
- factor_ratings: object with keys actual_sleep_time, deep_sleep, rem_sleep, rest, latency; values exact labels from image (e.g. "Внимание", "Удовлетворительно", "Хорошо", "Отлично")
- sleep_phases: array of {"start":"HH:MM","end":"HH:MM","phase":"deep"|"rem"|"light"|"awake"}
- latency_min, awakenings, source_app, raw_notes
Set "food" to null.

Output ONLY valid JSON. No markdown, no code fences."""


def _configure_genai() -> None:
    if not settings.google_gemini_api_key:
        raise ValueError("GOOGLE_GEMINI_API_KEY is not set")
    genai.configure(api_key=settings.google_gemini_api_key)


def classify_and_analyze_image(
    image_bytes: bytes,
) -> tuple[str, NutritionAnalysisResult | SleepExtractionResult]:
    """
    Single Gemini call: classify image as food or sleep and return the analysis.
    Returns ("food", NutritionAnalysisResult) or ("sleep", SleepExtractionResult).
    """
    _configure_genai()
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config=GENERATION_CONFIG,
        safety_settings=SAFETY_SETTINGS,
    )
    part = {"mime_type": "image/jpeg", "data": image_bytes}
    contents = [SYSTEM_PROMPT, part]
    response = model.generate_content(contents)
    if not response or not response.text:
        raise ValueError("Empty response from Gemini")
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    data = _parse_sleep_json(text)

    kind = (data.get("type") or "food").strip().lower()
    if kind not in ("food", "sleep"):
        kind = "food"

    if kind == "food":
        food_payload = data.get("food")
        if not food_payload or not isinstance(food_payload, dict):
            raise ValueError("Model returned type 'food' but food object is missing or invalid")
        return "food", NutritionAnalysisResult(**food_payload)

    # kind == "sleep"
    sleep_payload = data.get("sleep")
    if not sleep_payload or not isinstance(sleep_payload, dict):
        raise ValueError("Model returned type 'sleep' but sleep object is missing or invalid")
    return "sleep", SleepExtractionResult(**sleep_payload)
