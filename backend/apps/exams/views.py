import random
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom, Enrollment
from apps.core.permissions import IsTeacher
from apps.core.services import record_student_activity
from .models import Exam, ExamQuestion, ExamChoice, ExamAttempt, ExamAnswer
from .serializers import ExamSerializer, ExamAttemptSerializer

ADMIN_ROLES = {"MASTER_ADMIN"}
GRACE_SECONDS = 30  # allowance for network delay when a student's timer runs out
MAX_TIME_LIMIT_MINUTES = 600
MAX_ATTEMPTS_ALLOWED = 20
MAX_POINTS = 1000


def _is_admin(user):
    return getattr(user, "role", "") in ADMIN_ROLES or user.is_superuser


def _is_student(user):
    return getattr(user, "role", "") == "STUDENT"


def _can_manage(user, classroom):
    return _is_admin(user) or classroom.teacher_id == user.pk


def _student_can_access(user, exam):
    return exam.status == "published" and Enrollment.objects.filter(
        classroom=exam.course, student=user, is_active=True
    ).exists()


def _exam_context(user):
    if _is_student(user):
        return {"hide_answers": True, "attempts_for_student": user.pk}
    return {}


def _forbidden():
    return Response({"detail": "You do not have permission to perform this action."}, status=status.HTTP_403_FORBIDDEN)


def _bad(message, **extra):
    return Response({"detail": message, **extra}, status=status.HTTP_400_BAD_REQUEST)


def _whole_number(value, low, high, label):
    """An integer between ``low`` and ``high`` (inclusive) or a message saying what is wrong."""
    try:
        if isinstance(value, bool) or (isinstance(value, float) and not value.is_integer()):
            raise ValueError
        number = int(value)
    except (TypeError, ValueError):
        return None, f"{label} must be a whole number."
    if not low <= number <= high:
        return None, f"{label} must be between {low} and {high}."
    return number, None


def _clean_questions(raw):
    """Validate a list of question dicts; returns (cleaned, error)."""
    if not isinstance(raw, list):
        return None, "Questions must be a list."
    cleaned = []
    for index, item in enumerate(raw):
        label = f"Question {index + 1}"
        if not isinstance(item, dict):
            return None, f"{label} is not valid."
        text = str(item.get("question_text") or "").strip()
        if not text:
            return None, f"{label} needs question text."
        try:
            points = float(item.get("points", 1.0))
        except (TypeError, ValueError):
            return None, f"{label}: points must be a number."
        if not 0 < points <= MAX_POINTS:
            return None, f"{label}: points must be more than 0 and at most {MAX_POINTS}."
        choices = item.get("choices") or []
        if not isinstance(choices, list) or len(choices) < 2:
            return None, f"{label} needs at least two choices."
        clean_choices = []
        for choice in choices:
            choice_text = str((choice or {}).get("choice_text") or "").strip() if isinstance(choice, dict) else ""
            if not choice_text:
                return None, f"{label} has an empty choice."
            clean_choices.append({"choice_text": choice_text, "is_correct": bool(choice.get("is_correct", False))})
        if sum(c["is_correct"] for c in clean_choices) != 1:
            return None, f"{label} must have exactly one correct choice."
        cleaned.append({
            "question_text": text,
            "question_type": "mcq",
            "points": points,
            "order": item.get("order", index) if isinstance(item.get("order", index), int) else index,
            "choices": clean_choices,
        })
    return cleaned, None


def _clean_settings(data, partial):
    """Validate the exam-level fields present in ``data``; returns (cleaned, error)."""
    cleaned = {}
    if "title" in data or not partial:
        title = str(data.get("title") or "").strip() if "title" in data else "Untitled Exam"
        if not title:
            return None, "The exam needs a title."
        if len(title) > 255:
            return None, "The title is too long."
        cleaned["title"] = title
    if "description" in data:
        cleaned["description"] = str(data.get("description") or "")
    if "time_limit" in data or not partial:
        value, error = _whole_number(data.get("time_limit", 60), 1, MAX_TIME_LIMIT_MINUTES, "The time limit (minutes)")
        if error:
            return None, error
        cleaned["time_limit"] = value
    if "attempts_allowed" in data or not partial:
        value, error = _whole_number(data.get("attempts_allowed", 1), 1, MAX_ATTEMPTS_ALLOWED, "Attempts allowed")
        if error:
            return None, error
        cleaned["attempts_allowed"] = value
    if "randomize_questions" in data or not partial:
        cleaned["randomize_questions"] = bool(data.get("randomize_questions", False))
    for field, label in (("opens_at", "The opening time"), ("closes_at", "The closing time")):
        if field in data:
            raw = data.get(field)
            if raw in (None, ""):
                cleaned[field] = None
                continue
            parsed = parse_datetime(str(raw)) if isinstance(raw, str) else None
            if parsed is None:
                return None, f"{label} is not a valid date and time."
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            cleaned[field] = parsed
    if cleaned.get("opens_at") and cleaned.get("closes_at") and cleaned["closes_at"] <= cleaned["opens_at"]:
        return None, "The exam must close after it opens."
    if "status" in data or not partial:
        value = data.get("status", Exam.Status.DRAFT)
        if value not in Exam.Status.values:
            return None, f"Status must be one of: {', '.join(Exam.Status.values)}."
        cleaned["status"] = value
    return cleaned, None


def _save_questions(exam, questions):
    for q_idx, q_data in enumerate(questions):
        question = ExamQuestion.objects.create(
            exam=exam,
            question_text=q_data["question_text"],
            question_type=q_data["question_type"],
            points=q_data["points"],
            order=q_data.get("order", q_idx),
        )
        for c_data in q_data["choices"]:
            ExamChoice.objects.create(question=question, choice_text=c_data["choice_text"], is_correct=c_data["is_correct"])


# Why an attempt was ended. The exam player reports one of these keys when the student leaves the exam.
VIOLATIONS = {
    "tab_hidden": "Switched to another tab or opened a new tab or window",
    "window_blur": "Left the exam window (switched window or desktop)",
    "fullscreen_exit": "Exited full-screen mode",
    "page_unload": "Closed or refreshed the exam page",
}


def _finish(attempt, *, score, earned, total, final_status="submitted", flag_reason=""):
    attempt.flag_reason = flag_reason
    attempt.score = score
    attempt.earned_points = earned
    attempt.total_points = total
    attempt.status = final_status
    attempt.end_time = timezone.now()
    attempt.save()
    record_student_activity(
        student_id=attempt.student_id,
        activity_type="exam",
        source_id=attempt.id,
        title=attempt.exam.title or "Assessment",
        score=attempt.score,
        status=attempt.status,
        occurred_at=attempt.end_time,
    )


def _total_points(exam):
    return sum(q.points for q in exam.questions.all())


def _expire_if_overdue(attempt):
    """Close an attempt whose time ran out long ago (the student never handed it in): it scores 0."""
    if attempt.status == "in_progress" and attempt.expires_at and timezone.now() > attempt.expires_at + timedelta(seconds=GRACE_SECONDS):
        _finish(attempt, score=0.0, earned=0.0, total=_total_points(attempt.exam), final_status="expired")
        return True
    return False


class ExamStatsView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        exams = Exam.objects.all()
        attempts = ExamAttempt.objects.filter(status="submitted")
        if not _is_admin(request.user):
            exams = exams.filter(course__teacher=request.user)
            attempts = attempts.filter(exam__course__teacher=request.user)
        today = timezone.now().date()
        total_attempts = attempts.count()
        started = ExamAttempt.objects.all() if _is_admin(request.user) else ExamAttempt.objects.filter(exam__course__teacher=request.user)
        started_count = started.count()

        return Response({
            "total_exams": exams.count(),
            "submissions_today": attempts.filter(end_time__date=today).count(),
            "total_attempts": total_attempts,
            # Of the attempts students started, how many were handed in; None before anyone has started one.
            "avg_completion_rate": round(100 * total_attempts / started_count, 1) if started_count else None,
        })


class ExamListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        course_id = request.query_params.get("course_id")
        qs = Exam.objects.all().prefetch_related("questions__choices", "attempts")
        if _is_student(user):
            qs = qs.filter(
                status="published",
                course__enrollments__student=user,
                course__enrollments__is_active=True,
            ).distinct()
        elif not _is_admin(user):
            qs = qs.filter(course__teacher=user)
        if course_id:
            qs = qs.filter(course_id=course_id)
        return Response(ExamSerializer(qs, many=True, context=_exam_context(user)).data)

    def post(self, request):
        if not IsTeacher().has_permission(request, self):
            return _forbidden()
        data = request.data
        classroom = get_object_or_404(Classroom, pk=data.get("course_id"))
        if not _can_manage(request.user, classroom):
            return _forbidden()

        settings, error = _clean_settings(data, partial=False)
        if error:
            return _bad(error)
        questions, error = _clean_questions(data.get("questions", []))
        if error:
            return _bad(error)
        if settings["status"] == Exam.Status.PUBLISHED and not questions:
            return _bad("Add at least one question before publishing the exam.")

        with transaction.atomic():
            exam = Exam.objects.create(course=classroom, **settings)
            _save_questions(exam, questions)
        return Response(ExamSerializer(exam).data, status=status.HTTP_201_CREATED)


class ExamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id):
        exam = get_object_or_404(Exam.objects.prefetch_related("questions__choices", "attempts"), pk=exam_id)
        user = request.user
        if _is_student(user):
            if not _student_can_access(user, exam):
                return _forbidden()
        elif not _can_manage(user, exam.course):
            return _forbidden()
        data = ExamSerializer(exam, context=_exam_context(user)).data
        if _is_student(user) and exam.randomize_questions:
            # The same order every time this student opens the exam, but different between students.
            rng = random.Random(f"{user.pk}-{exam.pk}")
            questions = list(data["questions"])
            rng.shuffle(questions)
            for question in questions:
                rng.shuffle(question["choices"])
            data = {**data, "questions": questions}
        return Response(data)

    def put(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        if not IsTeacher().has_permission(request, self) or not _can_manage(request.user, exam.course):
            return _forbidden()
        data = request.data

        settings, error = _clean_settings(data, partial=True)
        if error:
            return _bad(error)
        questions = None
        if "questions" in data:
            if exam.attempts.exists():
                return Response(
                    {"detail": "Students have already attempted this exam, so its questions can no longer be changed."},
                    status=status.HTTP_409_CONFLICT,
                )
            questions, error = _clean_questions(data["questions"])
            if error:
                return _bad(error)
        publishing = settings.get("status") == Exam.Status.PUBLISHED
        if publishing and not (questions if questions is not None else exam.questions.exists()):
            return _bad("Add at least one question before publishing the exam.")

        with transaction.atomic():
            for field, value in settings.items():
                setattr(exam, field, value)
            exam.save()
            if questions is not None:
                exam.questions.all().delete()
                _save_questions(exam, questions)
        return Response(ExamSerializer(exam).data)

    def patch(self, request, exam_id):
        """Change only the status (publish, unpublish or close) without touching the questions."""
        exam = get_object_or_404(Exam, pk=exam_id)
        if not IsTeacher().has_permission(request, self) or not _can_manage(request.user, exam.course):
            return _forbidden()
        if "status" not in request.data:
            return _bad("Send the new status.")
        settings, error = _clean_settings({"status": request.data["status"]}, partial=True)
        if error:
            return _bad(error)
        if settings["status"] == Exam.Status.PUBLISHED and not exam.questions.exists():
            return _bad("Add at least one question before publishing the exam.")
        exam.status = settings["status"]
        exam.save(update_fields=["status"])
        return Response(ExamSerializer(exam).data)

    def delete(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        if not IsTeacher().has_permission(request, self) or not _can_manage(request.user, exam.course):
            return _forbidden()
        exam.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExamAttemptStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id):
        user = request.user
        with transaction.atomic():
            # Locking the exam row serialises concurrent starts, so a double click cannot create two attempts.
            exam = get_object_or_404(Exam.objects.select_for_update(), pk=exam_id)
            if not _is_student(user) or not _student_can_access(user, exam):
                return _forbidden()
            if not exam.questions.exists():
                return Response({"detail": "This exam has no questions yet."}, status=status.HTTP_409_CONFLICT)

            previous = list(ExamAttempt.objects.filter(exam=exam, student_id=user.pk).select_related("exam"))
            if any(a.status == "flagged" for a in previous):
                return Response(
                    {"detail": "You left the exam earlier and were flagged for cheating, so you cannot attempt it again."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            for attempt in previous:
                _expire_if_overdue(attempt)
            in_progress = next((a for a in previous if a.status == "in_progress"), None)
            if in_progress:
                return Response(ExamAttemptSerializer(in_progress).data, status=status.HTTP_200_OK)
            if len(previous) >= exam.attempts_allowed:
                return Response({"detail": "No attempts remaining for this exam."}, status=status.HTTP_403_FORBIDDEN)

            now = timezone.now()
            if exam.opens_at and now < exam.opens_at:
                return Response({"detail": f"This exam opens on {timezone.localtime(exam.opens_at):%d %b %Y, %H:%M}."}, status=status.HTTP_409_CONFLICT)
            if exam.closes_at and now > exam.closes_at:
                return Response({"detail": "This exam has closed."}, status=status.HTTP_409_CONFLICT)
            expires = now + timedelta(minutes=exam.time_limit)
            if exam.closes_at:
                expires = min(expires, exam.closes_at)  # a late starter gets only the time left in the window
            attempt = ExamAttempt.objects.create(exam=exam, student_id=user.pk, status="in_progress", expires_at=expires)
        return Response(ExamAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class ExamAttemptSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id, attempt_id):
        answers_data = request.data.get("answers", [])
        if not isinstance(answers_data, list):
            return _bad("Answers must be a list.")

        with transaction.atomic():
            attempt = get_object_or_404(ExamAttempt.objects.select_for_update().select_related("exam"), pk=attempt_id, exam_id=exam_id)
            if attempt.student_id != request.user.pk:
                return _forbidden()
            if attempt.status == "flagged":
                return Response({"detail": "This attempt was ended because you left the exam. It cannot be submitted."}, status=status.HTTP_409_CONFLICT)
            if attempt.status != "in_progress":
                return Response({"detail": "This attempt has already been submitted."}, status=status.HTTP_409_CONFLICT)
            if _expire_if_overdue(attempt):
                return Response(
                    {"detail": "The time limit has passed, so this attempt was closed without a score."},
                    status=status.HTTP_409_CONFLICT,
                )

            questions = {q.pk: q for q in attempt.exam.questions.prefetch_related("choices")}
            chosen = {}
            for ans in answers_data:
                if not isinstance(ans, dict):
                    return _bad("Each answer must be an object.")
                q_id = ans.get("question_id") or ans.get("question_int_id")
                question = questions.get(q_id) if isinstance(q_id, int) else None
                if question is None:
                    return _bad("An answer refers to a question that is not part of this exam.")
                if question.pk in chosen:
                    continue  # the first answer to a question counts
                selected = ans.get("selected_choice_id")
                if selected is not None and not any(c.pk == selected for c in question.choices.all()):
                    return _bad("An answer picks a choice that does not belong to its question.")
                chosen[question.pk] = selected

            total_points = 0.0
            earned_points = 0.0
            for question in questions.values():
                total_points += question.points
                selected = chosen.get(question.pk)
                ExamAnswer.objects.create(attempt=attempt, question=question, selected_choice_id=selected)
                if selected is not None and any(c.pk == selected and c.is_correct for c in question.choices.all()):
                    earned_points += question.points

            # Unanswered questions count in the total, so handing in a blank paper scores 0, not 100.
            score_percent = round(earned_points / total_points * 100, 1) if total_points > 0 else 0.0
            _finish(attempt, score=score_percent, earned=earned_points, total=total_points)

        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptViolationView(APIView):
    """The exam player reports that the student left the exam (tab, window, desktop or full screen).

    The attempt ends at once: it is marked ``flagged``, scores 0 and cannot be retaken. Reporting is
    idempotent, and a report that arrives after the exam was already handed in changes nothing.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id, attempt_id):
        kind = request.data.get("type")
        if kind not in VIOLATIONS:
            return _bad("Unknown violation type.")
        with transaction.atomic():
            attempt = get_object_or_404(ExamAttempt.objects.select_for_update().select_related("exam"), pk=attempt_id, exam_id=exam_id)
            if attempt.student_id != request.user.pk:
                return _forbidden()
            if attempt.status == "in_progress":
                _finish(attempt, score=0.0, earned=0.0, total=_total_points(attempt.exam), final_status="flagged", flag_reason=VIOLATIONS[kind])
        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id, attempt_id):
        attempt = get_object_or_404(
            ExamAttempt.objects.select_related("exam__course").prefetch_related("answers", "exam__questions__choices"),
            pk=attempt_id, exam_id=exam_id,
        )
        user = request.user
        manages = _can_manage(user, attempt.exam.course)
        if attempt.student_id != user.pk and not manages:
            return _forbidden()
        _expire_if_overdue(attempt)
        context = {"include_review": True, "viewer_manages": manages}
        return Response(ExamAttemptSerializer(attempt, context=context).data)


class ExamAttemptListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, exam_id):
        exam = get_object_or_404(Exam.objects.select_related("course"), pk=exam_id)
        if not _can_manage(request.user, exam.course):
            return _forbidden()
        attempts = ExamAttempt.objects.filter(exam_id=exam_id).select_related("exam").prefetch_related("answers")
        for attempt in attempts:
            _expire_if_overdue(attempt)
        return Response(ExamAttemptSerializer(attempts, many=True, context={"viewer_manages": True}).data)
