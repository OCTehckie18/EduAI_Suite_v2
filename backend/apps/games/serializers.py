from rest_framework import serializers
from .models import ChainAnswerGame, GamePlayer, GameWord, GameQuestion


class GamePlayerSerializer(serializers.ModelSerializer):
    # The account id, not the register number: classmates and the public never see register numbers.
    student_id = serializers.IntegerField(read_only=True)

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
    """The game as the teacher who owns it sees it. Pass ``context={"is_owner": False}`` for players:
    they get the same game without the teacher's AI suggestions."""

    teacher_id = serializers.IntegerField(read_only=True)
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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get("is_owner", True):
            data.pop("ai_suggestions", None)
        return data
