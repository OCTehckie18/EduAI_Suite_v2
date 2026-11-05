import random
import secrets
import string
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..core.permissions import IsTeacher
from ..core.services import student_key
from .models import Quiz, QuizQuestion, QuizOption, QuizSession, QuizPlayer, QuizAnswer
from .report import build_report, report_csv
from .serializers import QuizSerializer, QuizSessionSerializer, QuizPlayerSerializer


def _generate_pin() -> str:
    return "".join(random.choices(string.digits, k=6))


def _managed_quizzes(user):
    if getattr(user, "role", "") in {"MASTER_ADMIN"}:
        return Quiz.objects.all()
    return Quiz.objects.filter(teacher_id=user.pk)


def _library_quizzes(user):
    """Public, published quizzes from other teachers, kept for reference."""
    return Quiz.objects.filter(is_public=True, is_draft=False).exclude(teacher_id=user.pk)


def _copy_questions(quiz, questions):
    for q_idx, q_data in enumerate(questions):
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


class QuestionInUse(Exception):
    pass


def _write_question(quiz, position, q_data, question=None):
    fields = {
        "question_text": q_data.get("question_text", ""),
        "question_type": q_data.get("question_type", "mcq"),
        "image_url": q_data.get("image_url"),
        "time_limit": int(q_data.get("time_limit", 20)),
        "points": int(q_data.get("points", 1000)),
        "order": position,
    }
    if question is None:
        question = QuizQuestion.objects.create(quiz=quiz, **fields)
    else:
        for name, value in fields.items():
            setattr(question, name, value)
        question.save()

    existing = {o.id: o for o in question.options.all()}
    kept = set()
    for c_data in q_data.get("options", []):
        values = {
            "option_text": c_data.get("option_text", ""),
            "is_correct": bool(c_data.get("is_correct", False)),
            "color": c_data.get("color"),
        }
        option = existing.get(c_data.get("id"))
        if option is None:
            QuizOption.objects.create(question=question, **values)
        else:
            for name, value in values.items():
                setattr(option, name, value)
            option.save()
            kept.add(option.id)
    question.options.exclude(id__in=kept).filter(id__in=existing).delete()


def _sync_questions(quiz, incoming):
    """Save an edited question list without losing what students already answered.

    Questions the page sends back with their id are updated in place, so their past answers stay
    attached. A question that is no longer in the list can only go if nobody has ever answered it."""
    current = {q.id: q for q in quiz.questions.all()}
    sent_ids = {q.get("id") for q in incoming if q.get("id") in current}
    for question_id, question in current.items():
        if question_id in sent_ids:
            continue
        if question.answers.exists():
            raise QuestionInUse(
                f"Question {question.order + 1} was answered in a past game, so it cannot be removed. "
                "Edit it instead, or copy the quiz and change the copy."
            )
    for question_id, question in current.items():
        if question_id not in sent_ids:
            question.delete()
    for position, q_data in enumerate(incoming):
        _write_question(quiz, position, q_data, current.get(q_data.get("id")))


class QuizSessionListView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        # Only games hosted from this teacher's own quizzes (test runs included).
        sessions = QuizSession.objects.filter(
            quiz__in=_managed_quizzes(request.user)
        ).select_related("quiz").prefetch_related("players")
        data = QuizSessionSerializer(sessions, many=True).data
        for session, item in zip(sessions, data):
            item["quiz_title"] = session.quiz.title
        return Response(data)


class QuizListCreateView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        if request.query_params.get("scope") == "library":
            quizzes = _library_quizzes(request.user)
        else:
            quizzes = _managed_quizzes(request.user)
        return Response(QuizSerializer(quizzes.prefetch_related("questions__options"), many=True).data)

    def post(self, request):
        data = request.data
        teacher_id = (
            data.get("teacher_id")
            if getattr(request.user, "role", "") in {"MASTER_ADMIN"}
            else request.user.pk
        )
        quiz = Quiz.objects.create(
            teacher_id=teacher_id,
            title=data.get("title", "Untitled Quiz"),
            description=data.get("description", ""),
            cover_image=data.get("cover_image"),
            is_draft=bool(data.get("is_draft", False)),
            is_public=bool(data.get("is_public", False)),
        )
        _copy_questions(quiz, data.get("questions", []))

        return Response(QuizSerializer(quiz).data, status=status.HTTP_201_CREATED)


class QuizDetailView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, quiz_id):
        visible = _managed_quizzes(request.user) | _library_quizzes(request.user)
        quiz = get_object_or_404(visible.prefetch_related("questions__options"), pk=quiz_id)
        return Response(QuizSerializer(quiz).data)

    def put(self, request, quiz_id):
        quiz = get_object_or_404(_managed_quizzes(request.user), pk=quiz_id)
        data = request.data

        for field in ["title", "description", "cover_image", "is_draft", "is_public"]:
            if field in data:
                setattr(quiz, field, data[field])
        quiz.save()

        if "questions" in data:
            if QuizSession.objects.filter(quiz=quiz, status__in=["active", "result"]).exists():
                return Response(
                    {"detail": "A game of this quiz is running right now. Finish or delete it before editing the questions."},
                    status=status.HTTP_409_CONFLICT,
                )
            try:
                with transaction.atomic():
                    _sync_questions(quiz, data["questions"])
            except QuestionInUse as problem:
                return Response({"detail": str(problem)}, status=status.HTTP_409_CONFLICT)

        return Response(QuizSerializer(quiz).data)

    def delete(self, request, quiz_id):
        quiz = get_object_or_404(_managed_quizzes(request.user), pk=quiz_id)
        quiz.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuizCloneView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, quiz_id):
        visible = _managed_quizzes(request.user) | _library_quizzes(request.user)
        source = get_object_or_404(visible.prefetch_related("questions__options"), pk=quiz_id)
        copy = Quiz.objects.create(
            teacher_id=request.user.pk,
            title=f"{source.title or 'Untitled Quiz'} (copy)",
            description=source.description,
            cover_image=source.cover_image,
            is_draft=True,
            is_public=False,
        )
        _copy_questions(copy, QuizSerializer(source).data["questions"])
        return Response(QuizSerializer(copy).data, status=status.HTTP_201_CREATED)


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

    def delete(self, request, pin):
        from ..core.models import StudentActivity

        session = get_object_or_404(QuizSession.objects.filter(quiz__in=_managed_quizzes(request.user)), pin=pin)
        with transaction.atomic():
            # The marks this game gave students go with it, so no result outlives its game.
            StudentActivity.objects.filter(activity_type="game", source_id=f"quiz:{session.pk}").delete()
            session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuizSessionReportView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, pin):
        session = get_object_or_404(
            QuizSession.objects.filter(quiz__in=_managed_quizzes(request.user)).select_related("quiz"), pin=pin)
        report = build_report(session)
        if request.query_params.get("export") == "csv":
            response = HttpResponse(report_csv(report), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="quiz-{session.pin}-results.csv"'
            return response
        return Response(report)


class QuizSessionJoinView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pin):
        session = get_object_or_404(QuizSession, pin=pin)
        if session.status == "completed":
            return Response({"detail": "This game has already finished."}, status=status.HTTP_409_CONFLICT)
        if session.lobby_locked:
            return Response({"detail": "The host has locked this game."}, status=status.HTTP_409_CONFLICT)
        data = request.data
        nickname = str(data.get("nickname") or "Player").strip()[:100] or "Player"

        # Identity comes only from a verified token; a client-supplied student_id is ignored.
        user = request.user
        student_id = student_key(user) if user.is_authenticated and getattr(user, "role", "") == "STUDENT" else None

        try:
            with transaction.atomic():
                player = QuizPlayer.objects.create(
                    session=session,
                    student_id=student_id,
                    nickname=nickname,
                    avatar=str(data.get("avatar") or "")[:255] or None,
                    token=secrets.token_urlsafe(24),
                )
        except IntegrityError:
            return Response({"detail": "That nickname is already taken in this session."}, status=status.HTTP_409_CONFLICT)
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
