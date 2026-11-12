"""Extra profile fields and ID formats the university defines (English only).

Stored in ``UniversityProfile.fields`` (JSON):

* ``id_formats``: for ``register_no`` and ``employee_no`` an optional pattern. In a pattern ``9`` is a digit,
  ``A`` a letter, ``X`` a letter or digit and any other character stands for itself, so ``99-AAA-9999``
  matches ``21-MCA-0042``. Only new or changed numbers are checked, so existing accounts are never locked out.
* ``custom``: up to ``MAX_FIELDS`` extra fields (text, number, date or choice) for students, teachers or both.
  People edit their own value in their profile (unless the field is admin-only); Master Admin can edit anyone's.
  Values live on ``User.extra`` by the field's key.

Everything is off by default, so nothing changes until a Master Admin sets something up.
"""

import re
from datetime import date

KINDS = ("text", "number", "date", "choice")
APPLIES = ("student", "teacher", "both")
ID_KEYS = ("register_no", "employee_no")
MAX_FIELDS = 10
MAX_CHOICES = 20
MAX_PATTERN = 30
KEY = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
RESERVED = {"email", "name", "first_name", "last_name", "phone_number", "register_no", "emp_no", "role", "password", "extra"}
TOKENS = {"9": "digit", "A": "letter", "X": "letter or digit"}
EXAMPLE = {"digit": "7", "letter": "K", "letter or digit": "4"}
PLURAL = {"digit": "digits", "letter": "letters", "letter or digit": "letters or digits"}


def merged(stored):
    fields = {"id_formats": {key: {"pattern": ""} for key in ID_KEYS}, "custom": []}
    if isinstance(stored, dict):
        formats = stored.get("id_formats")
        if isinstance(formats, dict):
            for key in ID_KEYS:
                if isinstance(formats.get(key), dict):
                    fields["id_formats"][key]["pattern"] = str(formats[key].get("pattern") or "")
        if isinstance(stored.get("custom"), list):
            fields["custom"] = [row for row in stored["custom"] if isinstance(row, dict) and "key" in row]
    return fields


# ---- ID formats ---------------------------------------------------------------

def describe(pattern):
    """A plain-English description and an example of a pattern, for hints and error messages."""
    if not pattern:
        return {"description": "", "example": ""}
    runs, example = [], []
    for ch in pattern:
        kind = TOKENS.get(ch)
        if kind:
            if runs and runs[-1][0] == kind:
                runs[-1][1] += 1
            else:
                runs.append([kind, 1])
            example.append(EXAMPLE[kind])
        else:
            runs.append([ch, 0])
            example.append(ch)
    parts = []
    for kind, count in runs:
        if count:
            parts.append(f"{count} {kind if count == 1 else PLURAL[kind]}")
        else:
            parts.append(f"'{kind}'")
    return {"description": ", ".join(parts), "example": "".join(example)}


def matches(pattern, value):
    if not pattern:
        return True
    if len(value) != len(pattern):
        return False
    for ch, v in zip(pattern, value):
        if ch == "9" and not (v.isascii() and v.isdigit()):
            return False
        if ch == "A" and not (v.isascii() and v.isalpha()):
            return False
        if ch == "X" and not (v.isascii() and v.isalnum()):
            return False
        if ch not in TOKENS and ch != v:
            return False
    return True


def check_id(kind, value, stored=None):
    """An error message if ``value`` does not fit the university's format for ``kind`` ("register_no"/"employee_no"), else None."""
    value = str(value or "").strip()
    if not value:
        return None
    if stored is None:
        stored = _current_raw()
    pattern = merged(stored)["id_formats"][kind]["pattern"]
    if matches(pattern, value):
        return None
    from . import terms

    info = describe(pattern)
    return f"'{value}' is not a valid {terms.get(kind, lower=True)}. Use {info['description']}, for example {info['example']}."


# ---- custom fields ------------------------------------------------------------

def _clean_definition(raw, number, seen):
    if not isinstance(raw, dict):
        return None, f"Field {number} is not valid."
    label = str(raw.get("label") or "").strip()
    if not 1 <= len(label) <= 40:
        return None, f"Field {number}: give it a label of up to 40 characters."
    key = str(raw.get("key") or "").strip() or re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:30]
    if key and key[0].isdigit():
        key = "f_" + key
    if not KEY.match(key or "") or key in RESERVED:
        return None, f"Field {number}: '{label}' needs a different label."
    if key in seen:
        return None, f"Two fields are called '{label}'."
    kind = raw.get("type")
    if kind not in KINDS:
        return None, f"Field '{label}': choose text, number, date or choice."
    applies = raw.get("applies_to", "both")
    if applies not in APPLIES:
        return None, f"Field '{label}': choose students, teachers or both."
    for flag in ("required", "admin_only"):
        if not isinstance(raw.get(flag, False), bool):
            return None, f"Field '{label}': {flag} must be true or false."
    choices = []
    if kind == "choice":
        source = raw.get("choices")
        if isinstance(source, str):
            source = source.split(",")
        if not isinstance(source, list):
            return None, f"Field '{label}': list the choices."
        choices = [str(c).strip() for c in source if str(c).strip()]
        if not 2 <= len(choices) <= MAX_CHOICES or len({c.lower() for c in choices}) != len(choices) or any(len(c) > 40 for c in choices):
            return None, f"Field '{label}': give 2 to {MAX_CHOICES} different choices, each up to 40 characters."
    seen.add(key)
    return {"key": key, "label": label, "type": kind, "applies_to": applies,
            "required": bool(raw.get("required", False)), "admin_only": bool(raw.get("admin_only", False)), "choices": choices}, None


def clean_fields(data, stored):
    """(fields, errors): ``data`` validated and laid over the stored settings."""
    fields = merged(stored)
    errors = {}
    if not isinstance(data, dict):
        return fields, {"fields": "Send the settings as an object."}
    formats = data.get("id_formats")
    if isinstance(formats, dict):
        for key in ID_KEYS:
            if key in formats:
                pattern = str((formats[key] or {}).get("pattern") or "").strip() if isinstance(formats[key], dict) else ""
                if len(pattern) > MAX_PATTERN:
                    errors[f"id_formats.{key}"] = f"Keep the format under {MAX_PATTERN} characters."
                elif pattern and not any(ch in TOKENS for ch in pattern):
                    errors[f"id_formats.{key}"] = "Use 9 for a digit, A for a letter and X for a letter or digit, for example 9999999."
                else:
                    fields["id_formats"][key]["pattern"] = pattern
    if "custom" in data:
        raw = data["custom"]
        if not isinstance(raw, list) or len(raw) > MAX_FIELDS:
            errors["custom"] = f"Add up to {MAX_FIELDS} fields."
        else:
            rows, seen = [], set()
            for number, item in enumerate(raw, start=1):
                row, problem = _clean_definition(item, number, seen)
                if problem:
                    errors["custom"] = problem
                    break
                rows.append(row)
            else:
                fields["custom"] = rows
    return fields, errors


def public_fields(stored):
    """What the portals need: the format hints and the field definitions."""
    fields = merged(stored)
    return {
        "id_formats": {key: {**value, **describe(value["pattern"])} for key, value in fields["id_formats"].items()},
        "custom": fields["custom"],
    }


def _current_raw():
    from .models import UniversityProfile

    profile = UniversityProfile.objects.only("fields").filter(pk=1).first()
    return profile.fields if profile else {}


def definitions_for(role, stored=None):
    """The custom fields that apply to a user of ``role`` ("STUDENT"/"TEACHER")."""
    wanted = {"STUDENT": "student", "TEACHER": "teacher"}.get(role)
    stored = _current_raw() if stored is None else stored
    return [d for d in merged(stored)["custom"] if wanted and d["applies_to"] in (wanted, "both")]


def clean_value(definition, raw):
    """(value, error) for one submitted value; an empty value is allowed unless the field is required."""
    label = definition["label"]
    text = "" if raw is None else str(raw).strip()
    if not text:
        return "", (f"{label} is required." if definition["required"] else None)
    kind = definition["type"]
    if kind == "text":
        return (text, None) if len(text) <= 200 else ("", f"{label}: keep it under 200 characters.")
    if kind == "number":
        try:
            float(text)
        except ValueError:
            return "", f"{label} must be a number."
        return (text, None) if len(text) <= 30 else ("", f"{label} is too long.")
    if kind == "date":
        try:
            date.fromisoformat(text)
        except ValueError:
            return "", f"{label} must be a date (year-month-day)."
        return text, None
    match = next((c for c in definition["choices"] if c.lower() == text.lower()), None)
    return (match, None) if match else ("", f"{label}: choose one of {', '.join(definition['choices'])}.")


def apply_extra(user, submitted, by_admin=False, stored=None, enforce_required=True):
    """Validate ``submitted`` ({key: value}) against the user's fields; returns (new extra dict, error).

    A person cannot change admin-only fields. A required field cannot be left blank (``enforce_required``).
    """
    if not isinstance(submitted, dict):
        return None, "Send the extra fields as an object."
    current = dict(user.extra or {})
    for definition in definitions_for(user.role, stored):
        key = definition["key"]
        if key not in submitted:
            if enforce_required and definition["required"] and not current.get(key) and not (definition["admin_only"] and not by_admin):
                return None, f"{definition['label']} is required."
            continue
        if definition["admin_only"] and not by_admin:
            return None, f"{definition['label']} can only be changed by an administrator."
        value, error = clean_value(definition, submitted[key])
        if error:
            return None, error
        if value:
            current[key] = value
        else:
            current.pop(key, None)
    return current, None
