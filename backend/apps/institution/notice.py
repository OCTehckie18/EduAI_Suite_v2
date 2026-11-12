"""An institution-wide notice banner and the help-desk details shown in every portal.

Both live in ``UniversityProfile.notice`` / ``UniversityProfile.help`` (JSON), validated here. The notice is only
sent to the portals while it is switched on and inside its start/end window, so an expired notice disappears
by itself.
"""

import hashlib

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.utils import timezone
from django.utils.dateparse import parse_datetime

TONES = ("info", "urgent")
MAX_NOTICE = 300
DEFAULT_NOTICE = {"enabled": False, "text": "", "tone": "info", "dismissable": True, "starts_at": None, "ends_at": None}
DEFAULT_HELP = {"email": "", "phone": "", "hours": "", "link": ""}
HELP_LIMITS = {"email": 254, "phone": 30, "hours": 100, "link": 200}


def merged_notice(stored):
    notice = dict(DEFAULT_NOTICE)
    if isinstance(stored, dict):
        notice.update({k: v for k, v in stored.items() if k in notice})
    return notice


def merged_help(stored):
    help_ = dict(DEFAULT_HELP)
    if isinstance(stored, dict):
        help_.update({k: v for k, v in stored.items() if k in help_})
    return help_


def _when(value, label, errors, key):
    if value in (None, ""):
        return None
    parsed = parse_datetime(str(value)) if isinstance(value, str) else None
    if parsed is None:
        errors[key] = f"{label} is not a valid date and time."
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed.isoformat()


def clean_notice(data, stored):
    """(notice, errors): ``data`` validated and laid over the stored notice."""
    notice = merged_notice(stored)
    errors = {}
    if not isinstance(data, dict):
        return notice, {"notice": "Send the notice as an object."}
    if "enabled" in data:
        if not isinstance(data["enabled"], bool):
            errors["enabled"] = "Use true or false."
        else:
            notice["enabled"] = data["enabled"]
    if "dismissable" in data:
        if not isinstance(data["dismissable"], bool):
            errors["dismissable"] = "Use true or false."
        else:
            notice["dismissable"] = data["dismissable"]
    if "text" in data:
        text = str(data["text"] or "").strip()
        if len(text) > MAX_NOTICE:
            errors["text"] = f"Keep the notice under {MAX_NOTICE} characters."
        else:
            notice["text"] = text
    if "tone" in data:
        if data["tone"] not in TONES:
            errors["tone"] = "Choose info or urgent."
        else:
            notice["tone"] = data["tone"]
    for key, label in (("starts_at", "The start"), ("ends_at", "The end")):
        if key in data:
            notice[key] = _when(data[key], label, errors, key)
    if notice["starts_at"] and notice["ends_at"] and not errors:
        if parse_datetime(notice["ends_at"]) <= parse_datetime(notice["starts_at"]):
            errors["ends_at"] = "The notice must end after it starts."
    if notice["enabled"] and not notice["text"] and "text" not in errors:
        errors["text"] = "Write the notice before switching it on."
    return notice, errors


def clean_help(data, stored):
    help_ = merged_help(stored)
    errors = {}
    if not isinstance(data, dict):
        return help_, {"help": "Send the help details as an object."}
    for key, limit in HELP_LIMITS.items():
        if key not in data:
            continue
        value = str(data[key] or "").strip()
        if len(value) > limit:
            errors[key] = f"Keep this under {limit} characters."
        elif value and key == "email":
            try:
                validate_email(value)
            except ValidationError:
                errors[key] = "Enter a valid email address."
        elif value and key == "link":
            try:
                URLValidator(schemes=["http", "https"])(value)
            except ValidationError:
                errors[key] = "Enter a full address starting with https://."
        if key not in errors:
            help_[key] = value
    return help_, errors


def active_notice(stored, now=None):
    """The notice every portal should show right now, or None. A changed notice gets a new ``version``."""
    notice = merged_notice(stored)
    if not notice["enabled"] or not notice["text"]:
        return None
    now = now or timezone.now()
    start = parse_datetime(notice["starts_at"]) if notice["starts_at"] else None
    end = parse_datetime(notice["ends_at"]) if notice["ends_at"] else None
    if (start and now < start) or (end and now >= end):
        return None
    # The version lets a portal remember "dismissed" for this exact notice, and show a changed one again.
    version = hashlib.sha1(f"{notice['text']}|{notice['tone']}|{notice['starts_at']}".encode()).hexdigest()[:10]
    return {"text": notice["text"], "tone": notice["tone"], "dismissable": notice["dismissable"], "version": version}
