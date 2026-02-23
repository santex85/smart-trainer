"""Auth: register, login, me."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.core.auth import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from sqlalchemy.exc import ProgrammingError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


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
    token_type: str = "bearer"
    user: UserOut


@router.post("/register", response_model=TokenResponse)
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
    token = create_access_token(user.id, user.email)
    token_str = token if isinstance(token, str) else token.decode("utf-8")
    return TokenResponse(
        access_token=token_str,
        user=UserOut(id=user.id, email=user.email),
    )


@router.post("/login", response_model=TokenResponse)
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
    token = create_access_token(user.id, user.email)
    token_str = token if isinstance(token, str) else token.decode("utf-8")
    return TokenResponse(
        access_token=token_str,
        user=UserOut(id=user.id, email=user.email),
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut(id=user.id, email=user.email)
