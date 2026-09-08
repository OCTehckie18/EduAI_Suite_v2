from rest_framework import serializers
from .models import OMRJob, OMRSubmission


class OMRJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = OMRJob
        fields = ["id", "title", "answer_key", "created_at"]


class OMRSubmissionSerializer(serializers.ModelSerializer):
    job_id = serializers.IntegerField(source="job.id", read_only=True)

    class Meta:
        model = OMRSubmission
        fields = [
            "id",
            "job_id",
            "student_id",
            "image_url",
            "detected_answers",
            "score",
            "status",
            "created_at",
        ]
