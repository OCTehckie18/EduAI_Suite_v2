import logging

from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db import connection
from django.http import JsonResponse
from apps.core.access import is_campus_admin, is_master_admin
from apps.core.models import ActionHistory

logger = logging.getLogger(__name__)


def root_view(request):
    """Compatibility response matching the previous FastAPI root endpoint."""
    return JsonResponse({'message': 'EduAI Backend Running'})


def legacy_health_view(request):
    """Compatibility alias for the previous ``/api/health`` endpoint."""
    return HealthCheckView.as_view()(request)

class HealthCheckView(APIView):
    """
    System health check endpoint verifying database connectivity.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        db_status = "connected"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            logger.exception("Health check could not reach the database")
            db_status = "unhealthy"

        return Response({
            "status": "healthy" if "unhealthy" not in db_status else "degraded",
            "service": "EduAI Suite v2 Backend",
            "version": "2.0.0",
            "database": db_status,
            "timestamp": timezone.now().isoformat()
        }, status=status.HTTP_200_OK if "unhealthy" not in db_status else status.HTTP_503_SERVICE_UNAVAILABLE)


def _history_payload(h):
    return {
        "id": h.id,
        "feature": h.feature,
        "action": h.action,
        "reaction": h.reaction,
        "result": h.result,
        "user_id": h.user_id,
        "metadata_json": h.metadata_json,
        "timestamp": h.timestamp.isoformat() if h.timestamp else None,
    }


def _short(value):
    return None if value is None else str(value)[:100]


class ActionHistoryListCreateView(APIView):
    """Audit trail. Everyone sees their own entries; admins see the people in their scope."""
    permission_classes = [IsAuthenticated]
    MAX_RESULTS = 500

    def _visible(self, user):
        entries = ActionHistory.objects.all()
        if is_master_admin(user):
            return entries
        if is_campus_admin(user) and user.campus_id:
            campus_user_ids = [
                str(pk)
                for pk in get_user_model().all_objects.filter(campus_id=user.campus_id).values_list("pk", flat=True)
            ]
            return entries.filter(user_id__in=campus_user_ids)
        return entries.filter(user_id=str(user.pk))

    def get(self, request):
        qs = self._visible(request.user)
        feature = request.query_params.get("feature")
        user_id = request.query_params.get("user_id")
        if feature:
            qs = qs.filter(feature=feature)
        if user_id:
            qs = qs.filter(user_id=user_id)
        return Response([_history_payload(h) for h in qs[: self.MAX_RESULTS]])

    def post(self, request):
        data = request.data
        # The actor is always the authenticated user; a client-supplied user_id is ignored.
        history = ActionHistory.objects.create(
            feature=_short(data.get("feature")),
            action=_short(data.get("action")),
            reaction=_short(data.get("reaction")),
            result=_short(data.get("result")),
            user_id=str(request.user.pk),
            metadata_json=data.get("metadata_json"),
        )
        return Response(_history_payload(history), status=status.HTTP_201_CREATED)
