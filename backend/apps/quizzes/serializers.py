from rest_framework import serializers
from .models import Quiz, QuizQuestion, QuizOption, QuizSession, QuizPlayer, QuizAnswer


class QuizOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizOption
        fields = ["id", "option_text", "is_correct", "color"]


class QuizQuestionSerializer(serializers.ModelSerializer):
    options = QuizOptionSerializer(many=True, required=False)

    class Meta:
        model = QuizQuestion
        fields = ["id", "question_text", "question_type", "image_url", "time_limit", "points", "order", "options"]


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, required=False)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ["id", "teacher_id", "title", "description", "cover_image", "is_draft", "is_public", "created_at", "question_count", "questions"]

    def get_question_count(self, obj):
        return len(obj.questions.all())


class QuizPlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizPlayer
        fields = ["id", "session_id", "student_id", "nickname", "avatar", "score", "streak"]


class QuizSessionSerializer(serializers.ModelSerializer):
    players = QuizPlayerSerializer(many=True, read_only=True)

    class Meta:
        model = QuizSession
        fields = ["id", "quiz_id", "pin", "is_test_run", "status", "current_question_index", "created_at", "started_at", "players"]
