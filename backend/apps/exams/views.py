from datetime import datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from .models import Exam, ExamQuestion, ExamChoice, ExamAttempt, ExamAnswer
from .serializers import ExamSerializer, ExamAttemptSerializer


class ExamStatsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        total_exams = Exam.objects.count()
        today = timezone.now().date()
        submissions_today = ExamAttempt.objects.filter(
            status="submitted",
            end_time__date=today
        ).count()
        total_attempts = ExamAttempt.objects.filter(status="submitted").count()

        return Response({
            "total_exams": total_exams,
            "submissions_today": submissions_today,
            "total_attempts": total_attempts,
            "avg_completion_rate": 100.0 if total_attempts > 0 else 0.0,
        })


class ExamListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        qs = Exam.objects.all().prefetch_related("questions__choices", "attempts")
        if course_id:
            qs = qs.filter(course_id=course_id)
        return Response(ExamSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        course_id = data.get("course_id")
        classroom = get_object_or_404(Classroom, pk=course_id)

        exam = Exam.objects.create(
            course=classroom,
            title=data.get("title", "Untitled Exam"),
            description=data.get("description", ""),
            time_limit=int(data.get("time_limit", 60)),
            attempts_allowed=int(data.get("attempts_allowed", 1)),
            randomize_questions=bool(data.get("randomize_questions", False)),
            status=data.get("status", "draft"),
        )

        questions_data = data.get("questions", [])
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

        return Response(ExamSerializer(exam).data, status=status.HTTP_201_CREATED)


class ExamDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, exam_id):
        exam = get_object_or_404(Exam.objects.prefetch_related("questions__choices", "attempts"), pk=exam_id)
        return Response(ExamSerializer(exam).data)

    def put(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        data = request.data

        for field in ["title", "description", "time_limit", "attempts_allowed", "randomize_questions", "status"]:
            if field in data:
                setattr(exam, field, data[field])
        exam.save()

        # Update questions if provided
        if "questions" in data:
            exam.questions.all().delete()
            for q_idx, q_data in enumerate(data["questions"]):
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

        return Response(ExamSerializer(exam).data)

    def delete(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        exam.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExamAttemptStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, exam_id):
        exam = get_object_or_404(Exam, pk=exam_id)
        student_id = request.data.get("student_id", 0)

        attempt = ExamAttempt.objects.create(
            exam=exam,
            student_id=student_id,
            status="in_progress",
        )

        return Response(ExamAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class ExamAttemptSubmitView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, exam_id, attempt_id):
        attempt = get_object_or_404(ExamAttempt, pk=attempt_id, exam_id=exam_id)
        answers_data = request.data.get("answers", [])

        # Evaluate score
        total_points = 0.0
        earned_points = 0.0

        for ans in answers_data:
            q_id = ans.get("question_id") or ans.get("question_int_id")
            selected_choice_id = ans.get("selected_choice_id")

            question = ExamQuestion.objects.filter(pk=q_id, exam_id=exam_id).first()
            if question:
                total_points += question.points
                ExamAnswer.objects.create(
                    attempt=attempt,
                    question=question,
                    selected_choice_id=selected_choice_id,
                )
                # Check if choice was correct
                if selected_choice_id:
                    choice = ExamChoice.objects.filter(pk=selected_choice_id, question=question).first()
                    if choice and choice.is_correct:
                        earned_points += question.points

        score_percent = round((earned_points / total_points * 100), 1) if total_points > 0 else 100.0
        attempt.score = score_percent
        attempt.status = "submitted"
        attempt.end_time = timezone.now()
        attempt.save()

        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, exam_id, attempt_id):
        attempt = get_object_or_404(ExamAttempt.objects.prefetch_related("answers"), pk=attempt_id, exam_id=exam_id)
        return Response(ExamAttemptSerializer(attempt).data)


class ExamAttemptListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, exam_id):
        attempts = ExamAttempt.objects.filter(exam_id=exam_id).prefetch_related("answers")
        return Response(ExamAttemptSerializer(attempts, many=True).data)
