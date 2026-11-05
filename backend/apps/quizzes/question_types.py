"""The kinds of question a quiz can ask, how their definitions are checked and how answers are marked."""

MCQ = "mcq"
TRUE_FALSE = "true_false"
MULTI = "multi"
TYPED = "typed"

QUESTION_TYPES = (MCQ, TRUE_FALSE, MULTI, TYPED)
MAX_TYPED_LENGTH = 200


def normalise(text):
    """Typed answers match ignoring capital letters and extra spaces."""
    return " ".join(str(text or "").casefold().split())


def _whole_number(value, default):
    try:
        return int(value if value is not None else default)
    except (TypeError, ValueError):
        return None


def question_problem(q_data):
    """What is wrong with one question as the page sent it, in words for the teacher; None when it is fine."""
    qtype = q_data.get("question_type") or MCQ
    if qtype not in QUESTION_TYPES:
        return "has an unknown question type."
    if not str(q_data.get("question_text") or "").strip():
        return "has no question text."

    seconds = _whole_number(q_data.get("time_limit"), 20)
    points = _whole_number(q_data.get("points"), 1000)
    if seconds is None or not 5 <= seconds <= 120:
        return "needs a time limit between 5 and 120 seconds."
    if points is None or not 0 <= points <= 5000:
        return "needs points between 0 and 5000."

    options = [o for o in q_data.get("options") or [] if isinstance(o, dict)]
    texts = [str(o.get("option_text") or "").strip() for o in options]
    correct = [o for o in options if o.get("is_correct")]

    if qtype == TYPED:
        accepted = [normalise(t) for t, o in zip(texts, options) if t]
        if not accepted:
            return "needs at least one accepted answer."
        if any(len(t) > MAX_TYPED_LENGTH for t in texts):
            return f"has an accepted answer longer than {MAX_TYPED_LENGTH} characters."
        return None

    if qtype == TRUE_FALSE:
        if len(options) != 2:
            return "needs exactly two answers, True and False."
        if len(correct) != 1:
            return "needs exactly one correct answer."
        return None

    if not 2 <= len(options) <= 4:
        return "needs between 2 and 4 answers."
    if any(not t for t in texts):
        return "has an empty answer."
    if len({normalise(t) for t in texts}) != len(texts):
        return "has two answers that are the same."
    if qtype == MCQ and len(correct) != 1:
        return "needs exactly one correct answer."
    if qtype == MULTI and not correct:
        return "needs at least one correct answer."
    return None


def questions_problem(questions):
    for number, q_data in enumerate(questions or [], start=1):
        if not isinstance(q_data, dict):
            return f"Question {number} is not valid."
        problem = question_problem(q_data)
        if problem:
            return f"Question {number} {problem}"
    return None


def mark(question_type, options, payload):
    """Mark one answer. Returns (result, error) where result is
    {"is_correct", "selected_ids", "text"} and error is a message or None.

    ``options`` are the question's QuizOption rows; ``payload`` is what the player sent."""
    by_id = {o.id: o for o in options}
    invalid = (None, "Invalid answer payload.")

    if question_type == TYPED:
        text = payload.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TYPED_LENGTH:
            return invalid
        accepted = {normalise(o.option_text) for o in options if o.is_correct and o.option_text}
        return {"is_correct": normalise(text) in accepted, "selected_ids": [], "text": " ".join(text.split())}, None

    if question_type == MULTI:
        raw = payload.get("option_ids")
        if not isinstance(raw, list) or not raw or len(raw) > len(options):
            return invalid
        try:
            chosen = {int(v) for v in raw}
        except (TypeError, ValueError):
            return invalid
        if not chosen <= set(by_id):
            return None, "That answer is no longer available."
        right = {o.id for o in options if o.is_correct}
        # All or nothing: every correct answer and no wrong one.
        return {"is_correct": chosen == right, "selected_ids": sorted(chosen), "text": None}, None

    try:
        option_id = int(payload.get("option_id"))
    except (TypeError, ValueError):
        return invalid
    option = by_id.get(option_id)
    if option is None:
        return None, "That answer is no longer available."
    return {"is_correct": option.is_correct, "selected_ids": [option.id], "text": None}, None
