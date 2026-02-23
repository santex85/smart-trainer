from cryptography.fernet import Fernet, InvalidToken
from app.config import settings


def get_fernet() -> Fernet | None:
    if not settings.encryption_key:
        return None
    key = settings.encryption_key.encode() if isinstance(settings.encryption_key, str) else settings.encryption_key
    return Fernet(key)


def encrypt_value(value: str) -> str:
    if not value:
        return ""
    f = get_fernet()
    if f is None:
        return value  # dev: no key → store plaintext
    return f.encrypt(value.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    if not encrypted:
        return ""
    f = get_fernet()
    if f is None:
        return encrypted  # dev: no key
    try:
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        return ""
