from rest_framework import serializers
from .models import Assignment, Submission


class AssignmentSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id",
            "course_id",
            "title",
            "description",
            "due_date",
            "max_points",
            "media_path",
        ]


class SubmissionSerializer(serializers.ModelSerializer):
    assignment_id = serializers.IntegerField(source="assignment.id", read_only=True)
    student_id = serializers.IntegerField(read_only=True)
    max_points = serializers.IntegerField(source="assignment.max_points", read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment_id",
            "student_id",
            "student_name",
            "file_path",
            "submitted_at",
            "grade",
            "max_points",
        ]
