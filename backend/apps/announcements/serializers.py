from rest_framework import serializers
from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)
    created_at = serializers.DateTimeField(format="iso-8601", read_only=True)

    class Meta:
        model = Announcement
        fields = [
            "id",
            "course_id",
            "title",
            "body",
            "time",
            "pinned",
            "attachment_path",
            "created_at",
        ]
