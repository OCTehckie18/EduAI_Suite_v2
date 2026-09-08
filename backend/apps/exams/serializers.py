from rest_framework import serializers
from .models import Exam, ExamQuestion, ExamChoice, ExamAttempt, ExamAnswer


class ExamChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamChoice
        fields = ["id", "choice_text", "is_correct"]


class ExamQuestionSerializer(serializers.ModelSerializer):
    choices = ExamChoiceSerializer(many=True, required=False)

    class Meta:
        model = ExamQuestion
        fields = ["id", "question_text", "question_type", "points", "order", "choices"]


class ExamAnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.IntegerField(source="question.id", read_only=True)

    class Meta:
        model = ExamAnswer
        fields = ["id", "question_id", "selected_choice_id"]


class ExamAttemptSerializer(serializers.ModelSerializer):
    answers = ExamAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = ExamAttempt
        fields = ["id", "student_id", "score", "status", "start_time", "end_time", "answers"]


class ExamSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)
    questions = ExamQuestionSerializer(many=True, required=False)
    attempts = ExamAttemptSerializer(many=True, read_only=True)

    class Meta:
        model = Exam
        fields = [
            "id",
            "course_id",
            "title",
            "description",
            "time_limit",
            "attempts_allowed",
            "randomize_questions",
            "status",
            "created_at",
            "questions",
            "attempts",
        ]
