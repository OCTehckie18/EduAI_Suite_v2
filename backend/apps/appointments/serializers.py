from rest_framework import serializers
from .models import Appointment


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "id",
            "student_name",
            "student_email",
            "teacher_name",
            "teacher_department",
            "meeting_mode",
            "time_slot",
            "agenda",
            "details",
            "rejection_reason",
            "status",
            "booked_by_teacher",
            "requested_at",
            "reviewed_at",
            "reviewed_by",
            "notes",
        ]
