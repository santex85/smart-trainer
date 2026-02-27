"""Shared pagination schemas for list endpoints."""

from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    """Query params for paginated list endpoints."""

    limit: int = Field(default=50, ge=1, le=200, description="Max items per page")
    offset: int = Field(default=0, ge=0, description="Number of items to skip")


class PaginatedResponse(BaseModel):
    """Standard paginated response: items + total + cursor info."""

    items: list
    total: int
    limit: int
    offset: int
    has_more: bool
