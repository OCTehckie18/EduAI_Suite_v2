from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db import connection
from django.http import JsonResponse


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
