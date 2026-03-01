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


class WorkoutPhotoResult(BaseModel):
    """Workout data extracted from a screenshot."""

    name: str | None = None
    date: str | None = None
    sport_type: str | None = None
    duration_sec: int | None = None
    distance_m: float | None = None
    calories: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    tss: int | None = None
    notes: str | None = None


class PhotoWellnessResponse(BaseModel):
    type: Literal["wellness"] = "wellness"
    wellness: WellnessPhotoResult


class PhotoWorkoutResponse(BaseModel):
    type: Literal["workout"] = "workout"
    workout: WorkoutPhotoResult


PhotoAnalyzeResponse = Union[PhotoFoodResponse, PhotoSleepResponse, PhotoWellnessResponse, PhotoWorkoutResponse]
