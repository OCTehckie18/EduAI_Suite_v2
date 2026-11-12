"""One cached read of the university's settings.

Middlewares and views used to read the university profile on every request. Now the JSON settings are read once and
kept in the ``settings`` cache (Redis in production, so every worker shares it) and dropped whenever the profile is
saved, so a change by a Master Admin shows at once. The time limit is only a safety net, for example for a change made
straight in the database. Logo bytes are never cached here.

If the cache cannot be reached the database is read instead, so a cache outage never takes the site down.
"""

import logging

from django.core.cache import caches

logger = logging.getLogger(__name__)

KEY = "university:settings:v1"
TIMEOUT = 60
FIELDS = ("modules", "rules", "terms", "fields", "academic")


def _store():
    return caches["settings"]


def snapshot():
    """{"modules": {...}, "rules": {...}, ...}: the stored settings, from the cache when possible."""
    try:
        cached = _store().get(KEY)
    except Exception:  # noqa: BLE001 - any cache failure falls back to the database
        logger.warning("settings cache unavailable; reading the database", exc_info=True)
        cached = None
    if cached is not None:
        return cached
    from .models import UniversityProfile

    row = UniversityProfile.objects.filter(pk=1).values(*FIELDS).first() or {}
    data = {field: row.get(field) or {} for field in FIELDS}
    try:
        _store().set(KEY, data, TIMEOUT)
    except Exception:  # noqa: BLE001
        logger.warning("settings cache unavailable; not storing", exc_info=True)
    return data


def stored(field):
    """The stored JSON of one settings field (``{}`` while the university has set nothing)."""
    return snapshot().get(field, {})


def forget(**_kwargs):
    """Drop the cached settings (called whenever the profile is saved or deleted)."""
    try:
        _store().delete(KEY)
    except Exception:  # noqa: BLE001
        logger.warning("settings cache unavailable; could not clear", exc_info=True)
