"""
Classify image as food or sleep data using Gemini.
"""
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from app.config import settings

# System-level instruction so the model consistently behaves as a binary classifier
CLASSIFY_SYSTEM_INSTRUCTION = """You are an image classifier. Your only job is to decide whether an image is:
- "food": a photo of a real meal, plate, or dish (actual food on a table/plate).
- "sleep": any screenshot, chart, or report from a sleep or health app showing sleep data. This includes: sleep duration, sleep stages (deep/REM/light), quality score, sleep graphs, Oura/Garmin/Whoop/Apple Health/Fitbit/sleep tracker screens, any UI with hours of sleep or sleep phases.

You must reply with exactly one word: food or sleep. No other text, no explanation. If the image clearly shows sleep metrics (numbers, graphs, app UI about sleep), answer sleep. If it shows actual food, answer food."""

CLASSIFY_PROMPT = """Look at this image and classify it. Reply with exactly one word: food or sleep."""

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}


def _configure_genai() -> None:
    if not settings.google_gemini_api_key:
        raise ValueError("GOOGLE_GEMINI_API_KEY is not set")
    genai.configure(api_key=settings.google_gemini_api_key)


def classify_image(image_bytes: bytes) -> str:
    """Return 'food' or 'sleep'. Default to 'food' only if response is missing or invalid."""
    _configure_genai()
    model = genai.GenerativeModel(
        settings.gemini_model,
        safety_settings=SAFETY_SETTINGS,
        system_instruction=CLASSIFY_SYSTEM_INSTRUCTION,
    )
    part = {"mime_type": "image/jpeg", "data": image_bytes}
    contents = [CLASSIFY_PROMPT, part]
    response = model.generate_content(contents)
    if not response or not response.text:
        return "food"
    word = response.text.strip().lower().split()[0] if response.text.strip() else ""
    if word == "sleep":
        return "sleep"
    return "food"
