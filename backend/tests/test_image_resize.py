"""Tests for image resize before AI (scale by long side, JPEG)."""

import io

import pytest
from PIL import Image

from app.services.image_resize import resize_image_for_ai


def _make_jpeg_bytes(width: int, height: int) -> bytes:
    """Create minimal valid JPEG bytes (RGB image)."""
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_resize_returns_original_on_invalid_bytes():
    """Invalid image bytes are returned as-is (fallback)."""
    invalid = b"not an image"
    result = resize_image_for_ai(invalid)
    assert result == invalid


def test_resize_small_image_returns_jpeg_under_max():
    """Image with long side <= max_long_side is re-encoded as JPEG, same dimensions."""
    jpeg = _make_jpeg_bytes(100, 80)
    result = resize_image_for_ai(jpeg, max_long_side=1536)
    assert isinstance(result, bytes)
    assert len(result) > 0
    # Output is valid JPEG
    img = Image.open(io.BytesIO(result))
    img.load()
    assert img.size == (100, 80)


def test_resize_large_image_scales_by_long_side():
    """Image with long side > max_long_side is scaled down, aspect ratio preserved."""
    jpeg = _make_jpeg_bytes(2000, 1000)  # long side 2000
    result = resize_image_for_ai(jpeg, max_long_side=500)
    assert isinstance(result, bytes)
    img = Image.open(io.BytesIO(result))
    img.load()
    # Long side must be 500, short side 250
    w, h = img.size
    assert max(w, h) == 500
    assert min(w, h) == 250


def test_resize_narrow_tall_image():
    """Narrow tall image (e.g. sleep screenshot) scales by height."""
    jpeg = _make_jpeg_bytes(300, 2000)
    result = resize_image_for_ai(jpeg, max_long_side=1536)
    img = Image.open(io.BytesIO(result))
    img.load()
    assert max(img.size) == 1536
    assert img.size[0] == round(300 * 1536 / 2000)
    assert img.size[1] == 1536
