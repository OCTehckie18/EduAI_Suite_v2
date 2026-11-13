"""The owner's side of the locked channel to a college's installation.

Each request is signed (HMAC-SHA256 over timestamp, a random nonce, method, path and body hash) with the secret that college holds,
so a copied request cannot be replayed or altered. The secret is stored encrypted and never leaves this server.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlparse

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

TIMEOUT_SECONDS = 8


class ChannelError(Exception):
    """The college could not be reached, or refused the request."""

    def __init__(self, message, status_code=None, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def _fernet():
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode() if secret else ""


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def _sign(secret, method, path, body, timestamp, nonce):
    message = f"{timestamp}\n{nonce}\n{method.upper()}\n{path}\n{hashlib.sha256(body or b'').hexdigest()}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def call(campus, method, path, data=None):
    """Make one signed request to the college. ``path`` is under /api/v1/vendor/, e.g. "admins/"."""
    if not campus.has_channel:
        raise ChannelError("This college has no locked channel set up yet.")
    secret = decrypt_secret(campus.channel_secret_enc)
    if not secret:
        raise ChannelError("The stored channel key could not be read. Set it again.")
    origin = campus.api_url.rstrip("/")
    if urlparse(origin).scheme not in {"http", "https"}:
        raise ChannelError("The college's API address is not valid.")
    full_path = f"/api/v1/vendor/{path}"
    body = json.dumps(data).encode() if data is not None else b""
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)  # so two identical requests in one second still sign differently
    headers = {
        "Content-Type": "application/json",
        "X-Vendor-Timestamp": timestamp,
        "X-Vendor-Nonce": nonce,
        "X-Vendor-Signature": _sign(secret, method, full_path, body, timestamp, nonce),
    }
    try:
        response = requests.request(method, origin + full_path, data=body, headers=headers, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise ChannelError(f"Could not reach the college ({exc.__class__.__name__}).") from exc
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code == 404 and not payload:
        raise ChannelError("The college's channel is switched off or this address is wrong.", 404)
    if response.status_code == 403:
        raise ChannelError("The college refused the signature. Check the channel key.", 403)
    if not response.ok:
        raise ChannelError(payload.get("detail", f"The college answered with an error ({response.status_code})."), response.status_code, payload)
    return payload
