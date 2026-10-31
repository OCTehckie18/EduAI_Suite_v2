from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .feed import (
    build_feed,
    can_edit_event,
    course_ids_for,
    custom_events_for,
    tomorrow_notifications,
)
from .models import CalendarEvent
from .serializers import CalendarEventSerializer


class CalendarEventListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_feed(request.user))

    def post(self, request):
        user = request.user
        data = request.data
        role = getattr(user, "role", "")

        # Only attach an event to a class the requester actually teaches, so a
        # student (or another teacher) cannot publish into someone else's class.
        course_id = data.get("course_id")
        allowed = course_ids_for(user)
        if role == "STUDENT" or (allowed is not None and course_id not in allowed):
            course_id = None

        start_str = data.get("start_time")
        end_str = data.get("end_time")
        ev = CalendarEvent.objects.create(
            created_by=user,
            title=data.get("title", ""),
            description=data.get("description"),
            start_time=parse_datetime(start_str) if start_str else None,
            end_time=parse_datetime(end_str) if end_str else None,
            event_type=data.get("event_type", "custom"),
            color=data.get("color", "#264796"),
            location=data.get("location"),
            is_all_day=bool(data.get("is_all_day", False)),
            recurrence=data.get("recurrence"),
            teacher_name=data.get("teacher_name") or (user.full_name if role != "STUDENT" else None),
            student_email=(user.email if role == "STUDENT" else data.get("student_email")),
            course_id=course_id,
        )
        return Response(CalendarEventSerializer(ev).data, status=status.HTTP_201_CREATED)


class CalendarEventDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_editable(self, request, event_id):
        ev = get_object_or_404(custom_events_for(request.user, course_ids_for(request.user)), pk=event_id)
        if not can_edit_event(request.user, ev):
            return None
        return ev

    def put(self, request, event_id):
        ev = self._get_editable(request, event_id)
        if ev is None:
            return Response({"detail": "You can only change your own events."}, status=status.HTTP_403_FORBIDDEN)
        data = request.data

        for field in ("title", "description", "event_type", "color", "location"):
            if field in data:
                setattr(ev, field, data[field])
        for field in ("start_time", "end_time"):
            if data.get(field):
                setattr(ev, field, parse_datetime(data[field]))
        if "is_all_day" in data:
            ev.is_all_day = bool(data["is_all_day"])

        ev.save()
        return Response(CalendarEventSerializer(ev).data)

    def delete(self, request, event_id):
        ev = self._get_editable(request, event_id)
        if ev is None:
            return Response({"detail": "You can only delete your own events."}, status=status.HTTP_403_FORBIDDEN)
        ev.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CalendarNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"notifications": tomorrow_notifications(build_feed(request.user))})


class GoogleCalendarStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = getattr(request, "user", None)
        connected = bool(user and getattr(user, "google_refresh_token", None))
        synced = bool(user and getattr(user, "google_calendar_synced", False))
        return Response({"connected": connected, "synced": synced})
