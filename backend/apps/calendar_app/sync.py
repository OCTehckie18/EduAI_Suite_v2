"""Keeps a user's Google calendar equal to their in-app calendar.

``sync_user`` compares what the calendar feed says should exist with what was last sent, and only inserts,
patches or deletes the difference. It is idempotent: Google event ids are derived from the item, so a retry
after a crash can never create a duplicate.
"""

import base64
import hashlib
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.institution.models import UniversityProfile

from . import crypto
from .feed import build_feed
from .google_client import Conflict, GoogleApi, GoogleApiError, GoogleAuthError, NotFound
from .models import CalendarSyncRequest, GoogleCalendarItem, GoogleCalendarLink

logger = logging.getLogger(__name__)

DAYS_BACK = 30
DAYS_AHEAD = 365
MAX_ITEMS = 1500  # a safety ceiling for one user
DEFAULT_LENGTH = timedelta(hours=1)


def calendar_name():
    profile = UniversityProfile.load()
    return f"EduAI · {profile.short_name or profile.name or 'University'}"


def event_id_for(link, uid):
    """A Google event id that depends only on the link and the item, so re-sending never duplicates it."""
    digest = hashlib.sha1(f"eduai-{link.pk}-{uid}".encode()).digest()
    return base64.b32hexencode(digest).decode().lower().rstrip("=")


def _portal_link():
    base = (settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}/calendar" if base else ""


def to_google_event(item):
    """Google's event body for one calendar feed item (None when it has no usable start)."""
    start = parse_datetime(item["start"]) if item.get("start") else None
    if start is None:
        return None
    end = parse_datetime(item["end"]) if item.get("end") else None
    description = (item.get("description") or "").strip()
    link = _portal_link()
    if link:
        description = f"{description}\n\nOpen in EduAI: {link}".strip()
    body = {"summary": item["title"], "description": description, "location": item.get("location") or ""}
    if item.get("is_all_day"):
        first = timezone.localtime(start).date()
        last = timezone.localtime(end).date() if end else first
        if last < first:
            last = first
        body["start"] = {"date": first.isoformat()}
        body["end"] = {"date": (last + timedelta(days=1)).isoformat()}  # Google's all-day end is exclusive
    else:
        if end is None or end <= start:
            end = start + DEFAULT_LENGTH
        body["start"] = {"dateTime": start.isoformat(), "timeZone": settings.TIME_ZONE}
        body["end"] = {"dateTime": end.isoformat(), "timeZone": settings.TIME_ZONE}
    body["extendedProperties"] = {"private": {"eduai_uid": item["id"]}}
    return body


def content_hash(body):
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def desired_items(user, now=None):
    """{uid: google event body} for the user's calendar inside the sync window."""
    now = now or timezone.now()
    low, high = now - timedelta(days=DAYS_BACK), now + timedelta(days=DAYS_AHEAD)
    wanted = {}
    for item in build_feed(user):
        start = parse_datetime(item["start"]) if item.get("start") else None
        if start is None or not low <= start <= high:
            continue
        body = to_google_event(item)
        if body is not None:
            wanted[item["id"]] = body
        if len(wanted) >= MAX_ITEMS:
            break
    return wanted


def _mark(link, status, error=""):
    link.status, link.last_error = status, error[:300]
    link.save(update_fields=["status", "last_error"])


def _ensure_calendar(link, api, access):
    if link.calendar_id:
        return
    link.calendar_id = api.create_calendar(access, calendar_name(), settings.TIME_ZONE)
    link.save(update_fields=["calendar_id"])


def sync_user(link, api=None, now=None):
    """Make the user's Google calendar match their in-app calendar. Returns {inserted, patched, deleted, unchanged}.

    Raises ``GoogleAuthError`` after marking the link revoked, or ``GoogleApiError`` for a failure worth retrying.
    """
    api = api or GoogleApi()
    counts = {"inserted": 0, "patched": 0, "deleted": 0, "unchanged": 0}
    try:
        access = api.access_token(crypto.decrypt(link.refresh_token))
        _ensure_calendar(link, api, access)
        wanted = desired_items(link.user, now)
        known = {item.uid: item for item in link.items.all()}

        def send(uid, body, existing):
            event_id = existing.google_event_id if existing else event_id_for(link, uid)
            try:
                if existing:
                    api.patch_event(access, link.calendar_id, event_id, body)
                else:
                    api.insert_event(access, link.calendar_id, {**body, "id": event_id})
            except Conflict:
                api.patch_event(access, link.calendar_id, event_id, body)  # sent before a crash: just update it
            except NotFound:
                if not existing:
                    raise
                api.insert_event(access, link.calendar_id, {**body, "id": event_id})  # deleted in Google by hand
            return event_id

        try:
            for uid, body in wanted.items():
                digest = content_hash(body)
                existing = known.get(uid)
                if existing and existing.content_hash == digest:
                    counts["unchanged"] += 1
                    continue
                event_id = send(uid, body, existing)
                GoogleCalendarItem.objects.update_or_create(
                    link=link, uid=uid, defaults={"google_event_id": event_id, "content_hash": digest},
                )
                counts["patched" if existing else "inserted"] += 1
            for uid, existing in known.items():
                if uid in wanted:
                    continue
                try:
                    api.delete_event(access, link.calendar_id, existing.google_event_id)
                except NotFound:
                    pass
                existing.delete()
                counts["deleted"] += 1
        except NotFound:
            # The whole calendar was removed in Google: forget what was sent and start again next time.
            link.items.all().delete()
            link.calendar_id = ""
            link.save(update_fields=["calendar_id"])
            raise GoogleApiError("The EduAI calendar was deleted in Google; it will be recreated.", 404)
    except GoogleAuthError as exc:
        _mark(link, GoogleCalendarLink.Status.REVOKED, str(exc))
        raise
    except GoogleApiError as exc:
        _mark(link, GoogleCalendarLink.Status.ERROR, str(exc))
        raise
    link.status, link.last_error, link.last_synced_at = GoogleCalendarLink.Status.CONNECTED, "", timezone.now()
    link.save(update_fields=["status", "last_error", "last_synced_at"])
    return counts


def disconnect(link, api=None):
    """Remove the EduAI calendar from the user's Google account, revoke the permission and forget the link."""
    api = api or GoogleApi()
    try:
        token = crypto.decrypt(link.refresh_token)
        if link.calendar_id:
            try:
                api.delete_calendar(api.access_token(token), link.calendar_id)
            except (GoogleApiError, GoogleAuthError):
                logger.info("Could not delete the EduAI calendar in Google while disconnecting user %s.", link.user_id)
        api.revoke(token)
    except Exception:  # never let a Google problem stop the user from disconnecting
        logger.info("Disconnecting Google Calendar for user %s without contacting Google.", link.user_id)
    user_id = link.user_id
    with transaction.atomic():
        link.delete()
        CalendarSyncRequest.objects.filter(user_id=user_id).delete()


# ---- the outbox -------------------------------------------------------------

BACKOFF_SECONDS = 30
MAX_BACKOFF = 3600


def process_outbox(api=None, limit=50, now=None):
    """Sync users whose calendar changed. Returns {synced, failed, skipped}."""
    api = api or GoogleApi()
    now = now or timezone.now()
    result = {"synced": 0, "failed": 0, "skipped": 0}
    for request in list(CalendarSyncRequest.objects.filter(next_attempt_at__lte=now).select_related("user")[:limit]):
        outcome = _run(request, api)
        result[outcome] += 1
    return result


def sync_all(api=None):
    """The nightly safety net: reconcile every connected user."""
    api = api or GoogleApi()
    result = {"synced": 0, "failed": 0, "skipped": 0}
    for link in GoogleCalendarLink.objects.filter(status__in=["connected", "error"]).select_related("user"):
        request, _ = CalendarSyncRequest.objects.get_or_create(user=link.user)
        result[_run(request, api)] += 1
    return result


def _run(request, api):
    try:
        link = request.user.google_calendar_link
    except ObjectDoesNotExist:
        request.delete()
        return "skipped"
    if not request.user.is_active:
        disconnect(link, api)
        return "skipped"
    if link.status == GoogleCalendarLink.Status.REVOKED:
        request.delete()  # the user must reconnect; retrying cannot help
        return "skipped"
    stamp = request.requested_at
    try:
        sync_user(link, api)
    except GoogleAuthError:
        request.delete()
        return "failed"
    except GoogleApiError:
        request.attempts += 1
        request.next_attempt_at = timezone.now() + timedelta(seconds=min(BACKOFF_SECONDS * 2 ** request.attempts, MAX_BACKOFF))
        request.save(update_fields=["attempts", "next_attempt_at"])
        return "failed"
    # Keep the request when something changed while we were sending, so that change is sent next time.
    CalendarSyncRequest.objects.filter(pk=request.pk, requested_at=stamp).delete()
    return "synced"
