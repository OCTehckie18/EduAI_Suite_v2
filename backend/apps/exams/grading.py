"""Question types beyond multiple choice: blank detection, answer matching and validation.

A fill-in-the-blanks question writes each blank as three or more underscores (``___``). It keeps one
list of accepted answers per blank. A student's answer is one line per blank, and the question is
worth full points only when every blank matches one of its accepted answers (ignoring case, extra
spaces and a trailing full stop).
"""

import re

BLANK = re.compile(r"_{3,}\d*")
MAX_ACCEPTED_PER_BLANK = 10
MAX_TEXT_ANSWER = 20000
MAX_WORD_LIMIT = 5000
MAX_GUIDE = 5000


def count_blanks(text):
    return len(BLANK.findall(text or ""))


def normalise(value):
    text = " ".join(str(value or "").split()).casefold()
    return text[:-1].rstrip() if text.endswith(".") else text


def blank_lines(text_answer, count):
    """The student's answer split into one entry per blank (missing ones are empty)."""
    lines = str(text_answer or "").split("\n")
    return [(lines[i] if i < len(lines) else "") for i in range(count)]


def fill_blank_is_correct(accepted_answers, text_answer):
    """True when every blank has an answer that matches one of its accepted answers."""
    if not accepted_answers:
        return False
    given = blank_lines(text_answer, len(accepted_answers))
    for options, value in zip(accepted_answers, given):
        wanted = {normalise(option) for option in options}
        if not normalise(value) or normalise(value) not in wanted:
            return False
    return True


def clean_accepted_answers(raw, blanks, label):
    """(cleaned, error): a list with one list of accepted answers per blank."""
    if not isinstance(raw, list) or not raw:
        return None, f"{label} needs accepted answers for each blank."
    if all(isinstance(item, str) for item in raw):
        raw = [raw]  # a single blank may be given as a flat list
    if len(raw) != blanks:
        return None, f"{label} has {blanks} blank{'s' if blanks != 1 else ''} but accepted answers for {len(raw)}."
    cleaned = []
    for position, options in enumerate(raw, start=1):
        if isinstance(options, str):
            options = [options]
        if not isinstance(options, list):
            return None, f"{label}: the accepted answers for blank {position} are not valid."
        values = []
        for option in options:
            text = str(option if option is not None else "").strip()
            if text and text not in values:
                values.append(text)
        if not 1 <= len(values) <= MAX_ACCEPTED_PER_BLANK:
            return None, f"{label}: blank {position} needs between 1 and {MAX_ACCEPTED_PER_BLANK} accepted answers."
        cleaned.append(values)
    return cleaned, None


def word_count(text):
    return len(str(text or "").split())
