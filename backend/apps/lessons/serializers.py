from rest_framework import serializers
from .models import Lesson


class LessonSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)

    class Meta:
        model = Lesson
        fields = [
            "id",
            "course_id",
            "title",
            "topic",
            "syllabus_context",
            "lecture_flow",
            "examples",
            "activities",
            "quiz_questions",
            "created_by",
            "posted_at",
            "created_at",
            "updated_at",
        ]
