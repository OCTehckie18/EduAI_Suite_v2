"""The university's own words for the things the platform talks about (English only).

Stored in ``UniversityProfile.terms`` (JSON) as overrides of the defaults, so an empty setting means the words
the platform has always used. Screens read the full table from the public university payload; backend messages
(roster import errors, sign-in text, reports) use :func:`get`.
"""

# key: (label shown in Master Admin, group, singular, plural)
DEFAULT_TERMS = {
    "campus": ("Campus", "Structure", "Campus", "Campuses"),
    "school": ("School", "Structure", "School", "Schools"),
    "department": ("Department", "Structure", "Department", "Departments"),
    "program": ("Program", "Structure", "Program", "Programs"),
    "class": ("Class or batch", "Structure", "Class", "Classes"),
    "section": ("Section", "Structure", "Section", "Sections"),
    "student": ("Student", "People", "Student", "Students"),
    "teacher": ("Teacher", "People", "Teacher", "Teachers"),
    "master_admin": ("Master Admin", "People", "Master Admin", "Master Admins"),
    "register_no": ("Student ID", "Identifiers", "Register number", "Register numbers"),
    "employee_no": ("Staff ID", "Identifiers", "Employee number", "Employee numbers"),
    "classroom": ("Classroom", "Work", "Classroom", "Classrooms"),
    "exam": ("Exam", "Work", "Exam", "Exams"),
    "assignment": ("Assignment", "Work", "Assignment", "Assignments"),
}
MAX_LENGTH = 30
FORBIDDEN = set("<>{}") | {chr(92), chr(10), chr(13), chr(9)}


def defaults():
    return {key: {"singular": s, "plural": p} for key, (_label, _group, s, p) in DEFAULT_TERMS.items()}


def merged(stored):
    """The full table: the defaults with the university's overrides laid over them."""
    terms = defaults()
    if isinstance(stored, dict):
        for key, value in stored.items():
            if key in terms and isinstance(value, dict):
                for form in ("singular", "plural"):
                    if isinstance(value.get(form), str) and value[form].strip():
                        terms[key][form] = value[form].strip()
    return terms


def clean_terms(data, stored):
    """(overrides to store, errors). ``data`` is {key: {singular, plural}}; words equal to the default are not stored."""
    errors = {}
    if not isinstance(data, dict):
        return (stored if isinstance(stored, dict) else {}), {"terms": "Send the words as an object."}
    base = defaults()
    result = {}
    for key, value in data.items():
        if key not in base:
            errors[key] = "This is not a word the platform lets you change."
            continue
        if not isinstance(value, dict):
            errors[key] = "Give a singular and a plural form."
            continue
        row = {}
        for form in ("singular", "plural"):
            word = str(value.get(form) or "").strip() or base[key][form]
            if len(word) > MAX_LENGTH:
                errors[f"{key}.{form}"] = f"Keep this under {MAX_LENGTH} characters."
            elif FORBIDDEN & set(word):
                errors[f"{key}.{form}"] = "Use plain letters, digits and punctuation only."
            row[form] = word
        if row != base[key]:
            result[key] = row
    return result, errors


def public_terms(stored):
    return merged(stored)


def current():
    from . import cache

    return merged(cache.stored("terms"))


def get(key, plural=False, lower=False):
    """The university's word for ``key`` (for messages built on the server)."""
    word = current()[key]["plural" if plural else "singular"]
    return word.lower() if lower else word
