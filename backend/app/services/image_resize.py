"""
Resize image before sending to AI: limit long side, keep aspect ratio, re-encode as JPEG.
No cropping — scale only (for both food and sleep screenshots).
"""
import io
import logging

from PIL import Image
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)


def _resize_sync(
    image_bytes: bytes,
    max_long_side: int = 1536,
    jpeg_quality: float = 0.85,
) -> bytes:
    """CPU-bound resize; called from threadpool."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as e:
        logger.warning("image_resize: could not open image, passing through: %s", e)
        return image_bytes

    if img.mode in ("P", "RGBA", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if w <= 0 or h <= 0:
        return image_bytes

    long_side = max(w, h)
    if long_side <= max_long_side:
        new_w, new_h = w, h
    else:
        scale = max_long_side / long_side
        new_w = max(1, round(w * scale))
        new_h = max(1, round(h * scale))

    if (new_w, new_h) != (w, h):
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    try:
        img.save(buf, format="JPEG", quality=round(jpeg_quality * 100))
    except Exception as e:
        logger.warning("image_resize: could not save JPEG, passing through: %s", e)
        return image_bytes

    return buf.getvalue()


def resize_image_for_ai(
    image_bytes: bytes,
    max_long_side: int = 1536,
    jpeg_quality: float = 0.85,
) -> bytes:
    """Synchronous resize (kept for backward compatibility)."""
    return _resize_sync(image_bytes, max_long_side, jpeg_quality)


async def resize_image_for_ai_async(
    image_bytes: bytes,
    max_long_side: int = 1536,
    jpeg_quality: float = 0.85,
) -> bytes:
    """Async resize: offloads CPU-bound work to a threadpool to avoid blocking the event loop."""
    return await run_in_threadpool(_resize_sync, image_bytes, max_long_side, jpeg_quality)
