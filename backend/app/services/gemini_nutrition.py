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


async def analyze_food_from_image(image_bytes: bytes) -> NutritionAnalysisResult:
    """Send image to Gemini; return validated nutrition result (Pydantic)."""
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
    data = json.loads(text)
    return NutritionAnalysisResult(**data)
