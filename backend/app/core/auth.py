"""Password hashing and JWT creation/verification."""

import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def _refresh_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash password with bcrypt. Bytes truncated to 72 (bcrypt limit); no passlib re-encoding."""
    pwd_bytes = password.encode("utf-8")[:72]
    hashed = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify password with bcrypt. Plain password truncated to 72 bytes."""
    plain_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.checkpw(plain_bytes, password_hash.encode("utf-8"))


def _get_jwt_signing_key_and_algorithm() -> tuple[str, str]:
    """Return (key, algorithm) for signing access tokens."""
    if settings.use_rs256:
        return settings.jwt_private_key.strip(), "RS256"
    return settings.secret_key, settings.jwt_algorithm


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    key, algorithm = _get_jwt_signing_key_and_algorithm()
    result = jwt.encode(payload, key, algorithm=algorithm)
    return result if isinstance(result, str) else result.decode("utf-8")


def create_refresh_token() -> str:
    """Generate a new refresh token (plain string; caller must hash and store)."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA256 hash of refresh token for storage."""
    return _refresh_token_hash(token)


def _get_jwt_verification_key_and_algorithms() -> tuple[str, list[str]]:
    """Return (key, algorithms) for verifying access tokens."""
    if settings.use_rs256:
        return settings.jwt_public_key.strip(), ["RS256"]
    return settings.secret_key, [settings.jwt_algorithm]


def decode_token(token: str) -> dict[str, Any]:
    key, algorithms = _get_jwt_verification_key_and_algorithms()
    return jwt.decode(token, key, algorithms=algorithms)
