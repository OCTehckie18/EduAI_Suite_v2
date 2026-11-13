"""The owner's console API: sign in, and manage each college's Master Admins through the locked channel."""
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import channel
from .models import AdminAction, Campus


class StaffLoginThrottle(AnonRateThrottle):
    scope = "staff_login"

    def get_rate(self):
        from django.conf import settings

        return settings.STAFF_LOGIN_RATE


class StaffLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [StaffLoginThrottle]

    def post(self, request):
        user = authenticate(request, username=str(request.data.get("username", "")).strip(), password=str(request.data.get("password", "")))
        if user is None or not user.is_staff or not user.is_active:
            return Response({"detail": "Wrong username or password."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response({"username": user.username, "csrf": get_token(request)})


class StaffLogoutView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        logout(request)
        return Response({"ok": True})


class StaffMeView(APIView):
    """Also how the console learns its CSRF token on load."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"username": request.user.username, "csrf": get_token(request)})


def _campus_json(campus):
    return {
        "slug": campus.slug, "college_name": campus.college_name, "status": campus.status, "plan": campus.plan,
        "api_url": campus.api_url, "has_channel": campus.has_channel, "renewal_date": campus.renewal_date,
        "snapshot_at": campus.snapshot_at, "summary": campus.summary_snapshot,
    }


def _record(campus, request, action, target_email="", result="ok", detail=""):
    AdminAction.objects.create(
        campus=campus, staff_username=request.user.username, action=action,
        target_email=target_email, result=result, detail=detail[:300],
    )


def _refresh_snapshot(campus):
    """Ask the college for its admins (and counts) and remember the answer. Raises ChannelError if unreachable."""
    admins = channel.call(campus, "GET", "admins/")
    summary = channel.call(campus, "GET", "summary/")
    campus.admins_snapshot, campus.summary_snapshot, campus.snapshot_at = admins, summary, timezone.now()
    campus.save(update_fields=["admins_snapshot", "summary_snapshot", "snapshot_at"])
    return admins


class CampusAdminsView(APIView):
    """GET: the college's Master Admins, live; if it cannot be reached, the last list we saw, marked stale."""

    permission_classes = [IsAdminUser]

    def get(self, request, slug):
        campus = get_object_or_404(Campus, slug=slug)
        try:
            return Response({"campus": _campus_json(campus), "admins": _refresh_snapshot(campus), "stale": False, "error": ""})
        except channel.ChannelError as exc:
            return Response({
                "campus": _campus_json(campus), "admins": campus.admins_snapshot, "stale": True,
                "error": str(exc), "as_of": campus.snapshot_at,
            })

    def post(self, request, slug):
        campus = get_object_or_404(Campus, slug=slug)
        email = str(request.data.get("email", "")).strip().lower()
        try:
            result = channel.call(campus, "POST", "admins/", {
                "email": email, "first_name": request.data.get("first_name", ""), "last_name": request.data.get("last_name", ""),
            })
        except channel.ChannelError as exc:
            _record(campus, request, "invite", email, "failed", str(exc))
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT if exc.status_code == 409 else status.HTTP_502_BAD_GATEWAY if exc.status_code is None or exc.status_code >= 500 else exc.status_code)
        _record(campus, request, "invite", email, "ok", "emailed by the college" if result.get("emailed") else "link returned to the owner")
        self._try_refresh(campus)
        return Response(result, status=status.HTTP_201_CREATED)

    @staticmethod
    def _try_refresh(campus):
        try:
            _refresh_snapshot(campus)
        except channel.ChannelError:
            pass


class CampusAdminActionView(APIView):
    permission_classes = [IsAdminUser]
    ACTIONS = {"disable", "enable", "reset-link"}

    def post(self, request, slug, admin_id, action):
        if action not in self.ACTIONS:
            return Response({"detail": "Unknown action."}, status=status.HTTP_404_NOT_FOUND)
        campus = get_object_or_404(Campus, slug=slug)
        email = next((a["email"] for a in campus.admins_snapshot if a.get("id") == admin_id), "")
        body = {"force": True} if request.data.get("force") is True else None
        try:
            result = channel.call(campus, "POST", f"admins/{admin_id}/{action}/", body)
        except channel.ChannelError as exc:
            _record(campus, request, action, email, "refused" if exc.status_code == 409 else "failed", str(exc))
            code = exc.status_code if exc.status_code in (404, 409) else status.HTTP_502_BAD_GATEWAY
            return Response({"detail": str(exc)}, status=code)
        _record(campus, request, action, email)
        CampusAdminsView._try_refresh(campus)
        return Response(result)


class TestConnectionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, slug):
        campus = get_object_or_404(Campus, slug=slug)
        try:
            _refresh_snapshot(campus)
        except channel.ChannelError as exc:
            _record(campus, request, "test_connection", "", "failed", str(exc))
            return Response({"ok": False, "detail": str(exc)})
        _record(campus, request, "test_connection")
        return Response({"ok": True, "campus": _campus_json(campus)})


class AllAdminsView(APIView):
    """Every Master Admin across every college, from the last list we saw of each (no fan-out of live calls)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        rows = []
        for campus in Campus.objects.all():
            for admin in campus.admins_snapshot:
                rows.append(admin | {"campus_slug": campus.slug, "college_name": campus.college_name, "as_of": campus.snapshot_at})
        return Response({"admins": rows, "campuses": [_campus_json(c) for c in Campus.objects.all()]})


class ActionLogView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = AdminAction.objects.select_related("campus")
        if request.query_params.get("campus"):
            qs = qs.filter(campus__slug=request.query_params["campus"])
        return Response([
            {"id": a.pk, "campus_slug": a.campus.slug, "college_name": a.campus.college_name, "staff": a.staff_username,
             "action": a.action, "target_email": a.target_email, "result": a.result, "detail": a.detail, "at": a.created_at}
            for a in qs[:200]
        ])
