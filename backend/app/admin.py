"""SQLAdmin setup: auth (superuser only) and model views."""

import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.core.auth import verify_password
from app.models import User, Subscription, DailyUsage, IntervalsCredentials


def get_sync_engine():
    """Sync engine for sqladmin (uses same DB as async app)."""
    return create_engine(
        settings.sync_database_url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=5,
    )


class AdminAuth(AuthenticationBackend):
    """Allow only users with is_superuser=True; login with email + password."""

    def __init__(self, engine, secret_key: str):
        super().__init__(secret_key)
        self.engine = engine

    def _verify_credentials_sync(self, username: str | None, password: str | None) -> bool:
        if not username or not password:
            return False
        with Session(self.engine) as session:
            user = session.query(User).filter(User.email == username.strip()).first()
            if not user or not user.password_hash or not user.is_superuser:
                return False
            return verify_password(password, user.password_hash)

    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
        ok = await asyncio.to_thread(
            self._verify_credentials_sync,
            username if isinstance(username, str) else None,
            password if isinstance(password, str) else None,
        )
        if ok:
            request.session.update({"admin_authenticated": True})
        return ok

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("admin_authenticated", False) is True


class UserAdmin(ModelView, model=User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    column_list = [
        User.id,
        User.email,
        User.is_premium,
        User.is_superuser,
        User.locale,
        User.created_at,
    ]
    column_searchable_list = [User.email]
    column_sortable_list = [User.id, User.email, User.created_at]
    form_excluded_columns = [
        "food_logs",
        "wellness_cache",
        "chat_messages",
        "chat_threads",
        "intervals_credentials",
        "sleep_extractions",
        "athlete_profile",
        "workouts",
        "refresh_tokens",
        "subscription",
        "daily_usage",
        "retention_reminders_sent",
    ]
    form_widget_args = {"password_hash": {"readonly": True}}


class SubscriptionAdmin(ModelView, model=Subscription):
    name = "Subscription"
    name_plural = "Subscriptions"
    icon = "fa-solid fa-credit-card"
    column_list = [
        Subscription.id,
        Subscription.user_id,
        Subscription.plan,
        Subscription.status,
        Subscription.current_period_end,
        Subscription.cancel_at_period_end,
        Subscription.updated_at,
    ]
    column_sortable_list = [Subscription.id, Subscription.user_id, Subscription.status]


class DailyUsageAdmin(ModelView, model=DailyUsage):
    name = "DailyUsage"
    name_plural = "Daily usage"
    icon = "fa-solid fa-chart-bar"
    column_list = [
        DailyUsage.id,
        DailyUsage.user_id,
        DailyUsage.date,
        DailyUsage.photo_analyses,
        DailyUsage.chat_messages,
    ]
    column_sortable_list = [DailyUsage.id, DailyUsage.user_id, DailyUsage.date]


class IntervalsCredentialsAdmin(ModelView, model=IntervalsCredentials):
    name = "IntervalsCredentials"
    name_plural = "Intervals credentials"
    icon = "fa-solid fa-key"
    column_list = [
        IntervalsCredentials.id,
        IntervalsCredentials.user_id,
        IntervalsCredentials.athlete_id,
        IntervalsCredentials.updated_at,
    ]
    form_excluded_columns = ["encrypted_token_or_key"]
    column_sortable_list = [IntervalsCredentials.id, IntervalsCredentials.user_id]


def setup_admin(app):
    """Create Admin with auth and model views; register on app (no mount)."""
    engine = get_sync_engine()
    auth = AdminAuth(engine, secret_key=settings.secret_key)
    admin = Admin(
        app,
        engine,
        title="tssproAI Admin",
        base_url="/admin",
        authentication_backend=auth,
    )
    admin.add_view(UserAdmin)
    admin.add_view(SubscriptionAdmin)
    admin.add_view(DailyUsageAdmin)
    admin.add_view(IntervalsCredentialsAdmin)
    return admin
