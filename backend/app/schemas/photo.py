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


PhotoAnalyzeResponse = Union[PhotoFoodResponse, PhotoSleepResponse]
