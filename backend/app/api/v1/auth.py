"""Auth: register, login, me, refresh."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.core.auth import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from sqlalchemy.exc import ProgrammingError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_TOKEN_EXPIRE_SECONDS = settings.access_token_expire_minutes * 60


def _issue_tokens(session: AsyncSession, user: User) -> tuple[str, str, int]:
    """Create access token, refresh token (stored in DB), return (access_token, refresh_token, expires_in)."""
    access = create_access_token(user.id, user.email)
    access_str = access if isinstance(access, str) else access.decode("utf-8")
    refresh_plain = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_plain),
            expires_at=expires_at,
        )
    )
    return access_str, refresh_plain, ACCESS_TOKEN_EXPIRE_SECONDS


class RegisterBody(BaseModel):
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access token expires
    user: UserOut


class RefreshBody(BaseModel):
    refresh_token: str


@router.post(
    "/register",
    response_model=TokenResponse,
    summary="Register a new user",
    responses={
        400: {"description": "Email and password required or email already registered"},
        500: {"description": "Registration failed or database error"},
    },
)
async def register(
    session: Annotated[AsyncSession, Depends(get_db)],
    body: RegisterBody,
) -> TokenResponse:
    email = (body.email or "").strip().lower()
    password = body.password or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    r = await session.execute(select(User).where(User.email == email))
    if r.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        user = User(email=email, password_hash=hash_password(password))
        session.add(user)
        await session.flush()
        await session.refresh(user)
    except IntegrityError as e:
        logger.warning("Register IntegrityError: %s", e)
        raise HTTPException(status_code=400, detail="Email already registered") from e
    except ProgrammingError as e:
        logger.exception("Register DB schema error: %s", e)
        detail = "Database schema error. Run: alembic upgrade head"
        if settings.debug:
            detail += f" ({str(e)})"
        raise HTTPException(status_code=500, detail=detail) from e
    except Exception as e:
        logger.exception("Register failed: %s", e)
        detail = "Registration failed"
        if settings.debug:
            detail += f": {type(e).__name__}: {e}"
        raise HTTPException(status_code=500, detail=detail) from e
    access_str, refresh_str, expires_in = _issue_tokens(session, user)
    await session.flush()
    return TokenResponse(
        access_token=access_str,
        refresh_token=refresh_str,
        expires_in=expires_in,
        user=UserOut(id=user.id, email=user.email),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
    responses={
        401: {"description": "Invalid email or password"},
    },
)
async def login(
    session: Annotated[AsyncSession, Depends(get_db)],
    body: LoginBody,
) -> TokenResponse:
    email = (body.email or "").strip().lower()
    password = body.password or ""
    if not email or not password:
        raise HTTPException(status_code=401, detail="Email and password required")
    r = await session.execute(select(User).where(User.email == email))
    user = r.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_str, refresh_str, expires_in = _issue_tokens(session, user)
    await session.flush()
    return TokenResponse(
        access_token=access_str,
        refresh_token=refresh_str,
        expires_in=expires_in,
        user=UserOut(id=user.id, email=user.email),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange refresh token for new access and refresh tokens",
    responses={
        401: {"description": "Refresh token required, invalid or expired"},
    },
)
async def refresh_tokens(
    session: Annotated[AsyncSession, Depends(get_db)],
    body: RefreshBody,
) -> TokenResponse:
    """Exchange refresh_token for new access_token and refresh_token (rotation)."""
    if not body.refresh_token or not body.refresh_token.strip():
        raise HTTPException(status_code=401, detail="Refresh token required")
    token_hash = hash_refresh_token(body.refresh_token.strip())
    r = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user_id = row.user_id
    await session.delete(row)
    await session.flush()
    r_user = await session.execute(select(User).where(User.id == user_id))
    user = r_user.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_str, refresh_str, expires_in = _issue_tokens(session, user)
    await session.flush()
    return TokenResponse(
        access_token=access_str,
        refresh_token=refresh_str,
        expires_in=expires_in,
        user=UserOut(id=user.id, email=user.email),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current authenticated user",
    responses={
        401: {"description": "Not authenticated or invalid token"},
    },
)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut(id=user.id, email=user.email)
