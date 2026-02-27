"""Unit tests for JWT encode/decode (HS256 and RS256), invalid signature, expiration."""

import os
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest
from jose import JWTError, jwt

from app.core.auth import create_access_token, decode_token
from app.config import settings


def test_create_and_decode_token_roundtrip_hs256():
    """Default config uses HS256; encode then decode returns payload."""
    token = create_access_token(user_id=42, email="u@example.com")
    assert isinstance(token, str)
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["email"] == "u@example.com"
    assert "exp" in payload


def test_decode_invalid_signature_raises():
    """Decoding a token signed with wrong key raises JWTError."""
    token = create_access_token(user_id=1, email="a@b.com")
    # Tamper: replace one character so signature is invalid
    bad_token = token[:-1] + ("x" if token[-1] != "x" else "y")
    with pytest.raises(JWTError):
        decode_token(bad_token)


def test_decode_expired_token_raises():
    """Decoding an expired token raises JWTError."""
    # Build an expired token manually so we don't depend on clock
    payload = {
        "sub": "1",
        "email": "u@test.com",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    key = settings.secret_key
    alg = settings.jwt_algorithm
    token = jwt.encode(payload, key, algorithm=alg)
    token_str = token if isinstance(token, str) else token.decode("utf-8")
    with pytest.raises(JWTError):
        decode_token(token_str)


def test_decode_wrong_key_raises():
    """Decoding a valid HS256 token with wrong secret raises JWTError."""
    token = create_access_token(user_id=1, email="a@b.com")
    # Decode with wrong key by patching settings (keep use_rs256 False by not setting RSA keys)
    with patch.object(settings, "secret_key", "other-secret"):
        with pytest.raises(JWTError):
            decode_token(token)


def test_create_and_decode_token_roundtrip_rs256():
    """When RSA keys are set (mocked), encode with private key and decode with public key."""
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    with patch.object(settings, "jwt_private_key", private_pem):
        with patch.object(settings, "jwt_public_key", public_pem):
            token = create_access_token(user_id=99, email="rs@test.com")
            assert isinstance(token, str)
            payload = decode_token(token)
            assert payload["sub"] == "99"
            assert payload["email"] == "rs@test.com"
