"""Modules a university can switch off.

A switched-off module disappears from the portals, and the server refuses its API (``ModuleSwitchMiddleware``),
so switching something off is real, not just hidden. Nothing is deleted: switching it back on brings every
record back. Every module is on until a Master Admin turns it off.
"""

import re

from django.http import JsonResponse

# key: (label, who uses it, what it is, API paths it owns)
MODULES = {
    "live_quizzes": ("Live quizzes", "Teachers and students", "Teachers host live quizzes; students join with a PIN.", (r"quizzes/",)),
    "chain_answer": ("Chain answer game", "Teachers and students", "A word-chain classroom game.", (r"games/chain-answer", r"games/word-suggestions")),
    "word_cloud": ("Word cloud", "Teachers and students", "Students send words that build a live word cloud.", (r"wordcloud/",)),
    "trello": ("Project boards", "Teachers and students", "Trello-style boards for group projects.", (r"trello/",)),
    "appointments": ("Appointments", "Teachers and students", "Students book meetings with teachers.", (r"appointments/",)),
    "forms": ("Forms", "Teachers and students", "Forms that students fill in and teachers collect.", (r"forms(/|$)",)),
    "mail": ("Mail students", "Teachers", "Teachers email their classes from TeacherBuddy.", (r"mail/",)),
    "reports": ("Reports", "Teachers", "Class and student reports to download.", (r"reports/",)),
    "omr": ("OMR answer sheets", "Teachers", "Scan printed answer sheets and mark them.", (r"omr/",)),
    "ai_assistant": ("AI assistant", "Teachers and students", "Chat with an AI about your classes.", (r"ai/",)),
    "ai_exam_tools": ("AI exam tools", "Teachers", "Read questions from a PDF or Word paper, and suggest marks for long answers.",
                      (r"exams/extract$", r"exams/\d+/attempts/\d+/suggest-mark$")),
    "google_calendar": ("Google Calendar sync", "Everyone", "Copy each person's EduAI calendar into their Google Calendar.", (r"calendar/google",)),
}

PREFIX = re.compile(r"^/(?:api/v1/api/|api/v1/|api/)?")
RULES = [(key, re.compile(pattern)) for key, (_, _, _, patterns) in MODULES.items() for pattern in patterns]


def module_states(stored):
    """{key: on?} for every module, with anything not stored switched on."""
    stored = stored if isinstance(stored, dict) else {}
    return {key: bool(stored.get(key, True)) for key in MODULES}


def module_catalog(stored):
    """The modules with their labels and current state, for the Master Admin page."""
    states = module_states(stored)
    return [{"key": key, "label": label, "audience": audience, "description": text, "enabled": states[key]}
            for key, (label, audience, text, _) in MODULES.items()]


def clean_modules(data, stored):
    """(states, errors): switch changes laid over the stored ones. Unknown modules are refused."""
    states = module_states(stored)
    if not isinstance(data, dict):
        return states, {"modules": "Send the modules as an object of on/off values."}
    errors = {}
    for key, value in data.items():
        if key not in MODULES:
            errors[key] = "There is no module with that name."
        elif not isinstance(value, bool):
            errors[key] = "Use true to switch it on or false to switch it off."
        else:
            states[key] = value
    return states, errors


def switched_off():
    """Keys of the modules that are off. Only asked for requests to a module's API (one small query)."""
    from . import cache

    return {key for key, on in module_states(cache.stored("modules")).items() if not on}


def forget_cache():
    """Drop the cached settings (switches are read through institution.cache)."""
    from . import cache

    cache.forget()


def module_for_path(path):
    rest = PREFIX.sub("", path, count=1)
    for key, rule in RULES:
        if rule.match(rest):
            return key
    return None


class ModuleSwitchMiddleware:
    """Refuse requests to a module the university switched off (a plain 404 with a clear reason)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = module_for_path(request.path)
        if key and request.method != "OPTIONS":
            try:
                off = switched_off()
            except Exception:  # the database is not ready (for example during migrations)
                off = set()
            if key in off:
                label = MODULES[key][0]
                return JsonResponse({"detail": f"{label} is switched off at this university.", "module": key}, status=404)
        return self.get_response(request)
