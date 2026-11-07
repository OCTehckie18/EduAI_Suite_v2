"""Rubric grading.

A teacher defines a rubric on an assignment (lines that add up to its total marks),
then marks each submission line by line. The total is written to `Submission.grade`,
so the gradebook and the student's results use it with no extra step.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.access import can_manage_course, can_view_course
from apps.core.permissions import IsTeacher
from apps.core.services import notify, record_student_activity

from .models import Assignment, AssignmentCriterion, CriterionScore, Submission, SubmissionEvaluation

MAX_CRITERIA = 20


def _bad(message):
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


def _denied():
    return Response({"detail": "You do not have permission to do that for this course."}, status=status.HTTP_403_FORBIDDEN)


def _criteria_json(assignment):
    return [
        {"id": c.pk, "label": c.label, "description": c.description, "max_score": c.max_score}
        for c in assignment.criteria.all()
    ]


def _number(value):
    """A finite number from client input, else None. Booleans are not numbers here."""
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


class RubricView(APIView):
    def get(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_view_course(request.user, assignment.course):
            return _denied()
        return Response({"max_points": assignment.max_points, "criteria": _criteria_json(assignment)})

    def put(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if getattr(request.user, "role", "") != "TEACHER" or not can_manage_course(request.user, assignment.course):
            return _denied()
        rows = request.data.get("criteria")
        if not isinstance(rows, list) or len(rows) > MAX_CRITERIA:
            return _bad(f"Send a list of at most {MAX_CRITERIA} rubric lines.")
        clean = []
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                return _bad(f"Rubric line {index} is not valid.")
            label = (row.get("label") or "").strip() if isinstance(row.get("label"), str) else ""
            if not label:
                return _bad(f"Rubric line {index} needs a name.")
            points = _number(row.get("max_score"))
            if points is None or points != int(points) or points < 1:
                return _bad(f"Rubric line {index} needs whole marks of at least 1.")
            description = row.get("description") if isinstance(row.get("description"), str) else ""
            clean.append((label[:120], description.strip()[:255], int(points)))
        if clean and sum(p for _, _, p in clean) != assignment.max_points:
            return _bad(f"The rubric lines must add up to the assignment's {assignment.max_points} marks.")
        if SubmissionEvaluation.objects.filter(submission__assignment=assignment).exists():
            return Response(
                {"detail": "Some work is already marked with this rubric, so it can no longer be changed."},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            assignment.criteria.all().delete()
            for order, (label, description, points) in enumerate(clean):
                AssignmentCriterion.objects.create(
                    assignment=assignment, label=label, description=description, max_score=points, sort_order=order
                )
        return Response({"max_points": assignment.max_points, "criteria": _criteria_json(assignment)})


class EvaluationQueueView(APIView):
    """Everything handed in for one assignment, and whether it has been marked."""

    permission_classes = [IsTeacher]

    def get(self, request, assignment_id):
        assignment = get_object_or_404(Assignment.objects.select_related("course"), pk=assignment_id)
        if not can_manage_course(request.user, assignment.course):
            return _denied()
        marked = set(
            SubmissionEvaluation.objects.filter(submission__assignment=assignment).values_list("submission_id", flat=True)
        )
        return Response({
            "assignment": {"id": assignment.pk, "title": assignment.title, "max_points": assignment.max_points},
            "criteria": _criteria_json(assignment),
            "submissions": [
                {
                    "id": s.pk,
                    "student_name": s.student_name,
                    "submitted_at": s.submitted_at,
                    "file_path": s.file_path,
                    "grade": s.grade,
                    "evaluated": s.pk in marked,
                }
                for s in Submission.objects.filter(assignment=assignment).order_by("student_name", "id")
            ],
        })


def _evaluation_json(submission):
    evaluation = getattr(submission, "evaluation", None)
    scores = {s.criterion_id: s for s in evaluation.scores.all()} if evaluation else {}
    return {
        "submission": {
            "id": submission.pk,
            "student_name": submission.student_name,
            "submitted_at": submission.submitted_at,
            "file_path": submission.file_path,
            "grade": submission.grade,
        },
        "max_points": submission.assignment.max_points,
        "feedback": evaluation.feedback if evaluation else "",
        "evaluated": evaluation is not None,
        "criteria": [
            {
                **c,
                "score": scores[c["id"]].score if c["id"] in scores else None,
                "comment": scores[c["id"]].comment if c["id"] in scores else "",
            }
            for c in _criteria_json(submission.assignment)
        ],
    }


class SubmissionEvaluationView(APIView):
    permission_classes = [IsTeacher]

    def _submission(self, submission_id):
        return get_object_or_404(
            Submission.objects.select_related("assignment__course").prefetch_related("assignment__criteria"),
            pk=submission_id,
        )

    def get(self, request, submission_id):
        submission = self._submission(submission_id)
        if not can_manage_course(request.user, submission.assignment.course):
            return _denied()
        return Response(_evaluation_json(submission))

    def put(self, request, submission_id):
        submission = self._submission(submission_id)
        assignment = submission.assignment
        if not can_manage_course(request.user, assignment.course):
            return _denied()
        criteria = {c.pk: c for c in assignment.criteria.all()}
        if not criteria:
            return _bad("Set up a rubric for this assignment before marking.")
        rows = request.data.get("scores")
        if not isinstance(rows, list):
            return _bad("Send a score for every rubric line.")
        given = {}
        for row in rows:
            if not isinstance(row, dict):
                return _bad("A score is not valid.")
            try:
                criterion_id = int(row.get("criterion_id"))
            except (TypeError, ValueError):
                return _bad("A score names a rubric line that does not exist.")
            if criterion_id not in criteria:
                return _bad("A score names a rubric line that does not belong to this assignment.")
            if criterion_id in given:
                return _bad("A rubric line was scored twice.")
            score = _number(row.get("score"))
            maximum = criteria[criterion_id].max_score
            if score is None or score < 0 or score > maximum:
                return _bad(f"'{criteria[criterion_id].label}' must be scored between 0 and {maximum}.")
            comment = row.get("comment") if isinstance(row.get("comment"), str) else ""
            given[criterion_id] = (score, comment.strip()[:500])
        if set(given) != set(criteria):
            return _bad("Every rubric line needs a score.")
        feedback = request.data.get("feedback", "")
        if not isinstance(feedback, str) or len(feedback) > 5000:
            return _bad("Feedback must be text of at most 5000 characters.")

        total = round(sum(score for score, _ in given.values()), 2)
        with transaction.atomic():
            evaluation, _ = SubmissionEvaluation.objects.update_or_create(
                submission=submission,
                defaults={"evaluator": request.user, "feedback": feedback.strip(), "total": total},
            )
            evaluation.scores.all().delete()
            CriterionScore.objects.bulk_create([
                CriterionScore(evaluation=evaluation, criterion=criteria[cid], score=score, comment=comment)
                for cid, (score, comment) in given.items()
            ])
            submission.grade = total
            submission.save(update_fields=["grade"])
            if submission.student_id:
                record_student_activity(
                    student_id=submission.student_id,
                    activity_type="assignment",
                    source_id=assignment.pk,
                    title=assignment.title or "Assignment",
                    score=round(100 * total / assignment.max_points, 1) if assignment.max_points else None,
                    status="graded",
                )
                notify([submission.student_id], "grade", f"{assignment.title or 'Assignment'} was marked", f"{total} of {assignment.max_points}", "/classroom")
        submission = self._submission(submission_id)
        return Response(_evaluation_json(submission))


class MyEvaluationView(APIView):
    """A student reads the marking of their own work. Nobody else's."""

    def get(self, request, submission_id):
        submission = get_object_or_404(
            Submission.objects.select_related("assignment__course").prefetch_related("assignment__criteria"),
            pk=submission_id,
            student=request.user,
        )
        if not hasattr(submission, "evaluation"):
            return Response({"detail": "This work has not been marked with a rubric yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_evaluation_json(submission))
