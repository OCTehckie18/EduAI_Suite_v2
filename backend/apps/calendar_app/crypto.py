"""Encryption of the stored Google refresh tokens."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _fernet():
    key = getattr(settings, "CALENDAR_TOKEN_KEY", "")
    if not key:
        if not settings.DEBUG:
            raise ImproperlyConfigured("CALENDAR_TOKEN_KEY must be set to connect Google Calendars.")
        # Development only: derive a stable key from the Django secret so local testing needs no setup.
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key if isinstance(key, bytes) else key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ImproperlyConfigured("The stored Google token cannot be decrypted with the current CALENDAR_TOKEN_KEY.") from exc
