import re
import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.http import HttpResponse
from django.utils.html import escape
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.core.access import is_master_admin, managed_courses
from apps.core.permissions import IsTeacher
from apps.core.utils.email_utils import email_configured, send_email
from services.groq_service import DEFAULT_MODEL, GroqService
from .builders import build_class_report, build_event_report, build_student_report, render_docx
from .models import Report
from .serializers import ReportSerializer

REPORT_TYPES = ("Student Report", "Class Report")
MAX_NOTES_CHARS = 20000


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _visible(user):
    """Reports a user may see: their own, or every report for a master admin."""
    return Report.objects.all() if is_master_admin(user) else Report.objects.filter(owner=user)


def _find(user, report_id):
    return _visible(user).filter(report_id=report_id).first()


def _new_report_id():
    while True:
        code = f"REP-{uuid.uuid4().hex[:8].upper()}"
        if not Report.objects.filter(report_id=code).exists():
            return code


def _target(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class ReportListCreateView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get(self, request):
        return Response(ReportSerializer(_visible(request.user), many=True).data)

    def post(self, request):
        report_type = request.data.get("type", "Class Report")
        if report_type not in REPORT_TYPES:
            return _bad(f"Report type must be one of: {', '.join(REPORT_TYPES)}.")
        target_id = _target(request.data.get("target_id"))
        if target_id is None:
            return _bad("Choose a student or a course for the report.")

        courses = managed_courses(request.user)
        if report_type == "Class Report":
            classroom = courses.filter(pk=target_id).select_related("teacher").first()
            if classroom is None:
                return _bad("That course was not found among your classes.", status.HTTP_404_NOT_FOUND)
            name, content = build_class_report(classroom)
        else:
            student = User.objects.filter(pk=target_id, role=User.Role.STUDENT).first()
            student_courses = list(
                courses.filter(enrollments__student=student, enrollments__is_active=True).distinct()
            ) if student else []
            if student is None or not student_courses:
                return _bad("That student was not found among the students in your classes.", status.HTTP_404_NOT_FOUND)
            name, content = build_student_report(student, student_courses)

        report = Report.objects.create(
            owner=request.user, report_id=_new_report_id(), name=name, type=report_type,
            status="ready", content=content, target_id=target_id,
        )
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportEventView(APIView):
    """An activity report written from meeting or event notes."""

    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        notes = str(request.data.get("meeting_notes") or "").strip()
        if not notes:
            return _bad("Add the meeting or event notes before generating the report.")
        if len(notes) > MAX_NOTES_CHARS:
            return _bad(f"The notes are too long (limit {MAX_NOTES_CHARS} characters).")

        extra, target_id = None, _target(request.data.get("target_id"))
        if target_id is not None:
            student = User.objects.filter(
                pk=target_id, role=User.Role.STUDENT,
                enrollments__classroom__in=managed_courses(request.user), enrollments__is_active=True,
            ).first()
            if student is None:
                return _bad("That student was not found among the students in your classes.", status.HTTP_404_NOT_FOUND)
            extra = f"{student.full_name} ({student.register_no or student.email})"

        title, content, missing = build_event_report(
            notes, extra=extra, ai_client=GroqService.get_client(), ai_model=DEFAULT_MODEL
        )
        report = Report.objects.create(
            owner=request.user, report_id=_new_report_id(), name=title[:200], type="Event Report",
            status="ready", content=content, target_id=target_id,
        )
        payload = ReportSerializer(report).data
        return Response({**payload, "report_id": report.report_id, "fields_requiring_teacher": missing}, status=status.HTTP_201_CREATED)


class ReportDetailView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, report_id):
        report = _find(request.user, report_id)
        if report is None:
            return _bad("Report not found.", status.HTTP_404_NOT_FOUND)
        return Response(ReportSerializer(report).data)

    def delete(self, request, report_id):
        report = _find(request.user, report_id)
        if report is None:
            return _bad("Report not found.", status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportSendView(APIView):
    permission_classes = [IsTeacher]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request, report_id):
        report = _find(request.user, report_id)
        if report is None:
            return _bad("Report not found.", status.HTTP_404_NOT_FOUND)
        email = str(request.data.get("email") or "").strip()
        if not email:
            return _bad("Email is required.")
        try:
            validate_email(email)
        except DjangoValidationError:
            return _bad("Enter a valid email address.")
        if not email_configured():
            return _bad("Email is not set up on this server, so nothing was sent. Download the report and send it yourself.", status.HTTP_503_SERVICE_UNAVAILABLE)

        subject = f"Report: {report.name}"
        # The email is sent as HTML, so the text is escaped and its line breaks kept.
        body = "<p>Hello,</p><p>Please find the report below.</p><pre style=\"font-family:inherit;white-space:pre-wrap\">" \
               + escape(re.sub(r"\*\*", "", report.content or "")) + "</pre><p>Best regards,<br>EduAI Suite</p>"
        if not send_email(to_email=email, subject=subject, body=body):
            return _bad("The email could not be sent. Check the address and try again.", status.HTTP_502_BAD_GATEWAY)
        return Response({"message": f"Report sent to {email}."})


class ReportDownloadView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, report_id):
        report = _find(request.user, report_id)
        if report is None:
            return _bad("Report not found.", status.HTTP_404_NOT_FOUND)
        response = HttpResponse(
            render_docx(report.name or report.report_id, report.content or "Empty report"),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{report.report_id}.docx"'
        return response
