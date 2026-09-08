from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db import connection
from django.http import JsonResponse
from apps.core.models import ActionHistory


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
        except Exception as e:
            db_status = f"unhealthy: {str(e)}"

        return Response({
            "status": "healthy" if "unhealthy" not in db_status else "degraded",
            "service": "EduAI Suite v2 Backend",
            "version": "2.0.0",
            "database": db_status,
            "timestamp": timezone.now().isoformat()
        }, status=status.HTTP_200_OK if "unhealthy" not in db_status else status.HTTP_503_SERVICE_UNAVAILABLE)


class ActionHistoryListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        feature = request.query_params.get("feature")
        user_id = request.query_params.get("user_id")
        qs = ActionHistory.objects.all()
        if feature:
            qs = qs.filter(feature=feature)
        if user_id:
            qs = qs.filter(user_id=user_id)

        result = [
            {
                "id": h.id,
                "feature": h.feature,
                "action": h.action,
                "reaction": h.reaction,
                "result": h.result,
                "user_id": h.user_id,
                "metadata_json": h.metadata_json,
                "timestamp": h.timestamp.isoformat() if h.timestamp else None,
            }
            for h in qs
        ]
        return Response(result)

    def post(self, request):
        from apps.core.models import ActionHistory
        data = request.data
        history = ActionHistory.objects.create(
            feature=data.get("feature"),
            action=data.get("action"),
            reaction=data.get("reaction"),
            result=data.get("result"),
            user_id=data.get("user_id"),
            metadata_json=data.get("metadata_json"),
        )
        return Response({
            "id": history.id,
            "feature": history.feature,
            "action": history.action,
            "reaction": history.reaction,
            "result": history.result,
            "user_id": history.user_id,
            "metadata_json": history.metadata_json,
            "timestamp": history.timestamp.isoformat() if history.timestamp else None,
        }, status=status.HTTP_201_CREATED)

