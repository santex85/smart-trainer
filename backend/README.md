# Smart Trainer Backend

FastAPI backend for the AI Trainer MVP: nutrition (Gemini), Intervals.icu integration, orchestrator.

## Setup

1. Create virtualenv and install deps: `uv sync` or `pip install -r requirements.txt`
2. Copy `.env.example` to `.env`, set `DATABASE_URL` (PostgreSQL) and `GOOGLE_GEMINI_API_KEY`
3. Run migrations: `alembic upgrade head`
4. (Optional) Create a test user: `python -c "
from app.db.session import async_session_maker
from app.models.user import User
import asyncio
async def main():
    async with async_session_maker() as s:
        s.add(User(email='test@example.com'))
        await s.commit()
asyncio.run(main())
"`
5. Start server: `uvicorn app.main:app --reload`

## Testing

Unit tests use pytest and pytest-asyncio. From repo root: `make test`, or from `backend/`:

```bash
pip install -r requirements.txt pytest pytest-asyncio   # if not already
PYTHONPATH=. python3 -m pytest tests/ -v
```

- **tests/test_image_resize.py** — resize_image_for_ai (invalid bytes, small/large image, aspect ratio). Needs Pillow only.
- **tests/test_orchestrator.py** — _normalize_decision, _parse_llm_response (Go/Modify/Skip, code fence, truncation). Needs full app deps.
- **tests/test_load_metrics.py** — compute_fitness_from_workouts (no workouts → None; with TSS → ctl/atl/tsb). Needs full app deps.

For all tests to run, install backend dependencies (e.g. `pip install -r requirements.txt`).

## API

- `GET /health` — health check
- `POST /api/v1/nutrition/analyze` — upload image (multipart), optional `meal_type`, `user_id` (form); returns nutrition JSON and saves to `food_log`

## Sprints

- Sprint 1: Backend + Gemini nutrition (this)
- Sprint 2: Intervals.icu client
- Sprint 3: AI Orchestrator
- Sprint 4: Frontend
