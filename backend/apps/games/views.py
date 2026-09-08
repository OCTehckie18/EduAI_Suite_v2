import json
import uuid
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from services.word_service import WordService
from .models import ChainAnswerGame, GamePlayer, GameWord, GameQuestion
from .serializers import ChainAnswerGameSerializer, GameWordSerializer, GamePlayerSerializer


class ChainAnswerGameListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        games = ChainAnswerGame.objects.all().prefetch_related("players", "words", "questions")
        return Response(ChainAnswerGameSerializer(games, many=True).data)

    def post(self, request):
        data = request.data
        session_id = f"game_{uuid.uuid4().hex[:8]}"

        subject = data.get("subject")
        difficulty = data.get("difficulty_level", "medium")
        chain_variation = data.get("chain_variation", "standard")
        starting_word = data.get("starting_word", "Apple")

        word_suggestions = None
        if subject:
            suggestions = WordService.generate_word_suggestions(
                subject=subject,
                difficulty=difficulty,
                count=5,
                chain_variation=chain_variation,
                starting_word=starting_word,
            )
            if suggestions:
                word_suggestions = json.dumps(suggestions)

        game = ChainAnswerGame.objects.create(
            session_id=session_id,
            teacher_id=data.get("teacher_id"),
            name=data.get("name", "New Game"),
            chain_variation=chain_variation,
            category=data.get("category"),
            difficulty_level=difficulty,
            language=data.get("language", "en"),
            subject=subject,
            status="setup",
            starting_word=starting_word,
            time_per_turn=int(data.get("time_per_turn", 30)),
            max_words=data.get("max_words"),
            ai_suggestions=word_suggestions,
            penalty_on_invalid=bool(data.get("penalty_on_invalid", False)),
            penalty_type=data.get("penalty_type"),
        )

        for idx, q_text in enumerate(data.get("questions", [])):
            GameQuestion.objects.create(game=game, question_text=q_text, order=idx)

        return Response(ChainAnswerGameSerializer(game).data, status=status.HTTP_201_CREATED)


class ChainAnswerGameDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, session_id):
        game = get_object_or_404(
            ChainAnswerGame.objects.prefetch_related("players", "words", "questions"),
            session_id=session_id
        )
        return Response(ChainAnswerGameSerializer(game).data)

    def put(self, request, session_id):
        game = get_object_or_404(ChainAnswerGame, session_id=session_id)
        data = request.data

        for field in ["name", "status", "starting_word", "time_per_turn", "max_words", "penalty_on_invalid", "penalty_type"]:
            if field in data:
                setattr(game, field, data[field])

        game.save()
        return Response(ChainAnswerGameSerializer(game).data)


class ChainAnswerGameJoinView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        game = get_object_or_404(ChainAnswerGame, session_id=session_id)
        data = request.data
        name = data.get("name", "Player")
        student_id = data.get("student_id")

        player = GamePlayer.objects.filter(game=game, name=name).first()
        if not player:
            join_order = game.players.count() + 1
            player = GamePlayer.objects.create(
                game=game,
                name=name,
                student_id=student_id,
                join_order=join_order,
            )

        return Response(GamePlayerSerializer(player).data, status=status.HTTP_201_CREATED)


class ChainAnswerGameStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        game = get_object_or_404(ChainAnswerGame, session_id=session_id)
        game.status = "active"
        game.started_at = timezone.now()
        game.save()

        # Add starting word
        if not game.words.exists():
            GameWord.objects.create(
                game=game,
                word=game.starting_word,
                submitted_by="system",
                is_valid=True,
                position=0,
                validation_reason="Starting word",
            )

        return Response(ChainAnswerGameSerializer(game).data)


class ChainAnswerGameEndView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        game = get_object_or_404(ChainAnswerGame, session_id=session_id)
        game.status = "completed"
        game.ended_at = timezone.now()
        game.save()
        return Response(ChainAnswerGameSerializer(game).data)


class ChainAnswerGameSubmitWordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        game = get_object_or_404(ChainAnswerGame, session_id=session_id)
        data = request.data
        word = data.get("word", "").strip()
        player_name = data.get("submitted_by", "Unknown")

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
            submitted_by=player_name,
            is_valid=val_result["is_valid"],
            position=pos,
            validation_reason=val_result["message"],
        )

        player = game.players.filter(name=player_name).first()
        if player:
            player.words_submitted += 1
            if val_result["is_valid"]:
                player.words_valid += 1
                player.score += 10.0
            elif game.penalty_on_invalid:
                player.score = max(0.0, player.score - 5.0)
            player.save()

        return Response({
            "word": GameWordSerializer(game_word).data,
            "validation": val_result,
        }, status=status.HTTP_201_CREATED)


class WordSuggestionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        subject = data.get("subject", "general")
        difficulty = data.get("difficulty_level", "medium")
        count = int(data.get("count", 5))
        chain_variation = data.get("chain_variation", "standard")
        starting_word = data.get("starting_word", "apple")

        suggestions = WordService.generate_word_suggestions(
            subject=subject,
            difficulty=difficulty,
            count=count,
            chain_variation=chain_variation,
            starting_word=starting_word,
        )
        return Response({"suggestions": suggestions})


class ValidateWordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        word = data.get("word", "")
        prev_word = data.get("previous_word", "")
        chain_variation = data.get("chain_variation", "standard")
        used_words = data.get("used_words", [])
        subject = data.get("subject")

        result = WordService.validate_word(
            word=word,
            previous_word=prev_word,
            chain_variation=chain_variation,
            used_words=used_words,
            subject=subject,
        )
        return Response(result)
