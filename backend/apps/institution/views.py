from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from apps.core.access import IsMasterAdminOrReadOnly
from apps.core.viewsets import SoftDeleteModelViewSet

from .models import Batch, Campus, Department, Program, School, Section, ensure_default_section
from .serializers import (
    BatchSerializer,
    CampusSerializer,
    DepartmentSerializer,
    ProgramSerializer,
    SchoolSerializer,
    SectionSerializer,
)


class InstitutionViewSet(SoftDeleteModelViewSet):
    """Reads are open to signed-in users (profile setup needs the hierarchy); only master admins write."""
    permission_classes = [IsMasterAdminOrReadOnly]

    def _save(self, serializer):
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


class CampusViewSet(InstitutionViewSet):
    queryset = Campus.objects.annotate(child_count=Count("schools", filter=Q(schools__is_active=True)))
    serializer_class = CampusSerializer


class SchoolViewSet(InstitutionViewSet):
    queryset = School.objects.select_related("campus").annotate(
        child_count=Count("departments", filter=Q(departments__is_active=True))
    )
    serializer_class = SchoolSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        campus_id = self.request.query_params.get("campus_id")
        return queryset.filter(campus_id=campus_id) if campus_id else queryset


class DepartmentViewSet(InstitutionViewSet):
    queryset = Department.objects.select_related("school", "school__campus").annotate(
        child_count=Count("programs", filter=Q(programs__is_active=True))
    )
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
    queryset = Program.objects.select_related("department", "department__school").annotate(
        child_count=Count("batches", filter=Q(batches__is_active=True))
    )
    serializer_class = ProgramSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department_id = self.request.query_params.get("department_id")
        school_id = self.request.query_params.get("school_id")
        return queryset.filter(department_id=department_id) if department_id else (
            queryset.filter(department__school_id=school_id) if school_id else queryset
        )


class BatchViewSet(InstitutionViewSet):
    queryset = Batch.objects.select_related("program", "program__department").annotate(
        child_count=Count("sections", filter=Q(sections__is_active=True))
    )
    serializer_class = BatchSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        program_id = self.request.query_params.get("program_id")
        return queryset.filter(program_id=program_id) if program_id else queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            super().perform_create(serializer)
            ensure_default_section(serializer.instance)  # a class always starts with Section A


class SectionViewSet(InstitutionViewSet):
    queryset = Section.objects.select_related("batch", "batch__program").annotate(
        child_count=Count("students", filter=Q(students__is_active=True))
    )
    serializer_class = SectionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        batch_id = self.request.query_params.get("batch_id")
        return queryset.filter(batch_id=batch_id) if batch_id else queryset

    def destroy(self, request, *args, **kwargs):
        section = self.get_object()
        if not Section.objects.filter(batch=section.batch).exclude(pk=section.pk).exists():
            return Response(
                {"detail": "A class must keep at least one section. Add another section first, or remove the whole class."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
