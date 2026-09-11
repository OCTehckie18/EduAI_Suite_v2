from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.permissions import IsMasterAdmin
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .services import content_type_key, model_for_key, soft_delete_models


class MasterAdminOverviewView(APIView):
    """Cross-campus KPI snapshot for the Master Admin dashboard."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        return Response({
            "institution": {
                "campuses": Campus.objects.count(),
                "schools": School.objects.count(),
                "departments": Department.objects.count(),
                "programs": Program.objects.count(),
                "batches": Batch.objects.count(),
                "sections": Section.objects.count(),
            },
            "classrooms": Classroom.objects.count(),
            "users": {
                "total": User.objects.count(),
                "master_admins": User.objects.filter(role=User.Role.MASTER_ADMIN).count(),
                "campus_admins": User.objects.filter(role=User.Role.CAMPUS_ADMIN).count(),
                "teachers": User.objects.filter(role=User.Role.TEACHER).count(),
                "students": User.objects.filter(role=User.Role.STUDENT).count(),
            },
        })


class RecycleBinListView(APIView):
    """Unified view of soft-deleted records across every app, filterable by ?model=app_label.model_name."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        requested_key = request.query_params.get("model")
        if requested_key:
            model = model_for_key(requested_key)
            models = [model] if model else []
        else:
            models = soft_delete_models()

        items = []
        for model in models:
            key = content_type_key(model)
            for instance in model.all_objects.filter(is_active=False).order_by("-deleted_at")[:200]:
                items.append({
                    "content_type": key,
                    "id": instance.pk,
                    "label": str(instance),
                    "deleted_at": instance.deleted_at,
                })
        items.sort(key=lambda entry: entry["deleted_at"] or "", reverse=True)
        return Response({"count": len(items), "results": items})


class RecycleBinRestoreView(APIView):
    """Generic restore endpoint for any soft-deleted record, addressed by content type + id."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request, content_type, pk):
        model = model_for_key(content_type)
        if model is None:
            return Response({"detail": "Unknown or unsupported content type."}, status=404)
        try:
            instance = model.all_objects.get(pk=pk)
        except model.DoesNotExist:
            return Response({"detail": "Record not found."}, status=404)
        if instance.is_active:
            return Response({"detail": "Record is already active."}, status=400)
        instance.restore()
        return Response({"success": True, "content_type": content_type, "id": instance.pk})
