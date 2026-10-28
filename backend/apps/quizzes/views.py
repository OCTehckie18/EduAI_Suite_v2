import random
import string
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..core.permissions import IsTeacher
from .models import Quiz, QuizQuestion, QuizOption, QuizSession, QuizPlayer, QuizAnswer
from .serializers import QuizSerializer, QuizSessionSerializer, QuizPlayerSerializer


def _generate_pin() -> str:
    return "".join(random.choices(string.digits, k=6))


def _managed_quizzes(user):
    if getattr(user, "role", "") in {"CAMPUS_ADMIN", "MASTER_ADMIN"}:
        return Quiz.objects.all()
    return Quiz.objects.filter(teacher_id=user.pk)


class QuizSessionListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        sessions = QuizSession.objects.filter(
            Q(quiz__in=_managed_quizzes(request.user))
            | Q(is_test_run=True, status__in=["lobby", "active"])
        ).select_related("quiz").prefetch_related("players")
        data = QuizSessionSerializer(sessions, many=True).data
        for session, item in zip(sessions, data):
            item["quiz_title"] = session.quiz.title
        return Response(data)


class QuizListCreateView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        quizzes = _managed_quizzes(request.user).prefetch_related("questions__options")
        return Response(QuizSerializer(quizzes, many=True).data)

    def post(self, request):
        data = request.data
        teacher_id = (
            data.get("teacher_id")
            if getattr(request.user, "role", "") in {"CAMPUS_ADMIN", "MASTER_ADMIN"}
            else request.user.pk
        )
        quiz = Quiz.objects.create(
            teacher_id=teacher_id,
            title=data.get("title", "Untitled Quiz"),
            description=data.get("description", ""),
            cover_image=data.get("cover_image"),
            is_draft=bool(data.get("is_draft", False)),
        )

        for q_idx, q_data in enumerate(data.get("questions", [])):
            question = QuizQuestion.objects.create(
                quiz=quiz,
                question_text=q_data.get("question_text", ""),
                question_type=q_data.get("question_type", "mcq"),
                image_url=q_data.get("image_url"),
                time_limit=int(q_data.get("time_limit", 20)),
                points=int(q_data.get("points", 1000)),
                order=q_data.get("order", q_idx),
            )
            for c_data in q_data.get("options", []):
                QuizOption.objects.create(
                    question=question,
                    option_text=c_data.get("option_text", ""),
                    is_correct=bool(c_data.get("is_correct", False)),
                    color=c_data.get("color"),
                )

        return Response(QuizSerializer(quiz).data, status=status.HTTP_201_CREATED)


class QuizDetailView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, quiz_id):
        quiz = get_object_or_404(
            _managed_quizzes(request.user).prefetch_related("questions__options"),
            pk=quiz_id,
        )
        return Response(QuizSerializer(quiz).data)

    def put(self, request, quiz_id):
        quiz = get_object_or_404(_managed_quizzes(request.user), pk=quiz_id)
        data = request.data

        for field in ["title", "description", "cover_image", "is_draft"]:
            if field in data:
                setattr(quiz, field, data[field])
        quiz.save()

        if "questions" in data:
            quiz.questions.all().delete()
            for q_idx, q_data in enumerate(data["questions"]):
                question = QuizQuestion.objects.create(
                    quiz=quiz,
                    question_text=q_data.get("question_text", ""),
                    question_type=q_data.get("question_type", "mcq"),
                    image_url=q_data.get("image_url"),
                    time_limit=int(q_data.get("time_limit", 20)),
                    points=int(q_data.get("points", 1000)),
                    order=q_data.get("order", q_idx),
                )
                for c_data in q_data.get("options", []):
                    QuizOption.objects.create(
                        question=question,
                        option_text=c_data.get("option_text", ""),
                        is_correct=bool(c_data.get("is_correct", False)),
                        color=c_data.get("color"),
                    )

        return Response(QuizSerializer(quiz).data)

    def delete(self, request, quiz_id):
        quiz = get_object_or_404(_managed_quizzes(request.user), pk=quiz_id)
        quiz.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuizHostView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, quiz_id):
        quiz = get_object_or_404(_managed_quizzes(request.user), pk=quiz_id)
        for _ in range(10):
            pin = _generate_pin()
            if QuizSession.objects.filter(pin=pin).exists():
                continue

            try:
                with transaction.atomic():
                    session = QuizSession.objects.create(
                        quiz=quiz,
                        pin=pin,
                        is_test_run=bool(request.data.get("is_test_run", False)),
                        status="lobby",
                    )
            except IntegrityError:
                continue

            return Response(
                QuizSessionSerializer(session).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {"detail": "Unable to allocate a unique game PIN. Try again."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class QuizSessionDetailView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, pin):
        session = get_object_or_404(
            QuizSession.objects.filter(
                quiz__in=_managed_quizzes(request.user)
            ).prefetch_related("players"),
            pin=pin,
        )
        return Response(QuizSessionSerializer(session).data)


class QuizSessionJoinView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pin):
        session = get_object_or_404(QuizSession, pin=pin)
        data = request.data
        nickname = data.get("nickname", "Player")

        player = QuizPlayer.objects.create(
            session=session,
            student_id=data.get("student_id"),
            nickname=nickname,
            avatar=data.get("avatar"),
        )
        return Response(QuizPlayerSerializer(player).data, status=status.HTTP_201_CREATED)


class QuizLeaderboardView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, pin):
        session = get_object_or_404(
            QuizSession.objects.filter(quiz__in=_managed_quizzes(request.user)),
            pin=pin,
        )
        players = session.players.order_by("-score")
        return Response(QuizPlayerSerializer(players, many=True).data)
