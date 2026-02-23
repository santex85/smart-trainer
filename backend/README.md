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

## API

- `GET /health` — health check
- `POST /api/v1/nutrition/analyze` — upload image (multipart), optional `meal_type`, `user_id` (form); returns nutrition JSON and saves to `food_log`

## Sprints

- Sprint 1: Backend + Gemini nutrition (this)
- Sprint 2: Intervals.icu client
- Sprint 3: AI Orchestrator
- Sprint 4: Frontend
