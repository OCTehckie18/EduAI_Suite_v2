"""The university's rules: exam integrity, sign-in, accounts and the risk score.

Stored in ``UniversityProfile.rules`` (JSON) but only through ``clean_rules``. Every value has a default equal to
how the platform behaved before these settings existed, so a university that never opens the Rules page sees no
change. Only a Master Admin can change them, and the server enforces them (not just the screens).
"""

import copy
import re

EXAM_EVENTS = ("tab_hidden", "window_blur", "fullscreen_exit", "page_unload")
EVENT_ACTIONS = ("end", "warn", "ignore")
SIGNIN_METHODS = ("both", "google", "password")
TEACHER_APPROVAL = ("roster_and_manual", "roster_only", "domain_auto")
RESET_BY = ("teachers", "admins")
DOMAIN = re.compile(r"^(?=.{1,100}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$")
MAX_DOMAINS = 20
MAX_RULES_TEXT = 2000

DEFAULT_RULES = {
    "exam": {
        "events": {event: "end" for event in EXAM_EVENTS},
        "warnings_allowed": 2,
        "rules_text": "",
        "reset_by": "teachers",
    },
    "signin": {"methods": "both", "allowed_domains": [], "session_minutes": 15},
    "accounts": {"teacher_approval": "roster_and_manual", "student_can_edit": {"name": True, "phone": True, "password": True}},
    "risk": {"safe_mark": 70, "floor_mark": 30, "weights": {"marks": 50, "missing": 25, "trend": 15, "integrity": 10}},
}


def merged(stored):
    """The stored rules laid over the defaults, keeping only known keys."""
    rules = copy.deepcopy(DEFAULT_RULES)
    stored = stored if isinstance(stored, dict) else {}

    def lay(target, source):
        for key, value in (source or {}).items() if isinstance(source, dict) else ():
            if key not in target:
                continue
            if isinstance(target[key], dict) and isinstance(value, dict):
                lay(target[key], value)
            else:
                target[key] = value

    lay(rules, stored)
    return rules


def _whole(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def clean_rules(data, stored):
    """(rules, errors): ``data`` validated and laid over the stored rules."""
    rules = merged(stored)
    errors = {}
    if not isinstance(data, dict):
        return rules, {"rules": "Send the rules as an object."}

    exam = data.get("exam")
    if isinstance(exam, dict):
        events = exam.get("events")
        if isinstance(events, dict):
            for event, action in events.items():
                if event not in EXAM_EVENTS:
                    errors[f"exam.events.{event}"] = "Unknown exam event."
                elif action not in EVENT_ACTIONS:
                    errors[f"exam.events.{event}"] = "Choose end, warn or ignore."
                else:
                    rules["exam"]["events"][event] = action
        if "warnings_allowed" in exam:
            if not _whole(exam["warnings_allowed"], 1, 10):
                errors["exam.warnings_allowed"] = "Allow between 1 and 10 warnings."
            else:
                rules["exam"]["warnings_allowed"] = exam["warnings_allowed"]
        if "rules_text" in exam:
            text = str(exam["rules_text"] or "").strip()
            if len(text) > MAX_RULES_TEXT:
                errors["exam.rules_text"] = f"Keep the rules under {MAX_RULES_TEXT} characters."
            else:
                rules["exam"]["rules_text"] = text
        if "reset_by" in exam:
            if exam["reset_by"] not in RESET_BY:
                errors["exam.reset_by"] = "Choose teachers or admins."
            else:
                rules["exam"]["reset_by"] = exam["reset_by"]

    signin = data.get("signin")
    if isinstance(signin, dict):
        if "methods" in signin:
            if signin["methods"] not in SIGNIN_METHODS:
                errors["signin.methods"] = "Choose Google, password or both."
            else:
                rules["signin"]["methods"] = signin["methods"]
        if "allowed_domains" in signin:
            raw = signin["allowed_domains"]
            if isinstance(raw, str):
                raw = re.split(r"[\s,;]+", raw)
            domains = []
            for item in raw if isinstance(raw, list) else []:
                domain = str(item or "").strip().lower().lstrip("@")
                if not domain:
                    continue
                if not DOMAIN.match(domain):
                    errors["signin.allowed_domains"] = f"'{domain}' is not a domain such as example.edu."
                    break
                if domain not in domains:
                    domains.append(domain)
            if len(domains) > MAX_DOMAINS:
                errors["signin.allowed_domains"] = f"List at most {MAX_DOMAINS} domains."
            if "signin.allowed_domains" not in errors:
                rules["signin"]["allowed_domains"] = domains
        if "session_minutes" in signin:
            if not _whole(signin["session_minutes"], 5, 120):
                errors["signin.session_minutes"] = "Sign people out after 5 to 120 minutes of inactivity."
            else:
                rules["signin"]["session_minutes"] = signin["session_minutes"]

    accounts = data.get("accounts")
    if isinstance(accounts, dict):
        if "teacher_approval" in accounts:
            if accounts["teacher_approval"] not in TEACHER_APPROVAL:
                errors["accounts.teacher_approval"] = "Choose how teachers are approved."
            else:
                rules["accounts"]["teacher_approval"] = accounts["teacher_approval"]
        edits = accounts.get("student_can_edit")
        if isinstance(edits, dict):
            for key, value in edits.items():
                if key not in DEFAULT_RULES["accounts"]["student_can_edit"] or not isinstance(value, bool):
                    errors[f"accounts.student_can_edit.{key}"] = "Use true or false."
                else:
                    rules["accounts"]["student_can_edit"][key] = value

    risk = data.get("risk")
    if isinstance(risk, dict):
        for key, low, high in (("safe_mark", 40, 100), ("floor_mark", 0, 80)):
            if key in risk:
                if not _whole(risk[key], low, high):
                    errors[f"risk.{key}"] = f"Use a whole number from {low} to {high}."
                else:
                    rules["risk"][key] = risk[key]
        weights = risk.get("weights")
        if isinstance(weights, dict):
            for key, value in weights.items():
                if key not in DEFAULT_RULES["risk"]["weights"] or not _whole(value, 0, 100):
                    errors[f"risk.weights.{key}"] = "Each weight is a whole number from 0 to 100."
                else:
                    rules["risk"]["weights"][key] = value
        if not errors.get("risk.safe_mark") and rules["risk"]["floor_mark"] >= rules["risk"]["safe_mark"]:
            errors["risk.floor_mark"] = "The mark that counts fully must be below the safe mark."
        if sum(rules["risk"]["weights"].values()) != 100:
            errors["risk.weights"] = "The four weights must add up to 100."

    if rules["signin"]["methods"] == "google" and not rules["signin"]["allowed_domains"] and "signin.methods" not in errors:
        pass  # allowed: Google only, any domain
    if rules["accounts"]["teacher_approval"] == "domain_auto" and not rules["signin"]["allowed_domains"]:
        errors["accounts.teacher_approval"] = "Approving teachers by domain needs at least one allowed sign-in domain."
    return rules, errors


def public_rules(stored):
    """The part of the rules the portals need before or right after sign-in. Risk settings stay private."""
    rules = merged(stored)
    return {"exam": rules["exam"], "signin": rules["signin"], "accounts": {"student_can_edit": rules["accounts"]["student_can_edit"]}}


def current():
    """The rules in force now (read fresh, one small query)."""
    from .models import UniversityProfile

    profile = UniversityProfile.objects.only("rules").filter(pk=1).first()
    return merged(profile.rules if profile else {})


def domain_allowed(email, domains):
    """Is ``email`` on one of the domains (or a subdomain of one)? An empty list allows every domain."""
    if not domains:
        return True
    host = (email or "").rsplit("@", 1)[-1].lower()
    return any(host == domain or host.endswith("." + domain) for domain in domains)
