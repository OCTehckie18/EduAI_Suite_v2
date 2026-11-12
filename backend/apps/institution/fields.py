"""Extra profile fields and ID formats the university defines (English only).

Stored in ``UniversityProfile.fields`` (JSON):

* ``id_formats``: for ``register_no`` and ``employee_no`` an optional pattern. In a pattern ``9`` is a digit,
  ``A`` a letter, ``X`` a letter or digit and any other character stands for itself, so ``99-AAA-9999``
  matches ``21-MCA-0042``. Only new or changed numbers are checked, so existing accounts are never locked out.
* ``custom``: up to ``MAX_FIELDS`` extra fields (text, number, date or choice) for students, teachers or both.
  People edit their own value in their profile (unless the field is admin-only); Master Admin can edit anyone's.
  Values live on ``User.extra`` by the field's key.

A register number can also be described part by part (``parts``), for example Christ's 2547237 is the year (25),
the program (47), the section (2) and the student's own number (37). The year must match the class's start year, the
program part a code the university gives each program (``program_codes``) and the section part a code per section name
(``section_codes``; a single letter section falls back to A=1, B=2 ...). A number that disagrees with the student's
placement is refused, naming what it should have been.

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
PART_KINDS = ("year", "program", "section", "serial", "fixed")
PART_LABEL = {"year": "year", "program": "program", "section": "section", "serial": "student number", "fixed": "fixed text"}
MAX_PARTS = 6
TOKENS = {"9": "digit", "A": "letter", "X": "letter or digit"}
EXAMPLE = {"digit": "7", "letter": "K", "letter or digit": "4"}
PLURAL = {"digit": "digits", "letter": "letters", "letter or digit": "letters or digits"}


def merged(stored):
    fields = {"id_formats": {key: {"pattern": ""} for key in ID_KEYS}, "custom": []}
    fields["id_formats"]["register_no"].update({"parts": [], "program_codes": {}, "section_codes": {}})
    if isinstance(stored, dict):
        formats = stored.get("id_formats")
        if isinstance(formats, dict):
            for key in ID_KEYS:
                if isinstance(formats.get(key), dict):
                    fields["id_formats"][key]["pattern"] = str(formats[key].get("pattern") or "")
            register = formats.get("register_no")
            if isinstance(register, dict):
                for name in ("parts", "program_codes", "section_codes"):
                    if isinstance(register.get(name), type(fields["id_formats"]["register_no"][name])):
                        fields["id_formats"]["register_no"][name] = register[name]
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


# ---- structured register numbers ------------------------------------------------

def roll_pattern(parts):
    """The shape of a structured number: digits for years and student numbers, letters or digits for the rest."""
    out = []
    for part in parts:
        if part["kind"] in ("year", "serial"):
            out.append("9" * part["length"])
        elif part["kind"] == "fixed":
            out.append(part["text"])
        else:
            out.append("X" * part["length"])
    return "".join(out)


def describe_structure(parts):
    names = []
    for part in parts:
        if part["kind"] == "fixed":
            names.append(f"'{part['text']}'")
        else:
            names.append(f"{part['length']} for the {PART_LABEL[part['kind']]}")
    sample = []
    for part in parts:
        sample.append(part["text"] if part["kind"] == "fixed" else ("77777777"[: part["length"]] if part["kind"] in ("year", "serial") else "K" * part["length"]))
    return {"description": ", ".join(names), "example": "".join(sample)}


def _clean_structure(raw, current):
    """(register_no config, problem). ``raw`` has parts, program_codes and section_codes."""
    from .models import Program

    parts_in = raw.get("parts")
    if not isinstance(parts_in, list) or len(parts_in) > MAX_PARTS:
        return None, f"Describe the number in up to {MAX_PARTS} parts."
    parts, kinds = [], set()
    for number, item in enumerate(parts_in, start=1):
        if not isinstance(item, dict) or item.get("kind") not in PART_KINDS:
            return None, f"Part {number}: choose year, program, section, student number or fixed text."
        kind = item["kind"]
        if kind in kinds and kind != "fixed":
            return None, f"The {PART_LABEL[kind]} appears twice."
        kinds.add(kind)
        if kind == "fixed":
            text = str(item.get("text") or "").strip()
            if not 1 <= len(text) <= 6 or not text.isalnum() or not text.isascii():
                return None, f"Part {number}: fixed text is 1 to 6 letters or digits."
            parts.append({"kind": kind, "length": len(text), "text": text})
            continue
        length = item.get("length")
        if isinstance(length, bool) or not isinstance(length, int) or not 1 <= length <= 6:
            return None, f"Part {number}: the length is from 1 to 6."
        if kind == "year" and length not in (2, 4):
            return None, "The year is 2 digits (25) or 4 digits (2025)."
        parts.append({"kind": kind, "length": length})
    if parts and sum(p["length"] for p in parts) > MAX_PATTERN:
        return None, "That number is too long."
    lengths = {p["kind"]: p["length"] for p in parts}

    program_codes = {}
    raw_programs = raw.get("program_codes", current["program_codes"])
    if not isinstance(raw_programs, dict):
        return None, "Send the program codes as an object."
    known = set(Program.objects.values_list("pk", flat=True))
    for key, code in raw_programs.items():
        code = str(code or "").strip()
        if not code:
            continue
        if not str(key).isdigit() or int(key) not in known:
            return None, "One of those programs does not exist."
        if "program" in lengths and len(code) != lengths["program"]:
            return None, f"A program code has {lengths['program']} characters, for example 47."
        if not code.isalnum() or not code.isascii():
            return None, "Program codes use letters and digits only."
        program_codes[str(key)] = code
    section_codes = {}
    raw_sections = raw.get("section_codes", current["section_codes"])
    if not isinstance(raw_sections, dict):
        return None, "Send the section codes as an object."
    for name, code in raw_sections.items():
        name, code = str(name).strip(), str(code or "").strip()
        if not name or not code:
            continue
        if "section" in lengths and len(code) != lengths["section"]:
            return None, f"A section code has {lengths['section']} characters, for example 2."
        if not code.isalnum() or not code.isascii():
            return None, "Section codes use letters and digits only."
        section_codes[name.lower()] = code
    pattern = roll_pattern(parts) if parts else str(raw.get("pattern") or "").strip()
    if not parts and pattern and (len(pattern) > MAX_PATTERN or not any(ch in TOKENS for ch in pattern)):
        return None, "Use 9 for a digit, A for a letter and X for a letter or digit, for example 9999999."
    config = {"pattern": pattern, "parts": parts, "program_codes": program_codes, "section_codes": section_codes}
    return config, None


def _section_code(section, codes):
    name = section.name.strip()
    if name.lower() in codes:
        return codes[name.lower()]
    if len(name) == 1 and name.isalpha() and name.isascii():
        return str(ord(name.upper()) - 64)
    return None


def check_register(value, section=None, stored=None):
    """An error for a register number that has the wrong shape, or whose year, program or section disagrees with ``section``."""
    value = str(value or "").strip()
    error = check_id("register_no", value, stored)
    if error or not value or section is None:
        return error
    stored = _current_raw() if stored is None else stored
    config = merged(stored)["id_formats"]["register_no"]
    if not config["parts"]:
        return None
    from . import terms

    start, problems, expected, position = 0, [], [], 0
    batch = section.batch
    for part in config["parts"]:
        chunk = value[position:position + part["length"]]
        position += part["length"]
        want = None
        if part["kind"] == "year":
            want = str(batch.start_year)[-part["length"]:]
            label = f"year {want} (the class started in {batch.start_year})"
        elif part["kind"] == "program":
            want = config["program_codes"].get(str(batch.program_id))
            label = f"program {want} ({batch.program.name})"
        elif part["kind"] == "section":
            want = _section_code(section, config["section_codes"])
            label = f"section {want} ({section.name})"
        elif part["kind"] == "fixed":
            want = part["text"]
            label = f"'{want}'"
        else:
            continue
        if want is None:
            continue  # the university has not given this program or section a code, so it cannot be checked
        if chunk != want:
            problems.append(label)
    if problems:
        return (f"'{value}' does not match this {terms.get('student', lower=True)}'s placement. "
                f"For {section.batch.program.name}, class {batch.name}, section {section.name}, the number should carry " + ", ".join(problems) + ".")
    return None


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
    if isinstance(formats, dict) and isinstance(formats.get("register_no"), dict) and "parts" in formats["register_no"]:
        register, problem = _clean_structure(formats["register_no"], fields["id_formats"]["register_no"])
        if problem:
            errors["id_formats.register_no"] = problem
        else:
            fields["id_formats"]["register_no"] = register
            formats = {key: value for key, value in formats.items() if key != "register_no"}
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
    formats = {}
    for key, value in fields["id_formats"].items():
        info = describe_structure(value["parts"]) if key == "register_no" and value["parts"] else describe(value["pattern"])
        formats[key] = {"pattern": value["pattern"], **info}
    return {"id_formats": formats, "custom": fields["custom"]}


def admin_fields(stored):
    """Everything the Master Admin screen edits: the public view plus the register number structure and the program list."""
    from .models import Program

    fields = merged(stored)
    programs = [{"id": p.pk, "label": f"{p.code} - {p.name}"} for p in Program.objects.order_by("code")]
    return {**public_fields(stored), "register_structure": {k: fields["id_formats"]["register_no"][k] for k in ("parts", "program_codes", "section_codes")}, "programs": programs}


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
