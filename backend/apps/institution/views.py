from django.db import IntegrityError, transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.access import (
    IsMasterOrCampusAdminForWrites,
    campus_id_of,
    can_manage_campus,
    is_master_admin,
)
from apps.core.viewsets import SoftDeleteModelViewSet

from .models import Batch, Campus, Department, Program, School, Section
from .serializers import (
    BatchSerializer,
    CampusSerializer,
    DepartmentSerializer,
    ProgramSerializer,
    SchoolSerializer,
    SectionSerializer,
)


class InstitutionViewSet(SoftDeleteModelViewSet):
    """Reads are open to signed-in users (profile setup needs the hierarchy); writes are scoped."""
    permission_classes = [IsMasterOrCampusAdminForWrites]

    def _check_scope(self, record):
        user = self.request.user
        if is_master_admin(user):
            return
        if type(record).__name__ == "Campus" or not can_manage_campus(user, campus_id_of(record)):
            raise PermissionDenied("You can only manage records inside your own campus.")

    def _save(self, serializer):
        record = serializer.instance or serializer.Meta.model(**serializer.validated_data)
        if serializer.instance is not None:
            for field, value in serializer.validated_data.items():
                setattr(record, field, value)
        self._check_scope(record)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError(
                {"detail": "A record with these identifying values already exists (it may be in the recycle bin)."}
            )

    def perform_create(self, serializer):
        self._save(serializer)

    def perform_update(self, serializer):
        self._save(serializer)

    def check_restore_scope(self, instance):
        self._check_scope(instance)


class CampusViewSet(InstitutionViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer


class SchoolViewSet(InstitutionViewSet):
    queryset = School.objects.select_related("campus").all()
    serializer_class = SchoolSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        campus_id = self.request.query_params.get("campus_id")
        return queryset.filter(campus_id=campus_id) if campus_id else queryset


class DepartmentViewSet(InstitutionViewSet):
    queryset = Department.objects.select_related("school", "school__campus").all()
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        school_id = self.request.query_params.get("school_id")
        campus_id = self.request.query_params.get("campus_id")
        if school_id:
            queryset = queryset.filter(school_id=school_id)
        if campus_id:
            queryset = queryset.filter(school__campus_id=campus_id)
        return queryset


class ProgramViewSet(InstitutionViewSet):
    queryset = Program.objects.select_related("department", "department__school").all()
    serializer_class = ProgramSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department_id = self.request.query_params.get("department_id")
        school_id = self.request.query_params.get("school_id")
        return queryset.filter(department_id=department_id) if department_id else (
            queryset.filter(department__school_id=school_id) if school_id else queryset
        )


class BatchViewSet(InstitutionViewSet):
    queryset = Batch.objects.select_related("program", "program__department").all()
    serializer_class = BatchSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        program_id = self.request.query_params.get("program_id")
        return queryset.filter(program_id=program_id) if program_id else queryset


class SectionViewSet(InstitutionViewSet):
    queryset = Section.objects.select_related("batch", "batch__program").all()
    serializer_class = SectionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        batch_id = self.request.query_params.get("batch_id")
        return queryset.filter(batch_id=batch_id) if batch_id else queryset
