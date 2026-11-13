"""The locked channel: every request from EduAI is signed with a secret only this installation and EduAI hold.

Signature = HMAC-SHA256(secret, "<timestamp>\n<METHOD>\n<path>\n<sha256(body)>"). A request older (or newer) than
five minutes, or one whose signature was already seen, is refused. With no secret configured the channel does not exist.
"""
import hashlib
import hmac
import time

from django.conf import settings
from django.core.cache import cache
from rest_framework.exceptions import NotFound, PermissionDenied

WINDOW_SECONDS = 300


def sign(secret, method, path, body, timestamp):
    digest = hashlib.sha256(body or b"").hexdigest()
    message = f"{timestamp}\n{method.upper()}\n{path}\n{digest}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify(request):
    secret = getattr(settings, "VENDOR_CHANNEL_SECRET", "")
    if not secret:
        raise NotFound()  # switched off: indistinguishable from a URL that was never there
    timestamp = request.headers.get("X-Vendor-Timestamp", "")
    given = request.headers.get("X-Vendor-Signature", "")
    try:
        age = abs(time.time() - int(timestamp))
    except ValueError:
        raise PermissionDenied("Bad signature.")
    expected = sign(secret, request.method, request.path, request.body, timestamp)
    if age > WINDOW_SECONDS or not hmac.compare_digest(expected, given):
        raise PermissionDenied("Bad signature.")
    if not cache.add(f"vendor-sig:{expected}", 1, WINDOW_SECONDS * 2):
        raise PermissionDenied("Request already used.")
