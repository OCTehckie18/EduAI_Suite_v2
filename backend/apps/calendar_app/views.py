from datetime import datetime
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.models import Assignment
from apps.exams.models import Exam
from apps.appointments.models import Appointment
from apps.lessons.models import Lesson
from .models import CalendarEvent
from .serializers import CalendarEventSerializer


class CalendarEventListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        events = []

        # 1. Custom Calendar Events
        for ev in CalendarEvent.objects.all():
            events.append({
                "id": f"event_{ev.id}",
                "int_id": ev.id,
                "title": ev.title,
                "description": ev.description,
                "start_time": ev.start_time.isoformat() if ev.start_time else None,
                "end_time": ev.end_time.isoformat() if ev.end_time else None,
                "event_type": ev.event_type or "custom",
                "color": ev.color or "#264796",
                "location": ev.location,
                "is_all_day": ev.is_all_day,
                "teacher_name": ev.teacher_name,
                "student_email": ev.student_email,
                "course_id": ev.course_id,
            })

        # 2. Assignments
        for a in Assignment.objects.select_related("course"):
            if a.due_date:
                events.append({
                    "id": f"assignment_{a.id}",
                    "int_id": a.id,
                    "title": f"Due: {a.title}",
                    "description": a.description,
                    "start_time": a.due_date,
                    "end_time": a.due_date,
                    "event_type": "assignment",
                    "color": "#e02424",
                    "course_id": a.course_id,
                })

        # 3. Exams
        for ex in Exam.objects.select_related("course"):
            events.append({
                "id": f"exam_{ex.id}",
                "int_id": ex.id,
                "title": f"Exam: {ex.title}",
                "description": ex.description,
                "start_time": ex.created_at.isoformat() if ex.created_at else None,
                "end_time": None,
                "event_type": "exam",
                "color": "#d97706",
                "course_id": ex.course_id,
            })

        # 4. Appointments
        for appt in Appointment.objects.all():
            events.append({
                "id": f"appointment_{appt.id}",
                "int_id": appt.id,
                "title": f"Meeting: {appt.agenda or appt.student_name}",
                "description": appt.details,
                "start_time": appt.time_slot,
                "end_time": None,
                "event_type": "appointment",
                "color": "#059669",
                "teacher_name": appt.teacher_name,
                "student_email": appt.student_email,
            })

        return Response(events)

    def post(self, request):
        data = request.data
        start_str = data.get("start_time")
        end_str = data.get("end_time")

        start_time = parse_datetime(start_str) if start_str else None
        end_time = parse_datetime(end_str) if end_str else None

        ev = CalendarEvent.objects.create(
            title=data.get("title", ""),
            description=data.get("description"),
            start_time=start_time,
            end_time=end_time,
            event_type=data.get("event_type", "custom"),
            color=data.get("color", "#264796"),
            location=data.get("location"),
            is_all_day=bool(data.get("is_all_day", False)),
            recurrence=data.get("recurrence"),
            teacher_name=data.get("teacher_name"),
            student_email=data.get("student_email"),
            course_id=data.get("course_id"),
        )
        return Response(CalendarEventSerializer(ev).data, status=status.HTTP_201_CREATED)


class CalendarEventDetailView(APIView):
    permission_classes = [AllowAny]

    def put(self, request, event_id):
        ev = get_object_or_404(CalendarEvent, pk=event_id)
        data = request.data

        if "title" in data:
            ev.title = data["title"]
        if "description" in data:
            ev.description = data["description"]
        if "start_time" in data and data["start_time"]:
            ev.start_time = parse_datetime(data["start_time"])
        if "end_time" in data and data["end_time"]:
            ev.end_time = parse_datetime(data["end_time"])
        if "event_type" in data:
            ev.event_type = data["event_type"]
        if "color" in data:
            ev.color = data["color"]
        if "location" in data:
            ev.location = data["location"]
        if "is_all_day" in data:
            ev.is_all_day = bool(data["is_all_day"])

        ev.save()
        return Response(CalendarEventSerializer(ev).data)

    def delete(self, request, event_id):
        ev = get_object_or_404(CalendarEvent, pk=event_id)
        ev.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleCalendarStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = getattr(request, "user", None)
        connected = bool(user and getattr(user, "google_refresh_token", None))
        synced = bool(user and getattr(user, "google_calendar_synced", False))
        return Response({"connected": connected, "synced": synced})
