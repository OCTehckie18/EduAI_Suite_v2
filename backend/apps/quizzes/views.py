import random
import string
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Quiz, QuizQuestion, QuizOption, QuizSession, QuizPlayer, QuizAnswer
from .serializers import QuizSerializer, QuizSessionSerializer, QuizPlayerSerializer


def _generate_pin() -> str:
    return "".join(random.choices(string.digits, k=6))


class QuizListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        quizzes = Quiz.objects.all().prefetch_related("questions__options")
        return Response(QuizSerializer(quizzes, many=True).data)

    def post(self, request):
        data = request.data
        quiz = Quiz.objects.create(
            teacher_id=data.get("teacher_id"),
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
    permission_classes = [AllowAny]

    def get(self, request, quiz_id):
        quiz = get_object_or_404(Quiz.objects.prefetch_related("questions__options"), pk=quiz_id)
        return Response(QuizSerializer(quiz).data)

    def put(self, request, quiz_id):
        quiz = get_object_or_404(Quiz, pk=quiz_id)
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
        quiz = get_object_or_404(Quiz, pk=quiz_id)
        quiz.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuizHostView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, quiz_id):
        quiz = get_object_or_404(Quiz, pk=quiz_id)
        pin = _generate_pin()
        while QuizSession.objects.filter(pin=pin, status__in=["lobby", "active"]).exists():
            pin = _generate_pin()

        session = QuizSession.objects.create(
            quiz=quiz,
            pin=pin,
            status="lobby",
        )
        return Response(QuizSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class QuizSessionDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pin):
        session = get_object_or_404(QuizSession.objects.prefetch_related("players"), pin=pin)
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
    permission_classes = [AllowAny]

    def get(self, request, pin):
        session = get_object_or_404(QuizSession, pin=pin)
        players = session.players.order_by("-score")
        return Response(QuizPlayerSerializer(players, many=True).data)
