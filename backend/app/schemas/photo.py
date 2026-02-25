from typing import Literal, Union

from pydantic import BaseModel

from app.schemas.nutrition import NutritionAnalyzeResponse
from app.schemas.sleep_extraction import SleepExtractionResponse


class PhotoFoodResponse(BaseModel):
    type: Literal["food"] = "food"
    food: NutritionAnalyzeResponse


class PhotoSleepResponse(BaseModel):
    type: Literal["sleep"] = "sleep"
    sleep: SleepExtractionResponse


class WellnessPhotoResult(BaseModel):
    """RHR/HRV extracted from a wellness screenshot."""

    rhr: int | None = None
    hrv: float | None = None


class PhotoWellnessResponse(BaseModel):
    type: Literal["wellness"] = "wellness"
    wellness: WellnessPhotoResult


PhotoAnalyzeResponse = Union[PhotoFoodResponse, PhotoSleepResponse, PhotoWellnessResponse]
