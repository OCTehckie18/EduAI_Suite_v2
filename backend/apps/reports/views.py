import uuid
from datetime import datetime
from django.shortcuts import get_object_or_404
from django.http import HttpResponse, FileResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.classrooms.models import Classroom
from apps.core.utils.email_utils import send_email
from .models import Report
from .serializers import ReportSerializer


class ReportListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        reports = Report.objects.all()
        return Response(ReportSerializer(reports, many=True).data)

    def post(self, request):
        data = request.data
        report_type = data.get("type", "Class Report")
        target_id = data.get("target_id")

        rep_code = f"REP-{uuid.uuid4().hex[:6].upper()}"
        name = f"{report_type} - {datetime.now().strftime('%b %Y')}"

        content = f"Performance and attendance summary for {report_type}."
        if target_id:
            classroom = Classroom.objects.filter(pk=target_id).first()
            if classroom:
                name = f"{classroom.name} Report"
                content = f"Summary report for course {classroom.name} ({classroom.subject_code})."

        report = Report.objects.create(
            report_id=rep_code,
            name=name,
            type=report_type,
            status="ready",
            content=content,
            target_id=target_id,
        )

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, report_id):
        report = Report.objects.filter(report_id=report_id).first()
        if not report:
            report = get_object_or_404(Report, pk=report_id)
        return Response(ReportSerializer(report).data)

    def delete(self, request, report_id):
        report = Report.objects.filter(report_id=report_id).first()
        if not report:
            report = get_object_or_404(Report, pk=report_id)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportSendView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, report_id):
        report = Report.objects.filter(report_id=report_id).first()
        if not report:
            report = get_object_or_404(Report, pk=report_id)

        email = request.data.get("email")
        if not email:
            return Response({"detail": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)

        subject = f"Report: {report.name}"
        body = f"Hello,\n\nPlease find the details for {report.name}:\n\n{report.content}\n\nBest regards,\nEduAI Suite"
        send_email(to_email=email, subject=subject, body=body)

        return Response({"message": f"Report successfully dispatched to {email}"})


class ReportDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, report_id):
        report = Report.objects.filter(report_id=report_id).first()
        if not report:
            report = get_object_or_404(Report, pk=report_id)

        response = HttpResponse(report.content or "Empty report", content_type="text/plain")
        response["Content-Disposition"] = f'attachment; filename="{report.report_id}.txt"'
        return response
