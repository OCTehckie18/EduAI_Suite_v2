import io
from datetime import datetime, date, timedelta
from typing import Optional

from django.utils import timezone
from django.db.models import Q, Avg, Count
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.assignments.models import Assignment, Submission
from apps.exams.models import Exam, ExamAttempt
from apps.appointments.models import Appointment
from apps.core.models import ActionHistory
from apps.omr.models import OMRSubmission
from apps.lessons.models import Lesson
from apps.calendar_app.models import CalendarEvent
from apps.reports.models import Report
from apps.mail.models import MailHistory
from apps.games.models import ChainAnswerGame


def _parse_date_safe(value):
    if not value:
        return None
    if isinstance(value, (datetime, date)):
        return value
    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
    ]
    val_str = str(value).strip()
    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt)
        except (ValueError, AttributeError):
            continue
    return None


def format_relative_time(dt):
    if not dt:
        return "Just now"
    if isinstance(dt, str):
        parsed = _parse_date_safe(dt)
        if parsed:
            dt = parsed
        else:
            return dt

    now = timezone.now()
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    diff = now - dt
    if diff.days > 0:
        return f"{diff.days}d ago"
    hours = diff.seconds // 3600
    if hours > 0:
        return f"{hours}h ago"
    minutes = diff.seconds // 60
    if minutes > 0:
        return f"{minutes}m ago"
    return "Just now"


class DashboardSummaryView(APIView):
    """The teacher's dashboard. Everything is scoped to the signed-in teacher's own classrooms
    (all classrooms for a master admin); figures that cannot be measured are ``None``."""

    def get(self, request):
        from apps.assignments.stats import average_by_student, course_average
        from apps.core.access import is_master_admin, managed_courses

        user = request.user
        if not (is_master_admin(user) or user.role == User.Role.TEACHER):
            return Response({"detail": "This dashboard is for teachers."}, status=status.HTTP_403_FORBIDDEN)
        teacher_name = user.full_name if user.role == User.Role.TEACHER else ""

        classrooms_qs = managed_courses(user)
        course_ids = list(classrooms_qs.values_list("id", flat=True))
        students_qs = User.objects.filter(
            enrollments__classroom__in=classrooms_qs,
            enrollments__is_active=True,
            role=User.Role.STUDENT,
        ).distinct()
        student_ids = list(students_qs.values_list("id", flat=True))
        total_students = len(student_ids)

        # Students enrolled in the last 7 days.
        seven_days_ago = timezone.now() - timedelta(days=7)
        new_students = Enrollment.objects.filter(
            classroom__in=classrooms_qs, is_active=True, enrolled_at__gte=seven_days_ago
        ).count()
        student_delta = f"+{new_students}" if new_students else ""

        # Risk alerts come from graded work only. Attendance is not recorded, so it is never used.
        averages = average_by_student(student_ids, course_ids)
        names = {u.id: u.full_name for u in students_qs}
        real_risk_alerts = []
        for student_id, avg in averages.items():
            if avg < 40:
                level, reason = "high", f"Average score is critically low ({int(avg)}%)"
            elif avg < 60:
                level, reason = "moderate", f"Below average score ({int(avg)}%)"
            else:
                continue
            real_risk_alerts.append({"id": f"S{student_id}", "name": names.get(student_id, ""), "level": level, "reason": reason, "score": avg})
        real_risk_alerts.sort(key=lambda x: (0 if x["level"] == "high" else 1, x["score"]))
        risk_alerts = real_risk_alerts[:4]
        risk_alerts_count = len(real_risk_alerts)

        overall_average = course_average(course_ids, student_ids)

        stats = [
            {
                "label": "Active Students",
                "value": f"{total_students:,}",
                "delta": student_delta,
                "icon": "Users",
                "color": "#264796",
                "bg": "rgba(38,71,150,0.1)",
                "accent": "border-l-[#264796]",
            },
            {
                "label": "Risk Alerts",
                "value": str(risk_alerts_count),
                "delta": f"{risk_alerts_count} active",
                "icon": "AlertTriangle",
                "color": "#dc2626",
                "bg": "rgba(220,38,38,0.1)",
                "accent": "border-l-red-500",
            },
            {
                "label": "Average Score",
                "value": f"{overall_average}%" if overall_average is not None else "Not recorded",
                "delta": "graded work" if overall_average is not None else "no graded work yet",
                "icon": "TrendingUp",
                "color": "#16a34a",
                "bg": "rgba(22,163,74,0.1)",
                "accent": "border-l-green-500",
            },
        ]

        # Classrooms. Progress is the share of the class's assignments whose due date has passed.
        now_for_progress = timezone.now()
        classrooms = []
        for c in classrooms_qs.select_related("batch", "teacher")[:4]:
            latest_lesson = Lesson.objects.filter(course=c).order_by("-posted_at").first()
            time_str = latest_lesson.posted_at.strftime("%I:%M %p") if latest_lesson and latest_lesson.posted_at else None
            count = Enrollment.objects.filter(classroom=c, is_active=True).count()
            due_dates = [_parse_date_safe(a.due_date) for a in Assignment.objects.filter(course=c)]
            total_assignments = len(due_dates)
            past_due = 0
            for d in due_dates:
                if d is None:
                    continue
                d = timezone.make_aware(d) if isinstance(d, datetime) and timezone.is_naive(d) else d
                if isinstance(d, datetime) and d < now_for_progress:
                    past_due += 1
            classrooms.append({
                "id": c.id,
                "code": c.subject_code,
                "name": c.name,
                "batch": c.batch.name if c.batch else "",
                "students": count,
                "time": time_str,
                "progress": round(100 * past_due / total_assignments) if total_assignments else None,
                "teacher": c.teacher.full_name if c.teacher else "Not Assigned",
            })

        # Recent Activity
        color_map = {
            "mail": "#264796",
            "appointment": "#16a34a",
            "calendar": "#d0ae61",
            "omr": "#dc2626",
            "student": "#2563eb",
            "course": "#7c3aed",
            "default": "#264796",
        }
        icon_map = {
            "mail": "BookOpen",
            "appointment": "CheckCircle2",
            "calendar": "Calendar",
            "omr": "BrainCircuit",
            "student": "Users",
            "course": "BookOpen",
            "default": "Activity",
        }
        history_records = ActionHistory.objects.order_by("-timestamp")[:4]
        recent_activity = []
        for h in history_records:
            feat = (h.feature or "default").lower()
            recent_activity.append({
                "text": f"{feat.capitalize()}: {(h.action or '').replace('_', ' ')}",
                "time": format_relative_time(h.timestamp),
                "icon": icon_map.get(feat, icon_map["default"]),
                "color": color_map.get(feat, color_map["default"]),
            })

        # Schedule
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        week_end = today_start + timedelta(days=7)

        schedule_items = []

        appt_qs = Appointment.objects.exclude(status="rejected")
        if teacher_name:
            appt_qs = appt_qs.filter(teacher_name__icontains=teacher_name)
        for appt in appt_qs:
            dt = _parse_date_safe(appt.time_slot) or _parse_date_safe(appt.requested_at)
            if dt:
                dt_aware = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
                if today_start <= dt_aware < today_end:
                    schedule_items.append({
                        "name": appt.agenda or "Meeting",
                        "code": "APT",
                        "course_id": None,
                        "time": dt_aware,
                        "room": appt.meeting_mode or "Office",
                        "status": "upcoming",
                    })

        for lesson in Lesson.objects.filter(course__in=classrooms_qs):
            if lesson.posted_at and today_start <= lesson.posted_at < today_end:
                schedule_items.append({
                    "name": lesson.title or lesson.topic or "Lecture Session",
                    "code": lesson.course.subject_code if lesson.course else "CLASS",
                    "course_id": lesson.course_id,
                    "time": lesson.posted_at,
                    "room": "Lecture Hall",
                    "status": "live" if 0 <= (now - lesson.posted_at).total_seconds() < 3600 else "upcoming",
                })

        ce_qs = CalendarEvent.objects.filter(start_time__gte=today_start, start_time__lt=today_end)
        if teacher_name:
            ce_qs = ce_qs.filter(teacher_name__icontains=teacher_name)
        for ev in ce_qs:
            schedule_items.append({
                "name": ev.title,
                "code": "EVENT",
                "course_id": ev.course_id,
                "time": ev.start_time,
                "room": ev.location or "Campus",
                "status": "live" if ev.start_time <= now <= (ev.end_time or ev.start_time + timedelta(hours=1)) else "upcoming",
            })

        for asgn in Assignment.objects.filter(course__in=classrooms_qs):
            dt = _parse_date_safe(asgn.due_date)
            if dt:
                dt_aware = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
                if today_start <= dt_aware < today_end:
                    schedule_items.append({
                        "name": f"Due: {asgn.title}",
                        "code": asgn.course.subject_code if asgn.course else "DUE",
                        "course_id": asgn.course_id,
                        "time": dt_aware,
                        "room": "Submission",
                        "status": "upcoming",
                    })

        for exam in Exam.objects.filter(course__in=classrooms_qs):
            if exam.created_at and today_start <= exam.created_at < today_end:
                schedule_items.append({
                    "name": f"Exam: {exam.title}",
                    "code": exam.course.subject_code if exam.course else "EXAM",
                    "course_id": exam.course_id,
                    "time": exam.created_at,
                    "room": "Online",
                    "status": "upcoming",
                })

        schedule_items.sort(key=lambda x: x["time"])
        schedule = []
        for item in schedule_items[:5]:
            schedule.append({
                "name": item["name"],
                "code": item["code"],
                "course_id": item.get("course_id"),
                "time": item["time"].strftime("%I:%M %p"),
                "room": item["room"],
                "status": item["status"],
            })

        # Pending Appointments
        all_appts = Appointment.objects.all().order_by("-id")
        if teacher_name:
            all_appts = all_appts.filter(teacher_name__icontains=teacher_name)
        pending_appointments = [
            {
                "id": a.id,
                "studentName": a.student_name or "Student",
                "agenda": a.agenda or "Appointment request",
                "timeSlot": a.time_slot or "Time pending",
                "status": a.status,
            }
            for a in all_appts.filter(status="pending")[:5]
        ]

        # Recent Reports
        recent_reports = [
            {
                "id": r.report_id or str(r.id),
                "name": r.name or r.type or "Report",
                "status": r.status,
                "generatedAt": r.generated_at.isoformat() if r.generated_at else None,
            }
            for r in (Report.objects.all() if is_master_admin(user) else Report.objects.filter(owner=user)).order_by("-generated_at")[:3]
        ]

        # Mail Stats
        mail_week_start = now - timedelta(days=7)
        mails_this_week = MailHistory.objects.filter(sent_at__gte=mail_week_start).count()
        last_mail = MailHistory.objects.order_by("-sent_at").first()
        mail_stats = {
            "sentThisWeek": mails_this_week,
            "lastSentAt": last_mail.sent_at.isoformat() if last_mail and last_mail.sent_at else None,
        }

        # Upcoming Exams
        exams_qs = Exam.objects.all().order_by("-created_at")
        if classrooms_qs.exists():
            exams_qs = exams_qs.filter(course__in=classrooms_qs)
        upcoming_exams = [
            {
                "id": e.id,
                "title": e.title or "Untitled exam",
                "courseId": e.course_id,
                "scheduledAt": e.created_at.isoformat() if e.created_at else None,
                "status": e.status,
            }
            for e in exams_qs[:3]
        ]

        # Engagement Snapshot: attendance is not recorded anywhere, so it is reported as None.
        avg_attendance = None
        avg_score = overall_average

        engagement_snapshot = {
            "avgAttendance": avg_attendance,
            "avgScore": avg_score,
            "atRiskCount": len(real_risk_alerts),
            "studentCount": total_students,
        }

        # Calendar events this week
        calendar_events_count = CalendarEvent.objects.filter(
            start_time__gte=today_start, start_time__lt=week_end
        ).count()
        appointment_events_this_week = 0
        for appt in all_appts:
            dt = _parse_date_safe(appt.time_slot)
            if dt:
                dt_aware = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
                if today_start <= dt_aware < week_end:
                    appointment_events_this_week += 1

        calendar_events_this_week = calendar_events_count + appointment_events_this_week

        return Response({
            "stats": stats,
            "classrooms": classrooms,
            "riskAlerts": risk_alerts,
            "recentActivity": recent_activity,
            "schedule": schedule,
            "pendingAppointments": pending_appointments,
            "recentReports": recent_reports,
            "mailStats": mail_stats,
            "upcomingExams": upcoming_exams,
            "engagementSnapshot": engagement_snapshot,
            "calendarEventsToday": len(schedule),
            "calendarEventsThisWeek": calendar_events_this_week,
            # Legacy fields for backward compatibility
            "total_courses": classrooms_qs.count(),
            "total_students": total_students,
            "total_assignments": Assignment.objects.filter(course__in=classrooms_qs).count(),
            "total_submissions": Submission.objects.filter(assignment__course__in=classrooms_qs).count(),
            "total_exams": Exam.objects.filter(course__in=classrooms_qs).count(),
            "avg_attendance": avg_attendance,
            "recent_activities": recent_activity,
            "upcoming_deadlines": [],
        })


class DiscoverableClassroomsView(APIView):

    def get(self, request):
        courses = Classroom.objects.exclude(enrollment_code="")
        classrooms = []
        for c in courses:
            student_count = Enrollment.objects.filter(classroom=c, is_active=True).count()
            classrooms.append({
                "id": c.id,
                "code": c.subject_code,
                "name": c.name,
                "batch": c.batch.name if c.batch else "",
                "students": student_count,
                "progress": None,
                "color": c.color or "#264796",
                "description": c.description or "",
                "enrollment_code": c.enrollment_code,
                "teacher_name": c.teacher.full_name if c.teacher else "Instructor",
                "course_plan_path": c.course_plan_path or None,
            })
        return Response(classrooms)


class StudentDashboardSummaryView(APIView):
    """The signed-in student's own dashboard: their courses, open deadlines and live games."""

    def get(self, request):
        from apps.core.access import visible_courses
        from apps.core.services import student_keys
        from apps.games.models import GamePlayer

        student = request.user
        if student.role != User.Role.STUDENT:
            return Response({"detail": "This dashboard is for students."}, status=status.HTTP_403_FORBIDDEN)

        enrolled_classrooms = visible_courses(student).select_related("teacher", "batch")
        course_ids = list(enrolled_classrooms.values_list("id", flat=True))

        submitted_ids = set(
            Submission.objects.filter(assignment__course_id__in=course_ids, student=student)
            .values_list("assignment_id", flat=True)
        )

        now = timezone.now()
        open_assignments = []
        for asgn in Assignment.objects.filter(course_id__in=course_ids).select_related("course"):
            if asgn.id in submitted_ids:
                continue
            due_dt = _parse_date_safe(asgn.due_date)
            due_aware = None
            if due_dt:
                due_aware = timezone.make_aware(due_dt) if timezone.is_naive(due_dt) else due_dt
            open_assignments.append((due_aware, asgn))
        # Soonest deadline first; assignments with no (or unreadable) due date go last.
        open_assignments.sort(key=lambda pair: (pair[0] is None, pair[0] or now))

        upcoming_deadlines = [
            {
                "id": asgn.id,
                "title": asgn.title,
                "course_code": asgn.course.subject_code,
                "course_id": asgn.course_id,
                "due_date": asgn.due_date,
                "is_urgent": bool(due_aware and (due_aware - now).days < 2),
            }
            for due_aware, asgn in open_assignments[:5]
        ]

        keys = student_keys(student)
        live_games = ChainAnswerGame.objects.filter(status="active", players__student_id__in=keys).distinct()
        live_game_info = {"title": "", "teacher": "", "active": False}
        game = live_games.first()
        if game:
            teacher = User.objects.filter(pk=game.teacher_id).first() if game.teacher_id else None
            live_game_info = {
                "title": game.name or "Live game",
                "teacher": teacher.full_name if teacher else "",
                "active": True,
            }

        assignment_counts = {
            row["course_id"]: row["total"]
            for row in Assignment.objects.filter(course_id__in=course_ids).values("course_id").annotate(total=Count("id"))
        }
        submitted_per_course = {}
        for assignment_id, course_id in Assignment.objects.filter(id__in=submitted_ids).values_list("id", "course_id"):
            submitted_per_course[course_id] = submitted_per_course.get(course_id, 0) + 1

        def progress(course_id):
            total = assignment_counts.get(course_id, 0)
            return round(100 * submitted_per_course.get(course_id, 0) / total, 1) if total else None

        courses_payload = [
            {
                "id": c.id,
                "code": c.subject_code,
                "name": c.name,
                "teacher_name": c.teacher.full_name if c.teacher else "",
                "students": Enrollment.objects.filter(classroom=c, is_active=True).count(),
                "batch": c.batch.name if c.batch else "",
                "progress": progress(c.id),
                "description": c.description or "",
                "course_plan_path": c.course_plan_path or None,
                "color": c.color or "#3b82f6",
            }
            for c in enrolled_classrooms
        ]

        return Response({
            "student": {
                "name": student.full_name,
                "gpa": None,
                "level": None,
                "pendingAssignments": len(open_assignments),
                "liveGames": live_games.count(),
            },
            "courses": courses_payload,
            "deadlines": upcoming_deadlines,
            "liveGame": live_game_info,
        })


class GlobalRiskView(APIView):
    """At-risk students across the teacher's classes, judged on graded work only."""

    def get(self, request):
        from apps.assignments.stats import average_by_student, course_average
        from apps.core.access import is_master_admin, managed_courses

        user = request.user
        if not (is_master_admin(user) or user.role == User.Role.TEACHER):
            return Response({"detail": "This view is for teachers."}, status=status.HTTP_403_FORBIDDEN)
        classrooms = managed_courses(user)
        course_ids = list(classrooms.values_list("id", flat=True))
        students = User.objects.filter(
            enrollments__classroom__in=classrooms, enrollments__is_active=True, role=User.Role.STUDENT
        ).distinct()
        by_id = {s.id: s for s in students}
        averages = average_by_student(list(by_id), course_ids)

        risk_students = []
        for student_id, avg in sorted(averages.items(), key=lambda pair: pair[1]):
            if avg >= 60:
                break
            s = by_id[student_id]
            risk_students.append({
                "id": s.register_no or f"ST-{s.id}",
                "name": s.full_name,
                "attendance": None,
                "avgScore": avg,
                "risk": round(100 - avg),
                "level": "high" if avg < 40 else "moderate",
            })

        overall = course_average(course_ids, list(by_id))
        return Response({
            "overview": {
                "avg_score": f"{overall}%" if overall is not None else None,
                "total_students": len(by_id),
                "at_risk_count": len(risk_students),
                "attendance_rate": None,
            },
            "risk_students": risk_students[:5],
            "course_count": classrooms.count(),
        })


class CourseAnalyticsView(APIView):

    def get(self, request, course_id):
        from apps.assignments.stats import course_average
        from apps.core.access import can_manage_course

        classroom = Classroom.objects.filter(pk=course_id).first()
        if classroom is None:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_course(request.user, classroom):
            return Response({"detail": "You do not have permission to view this course."}, status=status.HTTP_403_FORBIDDEN)
        student_count = Enrollment.objects.filter(classroom_id=course_id, is_active=True).count()
        assignments_count = Assignment.objects.filter(course_id=course_id).count()
        exams_count = Exam.objects.filter(course_id=course_id).count()

        return Response({
            "course_id": course_id,
            "course_name": classroom.name,
            "student_count": student_count,
            "assignments_count": assignments_count,
            "exams_count": exams_count,
            "avg_score": course_average([course_id]),
            "avg_attendance": None,
        })
