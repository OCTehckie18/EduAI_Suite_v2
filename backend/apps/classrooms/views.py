from django.http import HttpResponse
from openpyxl import Workbook
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.viewsets import SoftDeleteModelViewSet

from .models import Classroom, Enrollment
from .serializers import ClassroomSerializer, EnrollmentSerializer
from .services import import_enrollments


class ClassroomViewSet(SoftDeleteModelViewSet):
    queryset = Classroom.objects.select_related(
        "teacher", "department", "program", "batch", "section",
    ).all()
    serializer_class = ClassroomSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        for field in ("department_id", "program_id", "batch_id", "section_id", "teacher_id"):
            value = self.request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        return queryset

    @action(detail=False, methods=["get"], url_path="enrollment/template")
    def enrollment_template(self, request):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Enrollment"
        sheet.append(["Register No", "Student Name", "Student Email", "Section"])
        sheet.append(["", "", "student@example.com", "A"])
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="classroom_enrollment_template.xlsx"'
        workbook.save(response)
        return response

    @action(
        detail=True,
        methods=["post"],
        url_path="enroll/upload",
        parser_classes=[MultiPartParser, FormParser],
    )
    def enroll_upload(self, request, pk=None):
        classroom = self.get_object()
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Upload a CSV or XLSX file using the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = import_enrollments(classroom, uploaded_file)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result.as_dict(), status=status.HTTP_200_OK)


class EnrollmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Enrollment.objects.select_related("classroom", "student").all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        classroom_id = self.request.query_params.get("classroom_id")
        student_id = self.request.query_params.get("student_id")
        if classroom_id:
            queryset = queryset.filter(classroom_id=classroom_id)
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return queryset
