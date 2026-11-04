import json
import random
import string
import uuid
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from services.word_service import WordService
from apps.accounts.models import User
from apps.classrooms.models import Enrollment
from apps.core.access import is_master_admin, managed_courses
from apps.core.permissions import IsTeacher
from apps.core.services import record_student_activity, resolve_student
from .models import (
    ChainAnswerGame,
    GamePlayer,
    GameWord,
    GameQuestion,
    WordCloudSession,
)
from .serializers import ChainAnswerGameSerializer, GameWordSerializer, GamePlayerSerializer


VARIATIONS = ("standard", "compound", "ladder", "category")
MIN_TURN_SECONDS, MAX_TURN_SECONDS = 5, 300
MAX_WORD_LIMIT = 500


def _is_owner(user, game):
    return is_master_admin(user) or (game.teacher_id is not None and game.teacher_id == user.pk)


def _denied(message="You do not have permission to do that."):
    return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)


def _bad(message, **extra):
    return Response({"detail": message, **extra}, status=status.HTTP_400_BAD_REQUEST)


def _whole(value, low, high, label):
    try:
        if isinstance(value, bool) or (isinstance(value, float) and not value.is_integer()):
            raise ValueError
        number = int(value)
    except (TypeError, ValueError):
        return None, f"{label} must be a whole number."
    if not low <= number <= high:
        return None, f"{label} must be between {low} and {high}."
    return number, None


def _game_payload(game, user):
    return ChainAnswerGameSerializer(game, context={"is_owner": _is_owner(user, game)}).data


def _teacher_students(teacher):
    """Students enrolled in a course this teacher manages."""
    return User.objects.filter(
        role=User.Role.STUDENT,
        enrollments__is_active=True,
        enrollments__classroom__in=managed_courses(teacher),
    ).distinct()


def _clean_game_fields(data, *, partial):
    """Validate the settings present in ``data``; returns (cleaned, error)."""
    cleaned = {}
    if "name" in data or not partial:
        name = str(data.get("name") or "New Game").strip()
        if not name or len(name) > 255:
            return None, "The game needs a name of up to 255 characters."
        cleaned["name"] = name
    if "chain_variation" in data or not partial:
        variation = data.get("chain_variation", "standard")
        if variation not in VARIATIONS:
            return None, f"Game type must be one of: {', '.join(VARIATIONS)}."
        cleaned["chain_variation"] = variation
    if "starting_word" in data or not partial:
        word = str(data.get("starting_word") or "Apple").strip()
        if not word.isalpha() or not 2 <= len(word) <= 50:
            return None, "The starting word must be 2 to 50 letters."
        cleaned["starting_word"] = word
    if "time_per_turn" in data or not partial:
        value, error = _whole(data.get("time_per_turn", 30), MIN_TURN_SECONDS, MAX_TURN_SECONDS, "Time per turn (seconds)")
        if error:
            return None, error
        cleaned["time_per_turn"] = value
    if "max_words" in data:
        raw = data.get("max_words")
        if raw in (None, ""):
            cleaned["max_words"] = None
        else:
            value, error = _whole(raw, 1, MAX_WORD_LIMIT, "Word limit")
            if error:
                return None, error
            cleaned["max_words"] = value
    if "penalty_on_invalid" in data or not partial:
        cleaned["penalty_on_invalid"] = bool(data.get("penalty_on_invalid", False))
    if "penalty_type" in data:
        cleaned["penalty_type"] = (str(data.get("penalty_type") or "")[:50]) or None
    for field in ("category", "subject"):
        if field in data:
            value = str(data.get(field) or "").strip()[:100]
            cleaned[field] = value or None
    if "difficulty_level" in data:
        if data["difficulty_level"] not in ("easy", "medium", "hard"):
            return None, "Difficulty must be easy, medium or hard."
        cleaned["difficulty_level"] = data["difficulty_level"]
    if "language" in data:
        cleaned["language"] = str(data.get("language") or "en")[:20]
    return cleaned, None


class ChainAnswerGameListCreateView(APIView):
    """Teachers list and create their own games; students list the games they have joined."""

    def get(self, request):
        user = request.user
        games = ChainAnswerGame.objects.prefetch_related("players", "words", "questions")
        if is_master_admin(user):
            pass
        elif user.role == User.Role.TEACHER:
            games = games.filter(teacher=user)
        else:
            games = games.filter(players__student=user).distinct()
        return Response([_game_payload(game, user) for game in games])

    def post(self, request):
        if not IsTeacher().has_permission(request, self):
            return _denied("Only teachers can create games.")
        data = request.data
        cleaned, error = _clean_game_fields(data, partial=False)
        if error:
            return _bad(error)

        # Players are accounts, found by id; only students in this teacher's own classes may be added.
        allowed = _teacher_students(request.user)
        players, unknown = [], []
        for entry in data.get("players", []) or []:
            raw = entry.get("student_id") if isinstance(entry, dict) else entry
            student = resolve_student(raw)
            if student is None or not allowed.filter(pk=student.pk).exists():
                unknown.append(str(raw))
            elif student.pk not in [p.pk for p in players]:
                players.append(student)
        if unknown:
            return _bad("Some players are not students in your classes.", players=unknown)

        subject = cleaned.get("subject")
        word_suggestions = None
        if subject:
            suggestions = WordService.generate_word_suggestions(
                subject=subject,
                difficulty=cleaned.get("difficulty_level", "medium"),
                count=5,
                chain_variation=cleaned["chain_variation"],
                starting_word=cleaned["starting_word"],
            )
            if suggestions:
                word_suggestions = json.dumps(suggestions)

        with transaction.atomic():
            game = ChainAnswerGame.objects.create(
                session_id=f"game_{uuid.uuid4().hex[:8]}",
                teacher=request.user,
                status="setup",
                ai_suggestions=word_suggestions,
                **cleaned,
            )
            for order, student in enumerate(players, start=1):
                GamePlayer.objects.create(game=game, student=student, name=student.full_name, join_order=order)
            for idx, question_data in enumerate(data.get("questions", []) or []):
                text = question_data.get("question_text", "") if isinstance(question_data, dict) else str(question_data)
                if text.strip():
                    GameQuestion.objects.create(game=game, question_text=text.strip(), order=idx)

        return Response(_game_payload(game, request.user), status=status.HTTP_201_CREATED)


class WordCloudSessionListCreateView(APIView):

    def post(self, request):
        prompt = str(request.data.get("prompt", "")).strip()
        if not prompt:
            return Response(
                {"detail": "A prompt is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pin = "".join(random.choices(string.digits, k=6))
        while WordCloudSession.objects.filter(pin=pin).exists():
            pin = "".join(random.choices(string.digits, k=6))

        session = WordCloudSession.objects.create(
            pin=pin,
            prompt=prompt,
            teacher_id=request.data.get("teacher_id"),
        )
        return Response(
            {"pin": session.pin, "prompt": session.prompt, "session_id": session.id},
            status=status.HTTP_201_CREATED,
        )

    def get(self, request):
        sessions = WordCloudSession.objects.all()
        return Response([
            {
                "pin": session.pin,
                "prompt": session.prompt,
                "status": session.status,
                "session_id": session.id,
                "created_at": session.created_at,
            }
            for session in sessions
        ])


class WordCloudSessionDetailView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request, pin):
        session = get_object_or_404(WordCloudSession, pin=pin)
        return Response({
            "prompt": session.prompt,
            "status": session.status,
            "session_id": session.id,
        })

    def delete(self, request, pin):
        session = get_object_or_404(WordCloudSession, pin=pin)
        session.delete()
        return Response({"status": "success", "message": "Deleted successfully"})


def _get_game(session_id):
    return get_object_or_404(
        ChainAnswerGame.objects.prefetch_related("players", "words", "questions"), session_id=session_id
    )


def _my_player(game, user):
    return game.players.filter(student=user).first()


def _can_view(user, game):
    """The owner and admins; players of the game; and any student of the owning teacher (so they can open the join page)."""
    if _is_owner(user, game):
        return True
    if user.role != User.Role.STUDENT:
        return False
    if game.players.filter(student=user).exists():
        return True
    return game.teacher_id is not None and Enrollment.objects.filter(
        student=user, is_active=True, classroom__teacher_id=game.teacher_id
    ).exists()


class ChainAnswerGameDetailView(APIView):

    def get(self, request, session_id):
        game = _get_game(session_id)
        if not _can_view(request.user, game):
            return _denied("This game is not available to you.")
        return Response(_game_payload(game, request.user))

    def put(self, request, session_id):
        game = _get_game(session_id)
        if not _is_owner(request.user, game):
            return _denied("Only the teacher who created this game can change it.")
        if game.status != "setup":
            return Response({"detail": "A game that has started can no longer be edited."}, status=status.HTTP_409_CONFLICT)
        cleaned, error = _clean_game_fields(request.data, partial=True)
        if error:
            return _bad(error)
        for field, value in cleaned.items():
            setattr(game, field, value)
        game.save()
        return Response(_game_payload(game, request.user))

    def delete(self, request, session_id):
        game = _get_game(session_id)
        if not _is_owner(request.user, game):
            return _denied("Only the teacher who created this game can delete it.")
        game.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChainAnswerGameJoinView(APIView):
    """A student joins as themselves. Name and account come from the login, never from the request."""

    def post(self, request, session_id):
        user = request.user
        if user.role != User.Role.STUDENT:
            return _denied("Only students can join a game.")
        game = _get_game(session_id)
        if not _can_view(user, game):
            return _denied("This game is for another teacher's students.")
        if game.status == "completed":
            return Response({"detail": "This game has already finished."}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            locked = ChainAnswerGame.objects.select_for_update().get(pk=game.pk)
            player = GamePlayer.objects.filter(game=locked, student=user).first()
            created = player is None
            if created:
                player = GamePlayer.objects.create(
                    game=locked, student=user, name=user.full_name, join_order=locked.players.count() + 1
                )
        return Response(GamePlayerSerializer(player).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ChainAnswerGameStartView(APIView):

    def post(self, request, session_id):
        game = _get_game(session_id)
        if not _is_owner(request.user, game):
            return _denied("Only the teacher who created this game can start it.")
        if game.status == "completed":
            return Response({"detail": "This game has already finished."}, status=status.HTTP_409_CONFLICT)
        game.status = "active"
        game.started_at = game.started_at or timezone.now()
        game.save()

        if not game.words.exists():
            GameWord.objects.create(
                game=game,
                word=game.starting_word,
                submitted_by="system",
                is_valid=True,
                position=0,
                validation_reason="Starting word",
            )

        return Response(_game_payload(game, request.user))


class ChainAnswerGameEndView(APIView):

    def post(self, request, session_id):
        game = _get_game(session_id)
        if not _is_owner(request.user, game):
            return _denied("Only the teacher who created this game can end it.")
        game.status = "completed"
        game.ended_at = timezone.now()
        game.save()
        return Response(_game_payload(game, request.user))


class ChainAnswerGameSubmitWordView(APIView):
    """A player submits a word. Who they are comes from the login; the request body only carries the word."""

    def post(self, request, session_id):
        game = _get_game(session_id)
        player = _my_player(game, request.user)
        if player is None:
            return _denied("You are not a player in this game.")
        word = str(request.data.get("word") or "").strip()

        last_word_obj = game.words.order_by("-position").first()
        prev_word = last_word_obj.word if last_word_obj else game.starting_word
        used_words = list(game.words.values_list("word", flat=True))

        val_result = WordService.validate_word(
            word=word,
            previous_word=prev_word,
            chain_variation=game.chain_variation,
            used_words=used_words,
            subject=game.subject,
        )

        pos = game.words.count()
        game_word = GameWord.objects.create(
            game=game,
            word=word,
            submitted_by=player.name,
            is_valid=val_result["is_valid"],
            position=pos,
            validation_reason=val_result["message"],
        )

        player.words_submitted += 1
        if val_result["is_valid"]:
            player.words_valid += 1
            player.score += 10.0
        elif game.penalty_on_invalid:
            player.score = max(0.0, player.score - 5.0)
        player.save()

        record_student_activity(
            student_id=request.user.pk,
            activity_type="game",
            source_id=game.id,
            title=game.name or "Game Session",
            score=player.score,
            status=player.status,
        )

        return Response({
            "word": GameWordSerializer(game_word).data,
            "validation": val_result,
        }, status=status.HTTP_201_CREATED)


class WordSuggestionsView(APIView):

    def post(self, request):
        data = request.data
        subject = str(data.get("subject") or "general")[:100]
        difficulty = data.get("difficulty_level", "medium")
        count, error = _whole(data.get("count", 5), 1, 20, "Count")
        if error:
            return _bad(error)
        chain_variation = data.get("chain_variation", "standard")
        starting_word = str(data.get("starting_word") or "apple")[:50]

        suggestions = WordService.generate_word_suggestions(
            subject=subject,
            difficulty=difficulty,
            count=count,
            chain_variation=chain_variation,
            starting_word=starting_word,
        )
        return Response({"suggestions": suggestions})


class ValidateWordView(APIView):

    def post(self, request):
        data = request.data
        used = data.get("used_words", [])
        if not isinstance(used, list) or len(used) > 1000:
            return _bad("used_words must be a list.")
        result = WordService.validate_word(
            word=str(data.get("word") or "")[:100],
            previous_word=str(data.get("previous_word") or "")[:100],
            chain_variation=data.get("chain_variation", "standard"),
            used_words=[str(w)[:100] for w in used],
            subject=data.get("subject"),
        )
        return Response(result)
