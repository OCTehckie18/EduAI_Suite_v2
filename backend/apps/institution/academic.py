"""Grading scales and the academic calendar of the university.

Scores are always stored as percentages. A grading scale only changes how a percentage is *shown* (a letter,
grade points), so switching scale never rewrites history. The calendar settings (academic year start, term names,
time zone, date format, first day of the week) are shown in the portals and used for the university's time zone.
Everything defaults to how the platform behaved before these settings existed.
"""

import copy
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo, available_timezones

from django.utils import timezone

SCALES = ("percentage", "letters", "grade_points", "custom")
DATE_FORMATS = ("auto", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY")
WEEK_STARTS = ("sunday", "monday", "saturday")
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
LABEL = re.compile(r"^[A-Za-z0-9+\-\. ]{1,6}$")
MAX_BANDS = 12

# Ready-made scales: (lowest percentage, label, grade points)
LETTERS = [(90, "O", 10), (80, "A+", 9), (70, "A", 8), (60, "B+", 7), (55, "B", 6), (50, "C", 5), (40, "P", 4), (0, "F", 0)]
GRADE_POINTS = [(90, "10", 10), (80, "9", 9), (70, "8", 8), (60, "7", 7), (50, "6", 6), (45, "5", 5), (40, "4", 4), (0, "0", 0)]


def _bands(rows):
    return [{"min": low, "label": label, "points": points} for low, label, points in rows]


DEFAULT_ACADEMIC = {
    "grading": {"scale": "percentage", "pass_mark": 40, "custom_bands": _bands(LETTERS)},
    "calendar": {
        "year_start_month": 1, "term_name": "Semester", "terms_per_year": 2,
        "timezone": "Asia/Kolkata", "date_format": "auto", "week_starts": "sunday",
    },
}


def merged(stored):
    """The stored settings laid over the defaults, keeping only known keys."""
    academic = copy.deepcopy(DEFAULT_ACADEMIC)
    stored = stored if isinstance(stored, dict) else {}
    for group in ("grading", "calendar"):
        if isinstance(stored.get(group), dict):
            academic[group].update({k: v for k, v in stored[group].items() if k in academic[group]})
    return academic


def bands_for(grading):
    """The bands in force (highest first), or [] when percentages are shown as they are."""
    scale = grading.get("scale")
    if scale == "letters":
        return _bands(LETTERS)
    if scale == "grade_points":
        return _bands(GRADE_POINTS)
    if scale == "custom":
        return sorted(grading.get("custom_bands") or [], key=lambda b: -b["min"])
    return []


def grade_for(percent, grading):
    """{label, points, passed} for a percentage under the university's scale (label is None for plain percentages)."""
    if percent is None:
        return None
    passed = percent >= grading["pass_mark"]
    for band in bands_for(grading):
        if percent >= band["min"]:
            return {"label": band["label"], "points": band["points"], "passed": passed}
    return {"label": None, "points": None, "passed": passed}


def clean_academic(data, stored):
    """(academic, errors): ``data`` validated and laid over the stored settings."""
    academic = merged(stored)
    errors = {}
    if not isinstance(data, dict):
        return academic, {"academic": "Send the settings as an object."}

    grading = data.get("grading")
    if isinstance(grading, dict):
        if "scale" in grading:
            if grading["scale"] not in SCALES:
                errors["grading.scale"] = "Choose percentages, letter grades, grade points or your own bands."
            else:
                academic["grading"]["scale"] = grading["scale"]
        if "pass_mark" in grading:
            value = grading["pass_mark"]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
                errors["grading.pass_mark"] = "The pass mark is a percentage from 0 to 100."
            else:
                academic["grading"]["pass_mark"] = value
        if "custom_bands" in grading:
            rows, problem = _clean_bands(grading["custom_bands"])
            if problem:
                errors["grading.custom_bands"] = problem
            else:
                academic["grading"]["custom_bands"] = rows
    calendar = data.get("calendar")
    if isinstance(calendar, dict):
        if "year_start_month" in calendar:
            value = calendar["year_start_month"]
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 12:
                errors["calendar.year_start_month"] = "Choose a month from 1 to 12."
            else:
                academic["calendar"]["year_start_month"] = value
        if "term_name" in calendar:
            value = str(calendar["term_name"] or "").strip()
            if not 1 <= len(value) <= 20:
                errors["calendar.term_name"] = "Give the terms a name of up to 20 characters, such as Semester."
            else:
                academic["calendar"]["term_name"] = value
        if "terms_per_year" in calendar:
            value = calendar["terms_per_year"]
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 6:
                errors["calendar.terms_per_year"] = "A year has from 1 to 6 terms."
            elif 12 % value:
                errors["calendar.terms_per_year"] = "Choose a number of terms that divides the 12 months evenly: 1, 2, 3, 4 or 6."
            else:
                academic["calendar"]["terms_per_year"] = value
        if "timezone" in calendar:
            value = str(calendar["timezone"] or "").strip()
            if value not in available_timezones():
                errors["calendar.timezone"] = "Choose a time zone from the list, such as Asia/Kolkata."
            else:
                academic["calendar"]["timezone"] = value
        if "date_format" in calendar:
            if calendar["date_format"] not in DATE_FORMATS:
                errors["calendar.date_format"] = "Choose one of the listed date formats."
            else:
                academic["calendar"]["date_format"] = calendar["date_format"]
        if "week_starts" in calendar:
            if calendar["week_starts"] not in WEEK_STARTS:
                errors["calendar.week_starts"] = "Weeks start on Sunday, Monday or Saturday."
            else:
                academic["calendar"]["week_starts"] = calendar["week_starts"]
    return academic, errors


def _clean_bands(raw):
    if not isinstance(raw, list) or not 2 <= len(raw) <= MAX_BANDS:
        return None, f"Give between 2 and {MAX_BANDS} bands."
    rows, seen = [], set()
    for number, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            return None, f"Band {number} is not valid."
        low, label, points = item.get("min"), str(item.get("label") or "").strip(), item.get("points", 0)
        if isinstance(low, bool) or not isinstance(low, (int, float)) or not 0 <= low <= 100:
            return None, f"Band {number}: the lowest percentage is from 0 to 100."
        if not LABEL.match(label):
            return None, f"Band {number}: the grade is 1 to 6 letters, digits or + - ."
        if label.lower() in seen:
            return None, f"The grade '{label}' is used twice."
        if isinstance(points, bool) or not isinstance(points, (int, float)) or not 0 <= points <= 10:
            return None, f"Band {number}: grade points are from 0 to 10."
        seen.add(label.lower())
        rows.append({"min": low, "label": label, "points": points})
    rows.sort(key=lambda b: -b["min"])
    if rows[-1]["min"] != 0:
        return None, "The lowest band must start at 0% so every mark gets a grade."
    if len({b["min"] for b in rows}) != len(rows):
        return None, "Two bands start at the same percentage."
    return rows, None


def current_period(calendar, now=None):
    """{year_label, term_label} for today in the university's time zone."""
    now = now or timezone.now()
    local = now.astimezone(ZoneInfo(calendar["timezone"]))
    start = calendar["year_start_month"]
    first_year = local.year if local.month >= start else local.year - 1
    year_label = f"{first_year}" if start == 1 else f"{first_year}-{str(first_year + 1)[-2:]}"
    months_in = (local.month - start) % 12
    length = 12 // calendar["terms_per_year"]
    term = months_in // length + 1
    term_label = calendar["term_name"] if calendar["terms_per_year"] == 1 else f"{calendar['term_name']} {term}"
    return {"year_label": year_label, "term_label": term_label}


def public_academic(stored):
    """What every portal needs: how to show grades, and the calendar conventions."""
    academic = merged(stored)
    grading = academic["grading"]
    return {
        "grading": {"scale": grading["scale"], "pass_mark": grading["pass_mark"], "bands": bands_for(grading)},
        "calendar": academic["calendar"],
        "current": current_period(academic["calendar"]),
    }


def current():
    """The settings in force now (from the cached settings)."""
    from . import cache

    return merged(cache.stored("academic"))


def university_zone():
    return ZoneInfo(current()["calendar"]["timezone"])


class UniversityTimezoneMiddleware:
    """Show every time in the university's own time zone (set in Master Admin > Grading and calendar)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            timezone.activate(university_zone())
        except Exception:  # the database is not ready (for example during migrations)
            timezone.deactivate()
        try:
            return self.get_response(request)
        finally:
            timezone.deactivate()


# ---- holidays ---------------------------------------------------------------

def parse_holiday_date(value):
    """A date from a sheet cell: a real date, or text such as 2026-12-25 or 25/12/2026."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None
