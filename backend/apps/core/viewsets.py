from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

class SoftDeleteModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet ensuring:
    1. Standard DELETE calls soft delete (.delete() sets is_active=False).
    2. Master Admins can pass ?include_inactive=true to view soft-deleted records.
    3. Dedicated POST /{id}/restore/ endpoint to re-activate soft-deleted items.
    """
    def get_queryset(self, all_records=False):
        include_inactive = self.request.query_params.get('include_inactive', 'false').lower() == 'true'
        user = getattr(self.request, 'user', None)
        is_admin = user and (getattr(user, 'is_superuser', False) or getattr(user, 'role', '') == 'MASTER_ADMIN')

        if (include_inactive and is_admin) or all_records:
            if hasattr(self.queryset.model, 'all_objects'):
                return self.queryset.model.all_objects.all()
        return super().get_queryset()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(
            {
                "success": True,
                "detail": f"{instance.__class__.__name__} deactivated successfully (soft delete).",
                "id": instance.id,
                "is_active": False
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def restore(self, request, pk=None):
        """Restore a soft-deleted record."""
        model = self.queryset.model
        try:
            instance = model.all_objects.get(pk=pk)
        except model.DoesNotExist:
            return Response(
                {"success": False, "error": f"{model.__name__} not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        instance.restore()
        return Response(
            {
                "success": True,
                "detail": f"{model.__name__} restored successfully.",
                "id": instance.id,
                "is_active": True
            },
            status=status.HTTP_200_OK
        )
