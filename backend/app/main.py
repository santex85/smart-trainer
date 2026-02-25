import logging
import sys
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.v1 import auth, athlete_profile, chat, intervals, nutrition, photo, users, wellness, workouts

# Ensure app loggers (Intervals, sync, etc.) print to stdout so you see them in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger("app").setLevel(logging.DEBUG)
from app.config import settings
from app.db.session import init_db
from app.services.http_client import close_http_client, init_http_client

scheduler = AsyncIOScheduler()


async def scheduled_orchestrator_run():
    """Run orchestrator (daily decision) for every user at configured hours."""
    from datetime import date
    from sqlalchemy import select
    from app.db.session import async_session_maker
    from app.models.user import User
    from app.services.orchestrator import run_daily_decision
    async with async_session_maker() as session:
        r = await session.execute(select(User))
        for user in r.scalars().all():
            await run_daily_decision(session, user.id, date.today())
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_http_client(timeout=30.0)

    # Orchestrator: run at configured hours (e.g. 07:00 and 16:00)
    try:
        hours = [int(h.strip()) for h in settings.orchestrator_cron_hours.split(",") if h.strip()]
    except ValueError:
        hours = [7, 16]
    for hour in hours:
        if 0 <= hour <= 23:
            scheduler.add_job(scheduled_orchestrator_run, "cron", hour=hour, minute=0)

    scheduler.start()
    yield
    scheduler.shutdown()
    await close_http_client()


limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="Smart Trainer API",
    description="AI Trainer backend: nutrition, Intervals.icu, orchestrator",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if getattr(settings, "enable_hsts", False):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()] if settings.cors_origins else ["*"]
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(nutrition.router, prefix="/api/v1")
app.include_router(photo.router, prefix="/api/v1")
app.include_router(intervals.router, prefix="/api/v1")
app.include_router(athlete_profile.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(wellness.router, prefix="/api/v1")
app.include_router(workouts.router, prefix="/api/v1")


@app.get("/health")
@limiter.exempt
def health(request: Request):
    return {"status": "ok"}
