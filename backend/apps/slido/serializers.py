from rest_framework import serializers
from .models import (
    PresentationAssignment,
    PresentationSubmission,
    SubmissionInteraction,
    SlidoSession,
    SlidoPoll,
    PollResponse,
    SlidoQnA,
    QnAUpvote,
)


class PresentationAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresentationAssignment
        fields = [
            "id",
            "teacher_id",
            "course_id",
            "title",
            "description",
            "deadline",
            "status",
            "created_at",
            "updated_at",
        ]


class SubmissionInteractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionInteraction
        fields = [
            "id",
            "submission_id",
            "slide_number",
            "interaction_type",
            "config",
            "order_index",
            "created_at",
            "updated_at",
        ]


class PresentationSubmissionSerializer(serializers.ModelSerializer):
    interactions = SubmissionInteractionSerializer(many=True, read_only=True)

    class Meta:
        model = PresentationSubmission
        fields = [
            "id",
            "assignment_id",
            "student_id",
            "file_url",
            "file_name",
            "status",
            "submitted_at",
            "is_late",
            "grade",
            "teacher_feedback",
            "graded_at",
            "created_at",
            "updated_at",
            "interactions",
        ]


class SlidoSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlidoSession
        fields = [
            "id",
            "teacher_id",
            "assignment_id",
            "submission_id",
            "pin",
            "status",
            "active_view",
            "current_slide",
            "started_at",
            "ended_at",
            "created_at",
            "updated_at",
        ]


class SlidoPollSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlidoPoll
        fields = [
            "id",
            "session_id",
            "teacher_id",
            "question",
            "poll_type",
            "is_active",
            "total_responses",
            "created_at",
            "updated_at",
        ]


class PollResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PollResponse
        fields = [
            "id",
            "poll_id",
            "student_id",
            "option_text",
            "response_text",
            "response_value",
            "responded_at",
        ]


class SlidoQnASerializer(serializers.ModelSerializer):
    class Meta:
        model = SlidoQnA
        fields = [
            "id",
            "session_id",
            "student_id",
            "question_text",
            "is_anonymous",
            "upvotes",
            "is_answered",
            "teacher_answer",
            "answered_at",
            "created_at",
            "updated_at",
        ]
