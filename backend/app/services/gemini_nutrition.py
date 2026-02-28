"""
Gemini-based visual food analysis with Structured Output (JSON).
TZ: prevent data retention for training; output only JSON.
"""
import json

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from app.config import settings
from app.schemas.nutrition import NutritionAnalysisResult
from app.services.gemini_common import run_generate_content

GENERATION_CONFIG = {
    "temperature": 0.2,
    "top_p": 0.95,
    "max_output_tokens": 1024,
    "response_mime_type": "application/json",
}

GENERATION_CONFIG_EXTENDED = {
    "temperature": 0.2,
    "top_p": 0.95,
    "max_output_tokens": 2048,
    "response_mime_type": "application/json",
}

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_PROMPT = """You are a nutrition analysis system. Your ONLY task is to analyze a photo of a plate of food and return a strict JSON object.

Rules:
- Estimate dish density, hidden ingredients (oils, sauces), and portion volume.
- Output ONLY valid JSON with exactly these fields: name (short dish name), portion_grams, calories, protein_g, fat_g, carbs_g.
- No explanations, no markdown, no metaphors. Only the JSON object.
- All numeric values must be non-negative numbers. portion_grams and macros in grams, calories in kcal."""

SYSTEM_PROMPT_EXTENDED = """You are a nutrition analysis system for premium users. Analyze a photo of a plate of food and return a strict JSON object with macros AND estimated micronutrients.

Rules:
- Estimate dish density, hidden ingredients (oils, sauces), and portion volume.
- Output ONLY valid JSON. No explanations, no markdown.
- Required fields: name (short dish name), portion_grams, calories, protein_g, fat_g, carbs_g. All non-negative numbers; portion_grams and macros in grams, calories in kcal.
- Additional fields (use null if not estimable; otherwise a number). Be conservative with estimates; these are typical values for the dish:
  fiber_g, sodium_mg, calcium_mg, iron_mg, potassium_mg, magnesium_mg, zinc_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_iu.
- Standard units: fiber in g; sodium, calcium, iron, potassium, magnesium, zinc in mg; vitamin_a in mcg RAE; vitamin_c in mg; vitamin_d in IU."""

EXTENDED_NUTRIENT_KEYS = frozenset({
    "fiber_g", "sodium_mg", "calcium_mg", "iron_mg", "potassium_mg",
    "magnesium_mg", "zinc_mg", "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_iu",
})


def _extract_extended_nutrients(data: dict) -> dict | None:
    """Extract known micronutrient keys with numeric values; omit nulls and non-numbers."""
    out = {}
    for key in EXTENDED_NUTRIENT_KEYS:
        val = data.get(key)
        if val is not None and isinstance(val, (int, float)):
            out[key] = float(val)
    return out if out else None


async def analyze_food_from_image(
    image_bytes: bytes, *, extended: bool = False
) -> tuple[NutritionAnalysisResult, dict | None]:
    """Send image to Gemini; return (nutrition result, extended_nutrients or None)."""
    if extended:
        prompt = SYSTEM_PROMPT_EXTENDED
        config = GENERATION_CONFIG_EXTENDED
    else:
        prompt = SYSTEM_PROMPT
        config = GENERATION_CONFIG
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config=config,
        safety_settings=SAFETY_SETTINGS,
    )
    part = {"mime_type": "image/jpeg", "data": image_bytes}
    contents = [prompt, part]
    response = await run_generate_content(model, contents)
    if not response or not response.text:
        raise ValueError("Empty response from Gemini")
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    data = json.loads(text)
    base = {k: data[k] for k in ("name", "portion_grams", "calories", "protein_g", "fat_g", "carbs_g") if k in data}
    result = NutritionAnalysisResult(**base)
    extended_nutrients = _extract_extended_nutrients(data) if extended else None
    return (result, extended_nutrients)
