"""Real marks-based figures. Every function returns ``None`` when there is nothing to base a number on,
so screens can say "Not recorded" instead of showing an invented value."""

from collections import defaultdict

from django.db.models import Sum

from .models import Submission


def _graded(student_ids=None, course_ids=None):
    qs = Submission.objects.filter(grade__isnull=False, student__isnull=False)
    if student_ids is not None:
        qs = qs.filter(student_id__in=student_ids)
    if course_ids is not None:
        qs = qs.filter(assignment__course_id__in=course_ids)
    return qs


def _percentage(earned, possible):
    return round(100 * earned / possible, 1) if possible else None


def average_by_student(student_ids, course_ids=None):
    """{student_id: percentage} over graded work only (earned / possible), for students who have any."""
    totals = defaultdict(lambda: [0.0, 0.0])
    for student_id, grade, max_points in _graded(student_ids, course_ids).values_list("student_id", "grade", "assignment__max_points"):
        totals[student_id][0] += grade
        totals[student_id][1] += max_points
    return {sid: _percentage(earned, possible) for sid, (earned, possible) in totals.items() if possible}


def average_for(student_id, course_ids=None):
    return average_by_student([student_id], course_ids).get(student_id)


def course_average(course_ids, student_ids=None):
    """One percentage for all graded work in the courses (optionally limited to some students)."""
    agg = _graded(student_ids, course_ids).aggregate(earned=Sum("grade"), possible=Sum("assignment__max_points"))
    return _percentage(agg["earned"] or 0, agg["possible"] or 0)


def averages_by_course(student_id, course_ids):
    """{course_id: percentage} for one student across several courses, in one query (graded work only)."""
    totals = defaultdict(lambda: [0.0, 0.0])
    for course_id, grade, max_points in _graded([student_id], course_ids).values_list("assignment__course_id", "grade", "assignment__max_points"):
        totals[course_id][0] += grade
        totals[course_id][1] += max_points
    return {cid: _percentage(earned, possible) for cid, (earned, possible) in totals.items() if possible}
