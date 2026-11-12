from datetime import datetime
from django.shortcuts import get_object_or_404
from rest_framework import status

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.access import is_master_admin
from apps.core.models import ActionHistory
from apps.core.permissions import IsStudent
from apps.core.services import notify
from .models import Appointment
from .serializers import AppointmentSerializer


VALID_STATUSES = {"pending", "approved", "rejected"}


def _normalize_name(name):
    return " ".join((name or "").split()).casefold()


def _is_appointment_teacher(user, appointment):
    # By account, never by name: names are editable, so a name match would let a teacher rename themselves into access.
    return user.role == User.Role.TEACHER and appointment.teacher_id == user.pk


class AppointmentListCreateView(APIView):

    def get_permissions(self):
        return [IsStudent()] if self.request.method == "POST" else super().get_permissions()

    def get(self, request):
        """Everyone sees only their own appointments: a teacher's bookings, a student's requests."""
        user = request.user
        qs = Appointment.objects.all()
        status_filter = request.query_params.get("status_filter")
        if status_filter:
            qs = qs.filter(status=status_filter)

        if is_master_admin(user):
            pass
        elif user.role == User.Role.TEACHER:
            qs = qs.filter(teacher=user)
        else:
            qs = qs.filter(student_email__iexact=user.email)

        return Response(AppointmentSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        user = request.user
        student_name = user.full_name
        student_email = user.email

        teacher_name = " ".join(str(data.get("teacher_name") or "").split())
        if not teacher_name:
            return Response({"detail": "Choose the teacher you want to meet."}, status=status.HTTP_400_BAD_REQUEST)
        # Match the full name against approved teachers; a first name alone is not enough to pick one.
        candidates = [
            t for t in User.objects.filter(role=User.Role.TEACHER, approval_status=User.ApprovalStatus.APPROVED)
            if _normalize_name(t.full_name) == _normalize_name(teacher_name)
        ]
        if not candidates:
            return Response({"detail": "No teacher with that name was found."}, status=status.HTTP_400_BAD_REQUEST)
        canonical_teacher = candidates[0].full_name

        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
        appointment = Appointment.objects.create(
            student_name=student_name,
            student_email=student_email,
            teacher_name=canonical_teacher,
            teacher=candidates[0],
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
            user_id=str(user.pk),
            metadata_json={
                "student_name": appointment.student_name,
                "teacher_name": appointment.teacher_name,
                "agenda": appointment.agenda,
                "time_slot": appointment.time_slot,
            },
        )

        notify(
            [candidates[0]], "appointment", f"{student_name} asked for an appointment",
            f"{appointment.agenda or 'No agenda given'} · {appointment.time_slot or 'time not given'}", "/appointments",
        )
        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)


class TeacherAppointmentListView(APIView):

    def get(self, request, teacher_name):
        user = request.user
        norm = _normalize_name(teacher_name)
        if not (is_master_admin(user) or (user.role == User.Role.TEACHER and _normalize_name(user.full_name) == norm)):
            return Response({"detail": "You can only view your own appointments."}, status=status.HTTP_403_FORBIDDEN)
        if is_master_admin(user):
            matched = [a for a in Appointment.objects.all() if _normalize_name(a.teacher_name) == norm]
        else:
            matched = list(Appointment.objects.filter(teacher=user))  # the path name only selects the page; the account decides
        return Response(AppointmentSerializer(matched, many=True).data)


class StudentAppointmentListView(APIView):

    def get(self, request, student_name):
        user = request.user
        norm = _normalize_name(student_name)
        if not (is_master_admin(user) or (user.role == User.Role.STUDENT and _normalize_name(user.full_name) == norm)):
            return Response({"detail": "You can only view your own appointments."}, status=status.HTTP_403_FORBIDDEN)
        qs = Appointment.objects.filter(student_email__iexact=user.email) if not is_master_admin(user) else Appointment.objects.filter(student_name__iexact=student_name)
        return Response(AppointmentSerializer(qs, many=True).data)


class AppointmentStatusUpdateView(APIView):

    def patch(self, request, appointment_id):
        appointment = get_object_or_404(Appointment, pk=appointment_id)
        user = request.user
        if not (is_master_admin(user) or _is_appointment_teacher(user, appointment)):
            return Response({"detail": "Only the teacher this appointment is with can respond to it."}, status=status.HTTP_403_FORBIDDEN)
        data = request.data

        new_status = data.get("status", appointment.status)
        if new_status not in VALID_STATUSES:
            return Response({"detail": "Status must be pending, approved or rejected."}, status=status.HTTP_400_BAD_REQUEST)
        rejection_reason = data.get("rejection_reason", appointment.rejection_reason)
        notes = data.get("notes", appointment.notes)

        reviewer = user.full_name
        previous_status = appointment.status

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
            user_id=str(user.pk),
            metadata_json={
                "appointment_id": appointment.id,
                "student_name": appointment.student_name,
                "status": new_status,
                "rejection_reason": rejection_reason,
            },
        )

        if new_status != previous_status and new_status in ("approved", "rejected"):
            student = User.objects.filter(email__iexact=appointment.student_email).first()
            if student:
                verdict = "accepted" if new_status == "approved" else "declined"
                body = appointment.time_slot or ""
                if new_status == "rejected" and rejection_reason:
                    body = f"Reason: {rejection_reason}"
                notify([student], "appointment", f"{reviewer} {verdict} your appointment", body, "/appointments")
        return Response(AppointmentSerializer(appointment).data)


class TeacherInviteView(APIView):
    """A teacher books a meeting with one of their own students. It is confirmed straight away
    and the student is told; the student can see it with their other appointments."""

    def post(self, request):
        from apps.core.access import managed_courses

        user = request.user
        if user.role != User.Role.TEACHER:
            return Response({"detail": "Only teachers can book a meeting with a student."}, status=status.HTTP_403_FORBIDDEN)
        sid = request.data.get("student_id")
        student = User.objects.filter(
            pk=sid if str(sid).isdigit() else None, role=User.Role.STUDENT, is_active=True,
            enrollments__classroom__in=managed_courses(user), enrollments__is_active=True,
        ).first()
        if student is None:
            return Response({"detail": "Choose a student from your own classrooms."}, status=status.HTTP_400_BAD_REQUEST)
        time_slot = str(request.data.get("time_slot") or "").strip()
        if not time_slot:
            return Response({"detail": "Choose a date and time for the meeting."}, status=status.HTTP_400_BAD_REQUEST)
        mode = request.data.get("meeting_mode") or "In-person"
        if mode not in ("In-person", "Online"):
            return Response({"detail": "The meeting is either In-person or Online."}, status=status.HTTP_400_BAD_REQUEST)
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
        appointment = Appointment.objects.create(
            student_name=student.full_name, student_email=student.email, teacher_name=user.full_name, teacher=user,
            meeting_mode=mode, time_slot=time_slot[:100], agenda=str(request.data.get("agenda") or "Progress check")[:500],
            details=str(request.data.get("details") or ""), status="approved", booked_by_teacher=True, requested_at=now_iso,
            reviewed_at=now_iso, reviewed_by=user.full_name,
        )
        notify([student], "appointment", f"{user.full_name} booked a meeting with you",
               f"{appointment.agenda} · {time_slot}", "/appointments")
        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)
