from urllib.parse import urlencode, urlparse

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
from . import crypto, google_client, signals, sync
from .models import CalendarEvent, GoogleCalendarLink
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

        if not str(data.get("title") or "").strip():
            return Response({"detail": "Give the event a title."}, status=status.HTTP_400_BAD_REQUEST)
        start, end, error = _clean_times(data.get("start_time"), data.get("end_time"))
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
        ev = CalendarEvent.objects.create(
            created_by=user,
            title=data.get("title", ""),
            description=data.get("description"),
            start_time=start,
            end_time=end,
            event_type=data.get("event_type", "custom"),
            color=data.get("color", "#0b4a87"),
            location=data.get("location"),
            is_all_day=bool(data.get("is_all_day", False)),
            recurrence=data.get("recurrence"),
            teacher_name=data.get("teacher_name") or (user.full_name if role != "STUDENT" else None),
            student_email=(user.email if role == "STUDENT" else data.get("student_email")),
            course_id=course_id,
        )
        return Response(CalendarEventSerializer(ev).data, status=status.HTTP_201_CREATED)


def _clean_times(start_value, end_value):
    """(start, end, error). Text that is not a date is refused, and an event cannot end before it starts."""
    def parse(value, label):
        if value in (None, ""):
            return None, None
        parsed = parse_datetime(str(value)) if isinstance(value, str) else None
        if parsed is None:
            return None, f"{label} is not a valid date and time."
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed)  # read in the server's time zone, as Django would
        return parsed, None

    start, error = parse(start_value, "The start time")
    if error:
        return None, None, error
    end, error = parse(end_value, "The end time")
    if error:
        return None, None, error
    if start and end and end < start:
        return None, None, "The event must end after it starts."
    return start, end, None


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
        start, end, error = _clean_times(
            data.get("start_time") or (ev.start_time.isoformat() if ev.start_time else None),
            data.get("end_time") or (ev.end_time.isoformat() if ev.end_time else None),
        )
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
        ev.start_time, ev.end_time = start, end
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


def _allowed_return(url):
    """Only send the user back to one of our own portals (never an address a request made up)."""
    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    origin = f"{parsed.scheme}://{parsed.netloc}"
    allowed = {o.rstrip("/") for o in settings.CORS_ALLOWED_ORIGINS} | {(settings.FRONTEND_URL or "").rstrip("/")}
    if origin in allowed:
        return True
    return settings.DEBUG and parsed.hostname in ("localhost", "127.0.0.1")


def _redirect(return_to, **params):
    sep = "&" if "?" in return_to else "?"
    return HttpResponseRedirect(f"{return_to}{sep}{urlencode(params)}")


def _status_payload(user):
    link = GoogleCalendarLink.objects.filter(user=user).first()
    return {
        "configured": google_client.configured(),
        "connected": bool(link and link.status != GoogleCalendarLink.Status.REVOKED),
        "status": link.status if link else "disconnected",
        "needs_reconnect": bool(link and link.status == GoogleCalendarLink.Status.REVOKED),
        "last_synced_at": link.last_synced_at if link else None,
        "last_error": link.last_error if link else "",
        "calendar_name": sync.calendar_name() if link else None,
    }


class GoogleCalendarStatusView(APIView):
    """Whether this user's Google Calendar is connected and when it last updated. Never returns a token."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_status_payload(request.user))


class GoogleCalendarConnectView(APIView):
    """Google's consent address for this user (``?return_to=`` is the portal page to come back to)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not google_client.configured():
            return Response({"detail": "Google Calendar is not set up on this server yet. Ask your administrator."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return_to = request.query_params.get("return_to") or f"{(settings.FRONTEND_URL or '').rstrip('/')}/calendar"
        if not _allowed_return(return_to):
            return Response({"detail": "That return address is not allowed."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"url": google_client.consent_url(request.user.pk, return_to)})


class GoogleCalendarCallbackView(APIView):
    """Where Google sends the browser after the user allows (or refuses) calendar access."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        fallback = f"{(settings.FRONTEND_URL or '').rstrip('/')}/calendar"
        state = google_client.read_state(request.query_params.get("state", ""))
        if state is None:
            return _redirect(fallback, google="error", reason="state")
        return_to = state["r"] if _allowed_return(state["r"]) else fallback
        if request.query_params.get("error") or not request.query_params.get("code"):
            return _redirect(return_to, google="error", reason="denied")
        user = get_user_model().objects.filter(pk=state["u"], is_active=True).first()
        if user is None:
            return _redirect(return_to, google="error", reason="user")
        api = google_client.GoogleApi()
        try:
            tokens = api.exchange_code(request.query_params["code"])
            refresh = tokens.get("refresh_token")
            if not refresh:
                return _redirect(return_to, google="error", reason="no_refresh_token")
            access = tokens["access_token"]
            link = GoogleCalendarLink.objects.filter(user=user).first()
            if link is None:
                link = GoogleCalendarLink(user=user)
            link.refresh_token = crypto.encrypt(refresh)
            link.status, link.last_error = GoogleCalendarLink.Status.CONNECTED, ""
            if not link.calendar_id:
                link.calendar_id = api.create_calendar(access, sync.calendar_name(), sync.university_timezone())
            link.save()
        except (google_client.GoogleApiError, google_client.GoogleAuthError):
            return _redirect(return_to, google="error", reason="google")
        signals.queue_sync([user.pk])  # the worker sends the first sync within about a minute
        return _redirect(return_to, google="connected")


class GoogleCalendarSyncNowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        link = GoogleCalendarLink.objects.filter(user=request.user).first()
        if link is None:
            return Response({"detail": "Google Calendar is not connected."}, status=status.HTTP_409_CONFLICT)
        try:
            counts = sync.sync_user(link)
        except google_client.GoogleAuthError:
            return Response({"detail": "Google stopped accepting updates. Reconnect Google Calendar to keep it in sync."}, status=status.HTTP_409_CONFLICT)
        except google_client.GoogleApiError:
            return Response({"detail": "Google could not be reached right now. Try again in a moment."}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({**counts, **_status_payload(request.user)})


class GoogleCalendarDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        link = GoogleCalendarLink.objects.filter(user=request.user).first()
        if link is not None:
            sync.disconnect(link)
        return Response(_status_payload(request.user))
