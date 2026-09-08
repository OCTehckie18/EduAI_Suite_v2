from rest_framework import serializers
from .models import CalendarEvent


class CalendarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEvent
        fields = [
            "id",
            "title",
            "description",
            "start_time",
            "end_time",
            "event_type",
            "color",
            "location",
            "is_all_day",
            "recurrence",
            "teacher_name",
            "student_email",
            "course_id",
            "google_event_id",
            "google_calendar_id",
            "created_at",
        ]
