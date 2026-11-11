"""A teacher resets a student's attempt (a power cut, a crash, a wrongly flagged exam)."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import StudentActivity
from apps.core.permissions import IsTeacher
from apps.core.services import notify

from .models import Exam, ExamAttempt, ExamReset
from .paper import attempt_questions
from apps.institution import rules as university_rules

from .views import _bad, _can_manage, _forbidden, _is_admin

MAX_REASON = 500


def _snapshot(attempt):
    """Everything worth keeping about an attempt that is about to be deleted."""
    return {
        "attempt_id": attempt.pk,
        "status": attempt.status,
        "score": attempt.score,
        "earned_points": attempt.earned_points,
        "total_points": attempt.total_points,
        "flag_reason": attempt.flag_reason,
        "start_time": attempt.start_time.isoformat() if attempt.start_time else None,
        "end_time": attempt.end_time.isoformat() if attempt.end_time else None,
        "question_ids": [question.pk for question, _, _ in attempt_questions(attempt)],
        "answers": [
            {
                "question_id": a.question_id, "selected_choice_id": a.selected_choice_id, "text_answer": a.text_answer,
                "awarded_points": a.awarded_points, "feedback": a.feedback,
            }
            for a in attempt.answers.all()
        ],
    }


class ExamAttemptResetView(APIView):
    """Clear one finished attempt so the student can sit the exam again with a fresh set of questions."""

    permission_classes = [IsTeacher]

    def post(self, request, exam_id, attempt_id):
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return _bad("Give a reason for the reset. It is kept with the exam record.")
        if len(reason) > MAX_REASON:
            return _bad(f"The reason is too long (at most {MAX_REASON} characters).")
        allowed_until = None
        raw = request.data.get("allowed_until")
        if raw not in (None, ""):
            allowed_until = parse_datetime(str(raw)) if isinstance(raw, str) else None
            if allowed_until is None:
                return _bad("The deadline is not a valid date and time.")
            if timezone.is_naive(allowed_until):
                allowed_until = timezone.make_aware(allowed_until)
            if allowed_until <= timezone.now():
                return _bad("The deadline must be in the future.")

        with transaction.atomic():
            attempt = get_object_or_404(
                ExamAttempt.objects.select_for_update().select_related("exam__course"), pk=attempt_id, exam_id=exam_id
            )
            if not _can_manage(request.user, attempt.exam.course):
                return _forbidden()
            if university_rules.current()["exam"]["reset_by"] == "admins" and not _is_admin(request.user):
                return Response({"detail": "At this university only the administration can reset exam attempts."}, status=status.HTTP_403_FORBIDDEN)
            if attempt.status == "in_progress":
                return Response(
                    {"detail": "This attempt is still in progress. Reset it once the student has finished or been flagged."},
                    status=status.HTTP_409_CONFLICT,
                )
            exam, student_id = attempt.exam, attempt.student_id
            reset = ExamReset.objects.create(
                exam=exam, student_id=student_id, reset_by=request.user, reason=reason,
                allowed_until=allowed_until, snapshot=_snapshot(attempt),
            )
            StudentActivity.objects.filter(student_id=student_id, activity_type="exam", source_id=str(attempt.pk)).delete()
            attempt.delete()  # its answers and drawn questions go with it

        until = f" until {timezone.localtime(allowed_until):%d %b %Y, %H:%M}" if allowed_until else ""
        notify(
            [student_id], "exam", f"Your attempt at {exam.title or 'the exam'} was reset",
            f"Your teacher reset your attempt. You can take it again{until} with a new set of questions.", "/exams",
        )
        return Response(_reset_payload(reset), status=status.HTTP_201_CREATED)


def _reset_payload(reset, users=None):
    users = users if users is not None else {}
    User = get_user_model()
    for user_id in (reset.student_id, reset.reset_by_id):
        if user_id and user_id not in users:
            users[user_id] = User.all_objects.filter(pk=user_id).first()
    student, teacher = users.get(reset.student_id), users.get(reset.reset_by_id)
    snapshot = reset.snapshot or {}
    return {
        "id": reset.pk,
        "student_id": reset.student_id,
        "student_name": student.full_name if student else "",
        "student_email": student.email if student else "",
        "reset_by": teacher.full_name if teacher else "",
        "reason": reset.reason,
        "allowed_until": reset.allowed_until,
        "created_at": reset.created_at,
        "previous": {
            "status": snapshot.get("status"), "score": snapshot.get("score"), "flag_reason": snapshot.get("flag_reason", ""),
            "end_time": snapshot.get("end_time"),
        },
    }


class ExamResetListView(APIView):
    """The reset history of one exam, for its teacher."""

    permission_classes = [IsTeacher]

    def get(self, request, exam_id):
        exam = get_object_or_404(Exam.objects.select_related("course"), pk=exam_id)
        if not _can_manage(request.user, exam.course):
            return _forbidden()
        users = {}
        return Response([_reset_payload(reset, users) for reset in exam.resets.all()])
