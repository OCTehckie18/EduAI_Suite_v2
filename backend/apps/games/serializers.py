from rest_framework import serializers
from .models import ChainAnswerGame, GamePlayer, GameWord, GameQuestion


class GamePlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = GamePlayer
        fields = [
            "id",
            "student_id",
            "name",
            "join_order",
            "score",
            "words_submitted",
            "words_valid",
            "status",
        ]


class GameWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameWord
        fields = [
            "id",
            "word",
            "submitted_by",
            "submitted_at",
            "is_valid",
            "position",
            "validation_reason",
        ]


class GameQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameQuestion
        fields = ["id", "question_text", "order"]


class ChainAnswerGameSerializer(serializers.ModelSerializer):
    players = GamePlayerSerializer(many=True, read_only=True)
    words = GameWordSerializer(many=True, read_only=True)
    questions = GameQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = ChainAnswerGame
        fields = [
            "id",
            "session_id",
            "teacher_id",
            "name",
            "chain_variation",
            "category",
            "difficulty_level",
            "language",
            "subject",
            "status",
            "starting_word",
            "time_per_turn",
            "max_words",
            "ai_suggestions",
            "penalty_on_invalid",
            "penalty_type",
            "created_at",
            "started_at",
            "ended_at",
            "players",
            "words",
            "questions",
        ]
