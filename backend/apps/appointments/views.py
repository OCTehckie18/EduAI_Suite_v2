from datetime import datetime
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.models import ActionHistory
from .models import Appointment
from .serializers import AppointmentSerializer


def _normalize_name(name):
    return " ".join((name or "").split()).casefold()


class AppointmentListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        status_filter = request.query_params.get("status_filter")
        teacher_name = request.query_params.get("teacher_name")
        student_name = request.query_params.get("student_name")

        qs = Appointment.objects.all()
        if status_filter:
            qs = qs.filter(status=status_filter)
        if teacher_name:
            qs = qs.filter(teacher_name__iexact=teacher_name)
        if student_name:
            qs = qs.filter(student_name__iexact=student_name)

        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            if user.role in (User.Role.MASTER_ADMIN, User.Role.CAMPUS_ADMIN):
                pass
            elif user.role == User.Role.TEACHER:
                norm = _normalize_name(user.full_name)
                qs = [a for a in qs if _normalize_name(a.teacher_name) == norm]
                return Response(AppointmentSerializer(qs, many=True).data)
            else:
                qs = qs.filter(student_email__iexact=user.email)

        return Response(AppointmentSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        user = getattr(request, "user", None)

        student_name = data.get("student_name")
        student_email = data.get("student_email")
        if user and user.is_authenticated:
            if user.role == User.Role.TEACHER:
                return Response({"detail": "Only students can create appointment requests"}, status=status.HTTP_403_FORBIDDEN)
            student_name = user.full_name or student_name
            student_email = user.email or student_email

        teacher_name = data.get("teacher_name")
        matched_teacher = User.objects.filter(role=User.Role.TEACHER, first_name__iexact=teacher_name.split()[0] if teacher_name else "").first()
        canonical_teacher = matched_teacher.full_name if matched_teacher else teacher_name

        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
        appointment = Appointment.objects.create(
            student_name=student_name,
            student_email=student_email,
            teacher_name=canonical_teacher,
            teacher_department=data.get("teacher_department"),
            meeting_mode=data.get("meeting_mode"),
            time_slot=data.get("time_slot"),
            agenda=data.get("agenda"),
            details=data.get("details"),
            status="pending",
            requested_at=now_iso,
        )

        ActionHistory.objects.create(
            feature="appointment",
            action="book_appointment",
            reaction="student_triggered",
            result="pending",
            metadata_json={
                "student_name": appointment.student_name,
                "teacher_name": appointment.teacher_name,
                "agenda": appointment.agenda,
                "time_slot": appointment.time_slot,
            },
        )

        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)


class TeacherAppointmentListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, teacher_name):
        qs = Appointment.objects.all()
        norm = _normalize_name(teacher_name)
        matched = [a for a in qs if _normalize_name(a.teacher_name) == norm]
        return Response(AppointmentSerializer(matched, many=True).data)


class StudentAppointmentListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, student_name):
        user = getattr(request, "user", None)
        if user and user.is_authenticated and user.role == User.Role.TEACHER:
            return Response({"detail": "Teachers cannot view private student appointments"}, status=status.HTTP_403_FORBIDDEN)

        qs = Appointment.objects.filter(student_name__iexact=student_name)
        return Response(AppointmentSerializer(qs, many=True).data)


class AppointmentStatusUpdateView(APIView):
    permission_classes = [AllowAny]

    def patch(self, request, appointment_id):
        appointment = get_object_or_404(Appointment, pk=appointment_id)
        data = request.data

        new_status = data.get("status", appointment.status)
        rejection_reason = data.get("rejection_reason", appointment.rejection_reason)
        notes = data.get("notes", appointment.notes)

        reviewer = "Teacher"
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            reviewer = user.full_name

        appointment.status = new_status
        appointment.reviewed_by = reviewer
        appointment.reviewed_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
        appointment.rejection_reason = rejection_reason
        appointment.notes = notes
        appointment.save()

        ActionHistory.objects.create(
            feature="appointment",
            action=f"{new_status}_appointment",
            reaction="teacher_triggered",
            result=new_status,
            metadata_json={
                "appointment_id": appointment.id,
                "student_name": appointment.student_name,
                "status": new_status,
                "rejection_reason": rejection_reason,
            },
        )

        return Response(AppointmentSerializer(appointment).data)
