"""Question pool, paper pattern and the paper each student sits.

An exam holds a pool of questions. Its ``pattern`` says how many questions of each (type, marks) group
make up one paper, for example 4 one-mark MCQs and 1 six-mark long answer. Every student's paper has
the same shape and the same total marks, but draws different questions where the pool allows it.
Without a pattern the paper is every question in the pool, as before.
"""

import random

from django.db.models import Count
from collections import Counter

from .models import AttemptQuestion, ExamAnswer, ExamAttempt, ExamQuestion, ExamReset

MAX_TOTAL_MARKS = 1000
TYPES = ExamQuestion.Type.values


class PoolTooSmall(Exception):
    """The pool cannot fill a section of the pattern."""


def marks_key(value):
    return round(float(value), 4)


def group_key(kind, marks):
    return (kind, marks_key(marks))


def pool_groups(questions):
    """Counts of questions by (type, marks), largest first by type order: [{type, marks, in_pool}]."""
    counts = Counter(group_key(q.question_type, q.points) for q in questions)
    order = {kind: i for i, kind in enumerate(TYPES)}
    return [
        {"type": kind, "marks": marks, "in_pool": count}
        for (kind, marks), count in sorted(counts.items(), key=lambda item: (order.get(item[0][0], 9), item[0][1]))
    ]


def paper_total(pattern, questions=None):
    """Total marks of one paper: the pattern's sections, or the whole pool when there is no pattern."""
    if pattern:
        return round(sum(float(s["marks"]) * int(s["count"]) for s in pattern), 4)
    return round(sum(q.points for q in (questions or [])), 4)


def clean_pattern(raw):
    """(cleaned, error). Each section is {type, marks, count}; one section per (type, marks)."""
    if raw in (None, ""):
        return [], None
    if not isinstance(raw, list):
        return None, "The paper pattern must be a list."
    cleaned, seen = [], set()
    for number, item in enumerate(raw, start=1):
        label = f"Pattern row {number}"
        if not isinstance(item, dict):
            return None, f"{label} is not valid."
        kind = item.get("type")
        if kind not in TYPES:
            return None, f"{label}: the type must be one of {', '.join(TYPES)}."
        try:
            marks = float(item.get("marks"))
        except (TypeError, ValueError):
            return None, f"{label}: marks must be a number."
        if not 0 < marks <= MAX_TOTAL_MARKS:
            return None, f"{label}: marks must be more than 0 and at most {MAX_TOTAL_MARKS}."
        count = item.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 1:
            return None, f"{label}: how many to draw must be a whole number of at least 1."
        key = group_key(kind, marks)
        if key in seen:
            return None, f"{label} repeats a type and mark value that is already listed."
        seen.add(key)
        cleaned.append({"type": kind, "marks": marks_key(marks), "count": count})
    if paper_total(cleaned) > MAX_TOTAL_MARKS:
        return None, f"A paper can be worth at most {MAX_TOTAL_MARKS} marks in total."
    return cleaned, None


def pattern_shortfalls(pattern, questions):
    """Messages for sections the pool cannot fill (empty when the pool is big enough)."""
    have = {(g["type"], g["marks"]): g["in_pool"] for g in pool_groups(questions)}
    labels = dict(ExamQuestion.Type.choices)
    problems = []
    for section in pattern:
        available = have.get(group_key(section["type"], section["marks"]), 0)
        if available < section["count"]:
            problems.append(
                f"{labels[section['type']]} worth {section['marks']:g} mark(s): the pattern draws {section['count']} "
                f"but the pool has {available}."
            )
    return problems


def seen_question_ids(exam, student_id, exclude_attempt_id=None):
    """Questions this student has already been given on this exam (earlier attempts, and later resets)."""
    attempts = ExamAttempt.objects.filter(exam=exam, student_id=student_id)
    if exclude_attempt_id:
        attempts = attempts.exclude(pk=exclude_attempt_id)
    ids = set(AttemptQuestion.objects.filter(attempt__in=attempts).values_list("question_id", flat=True))
    ids |= set(ExamAnswer.objects.filter(attempt__in=attempts).values_list("question_id", flat=True))
    # Attempts a teacher reset are gone, but their questions were still seen: a reset must bring fresh ones.
    for snapshot in ExamReset.objects.filter(exam=exam, student_id=student_id).values_list("snapshot", flat=True):
        ids |= set((snapshot or {}).get("question_ids", []))
    return ids


def draw_paper(attempt):
    """Pick and order this attempt's questions and store them. Call inside the start transaction."""
    exam = attempt.exam
    pool = list(exam.questions.prefetch_related("choices"))
    rng = random.Random(f"{attempt.pk}-{exam.pk}")  # the attempt id, so a new attempt gets a new order
    if exam.pattern:
        seen = seen_question_ids(exam, attempt.student_id, exclude_attempt_id=attempt.pk)
        # How often each question has been given, counted by the database instead of loading every drawn row.
        usage = Counter(dict(AttemptQuestion.objects.filter(attempt__exam=exam).values_list("question_id").annotate(times=Count("id"))))
        chosen = []
        for section in exam.pattern:
            wanted = group_key(section["type"], section["marks"])
            group = [q for q in pool if group_key(q.question_type, q.points) == wanted]
            if len(group) < section["count"]:
                raise PoolTooSmall()
            rng.shuffle(group)  # ties are broken at random
            group.sort(key=lambda q: (q.pk in seen, usage[q.pk]))  # never seen first, then least used
            chosen.extend(group[: section["count"]])
    else:
        chosen = sorted(pool, key=lambda q: (q.order, q.pk))
    if exam.randomize_questions:
        rng.shuffle(chosen)
    rows = []
    for position, question in enumerate(chosen):
        choices = sorted(question.choices.all(), key=lambda c: c.pk)
        if exam.randomize_questions:
            rng.shuffle(choices)
        rows.append(AttemptQuestion(
            attempt=attempt, question=question, position=position, points=question.points,
            choice_order=[c.pk for c in choices],
        ))
    AttemptQuestion.objects.bulk_create(rows)
    return rows


def paper_rows(attempt):
    """The attempt's drawn questions, or None for an attempt made before papers were drawn."""
    rows = list(attempt.paper.select_related("question").prefetch_related("question__choices"))
    return rows or None


def attempt_questions(attempt):
    """[(question, points, ordered choices)] for the attempt: its paper, else every question of the exam."""
    rows = paper_rows(attempt)
    if rows is None:
        return [(q, q.points, sorted(q.choices.all(), key=lambda c: c.pk)) for q in attempt.exam.questions.prefetch_related("choices")]
    result = []
    for row in rows:
        by_id = {c.pk: c for c in row.question.choices.all()}
        ordered = [by_id[i] for i in row.choice_order if i in by_id]
        ordered += [c for c in row.question.choices.all() if c.pk not in set(row.choice_order)]
        result.append((row.question, row.points, ordered))
    return result


def attempt_points(attempt):
    """{question_id: points} for the attempt (drawn points, so later edits never change a finished paper)."""
    return {question.pk: points for question, points, _ in attempt_questions(attempt)}


def attempt_total(attempt):
    return sum(attempt_points(attempt).values())
