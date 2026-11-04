from django.shortcuts import get_object_or_404
from django.utils import timezone
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


def _save_questions(exam, questions_data):
    for q_idx, q_data in enumerate(questions_data):
        question = ExamQuestion.objects.create(
            exam=exam,
            question_text=q_data.get("question_text", ""),
            question_type=q_data.get("question_type", "mcq"),
            points=float(q_data.get("points", 1.0)),
            order=q_data.get("order", q_idx),
        )
        for c_data in q_data.get("choices", []):
            ExamChoice.objects.create(
                question=question,
                choice_text=c_data.get("choice_text", ""),
                is_correct=bool(c_data.get("is_correct", False)),
            )


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
        course_id = data.get("course_id")
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not _can_manage(request.user, classroom):
            return _forbidden()

        exam = Exam.objects.create(
            course=classroom,
            title=data.get("title", "Untitled Exam"),
            description=data.get("description", ""),
            time_limit=int(data.get("time_limit", 60)),
            attempts_allowed=int(data.get("attempts_allowed", 1)),
            randomize_questions=bool(data.get("randomize_questions", False)),
            status=data.get("status", "draft"),
        )
        _save_questions(exam, data.get("questions", []))

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
        return Response(ExamSerializer(exam, context=_exam_context(user)).data)

    def put(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        if not IsTeacher().has_permission(request, self) or not _can_manage(request.user, exam.course):
            return _forbidden()
        data = request.data

        for field in ["title", "description", "time_limit", "attempts_allowed", "randomize_questions", "status"]:
            if field in data:
                setattr(exam, field, data[field])
        exam.save()

        if "questions" in data:
            exam.questions.all().delete()
            _save_questions(exam, data["questions"])

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
        exam = get_object_or_404(Exam, pk=exam_id)
        user = request.user
        if not _is_student(user) or not _student_can_access(user, exam):
            return _forbidden()

        previous = ExamAttempt.objects.filter(exam=exam, student_id=user.pk)
        in_progress = previous.filter(status="in_progress").first()
        if in_progress:
            return Response(ExamAttemptSerializer(in_progress).data, status=status.HTTP_200_OK)
        if previous.count() >= exam.attempts_allowed:
            return Response({"detail": "No attempts remaining for this exam."}, status=status.HTTP_403_FORBIDDEN)

        attempt = ExamAttempt.objects.create(exam=exam, student_id=user.pk, status="in_progress")
        return Response(ExamAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class ExamAttemptSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id, attempt_id):
        attempt = get_object_or_404(ExamAttempt, pk=attempt_id, exam_id=exam_id)
        if attempt.student_id != request.user.pk:
            return _forbidden()
        if attempt.status != "in_progress":
            return Response({"detail": "This attempt has already been submitted."}, status=status.HTTP_409_CONFLICT)
        answers_data = request.data.get("answers", [])

        total_points = 0.0
        earned_points = 0.0
        answered = set()

        for ans in answers_data:
            q_id = ans.get("question_id") or ans.get("question_int_id")
            selected_choice_id = ans.get("selected_choice_id")

            question = ExamQuestion.objects.filter(pk=q_id, exam_id=exam_id).first()
            if question and question.pk not in answered:
                answered.add(question.pk)
                total_points += question.points
                ExamAnswer.objects.create(
                    attempt=attempt,
                    question=question,
                    selected_choice_id=selected_choice_id,
                )
                if selected_choice_id:
                    choice = ExamChoice.objects.filter(pk=selected_choice_id, question=question).first()
                    if choice and choice.is_correct:
                        earned_points += question.points

        score_percent = round((earned_points / total_points * 100), 1) if total_points > 0 else 100.0
        attempt.score = score_percent
        attempt.status = "submitted"
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

        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id, attempt_id):
        attempt = get_object_or_404(
            ExamAttempt.objects.select_related("exam__course").prefetch_related("answers"),
            pk=attempt_id, exam_id=exam_id,
        )
        user = request.user
        if attempt.student_id != user.pk and not _can_manage(user, attempt.exam.course):
            return _forbidden()
        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, exam_id):
        exam = get_object_or_404(Exam.objects.select_related("course"), pk=exam_id)
        if not _can_manage(request.user, exam.course):
            return _forbidden()
        attempts = ExamAttempt.objects.filter(exam_id=exam_id).prefetch_related("answers")
        return Response(ExamAttemptSerializer(attempts, many=True).data)
