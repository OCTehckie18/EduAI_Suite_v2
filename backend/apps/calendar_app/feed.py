"""Builds the calendar feed for the signed-in user from their real platform activity.

Every source is scoped to the requester: students see their enrolled classes, teachers
see the classes they teach, and admins keep the institution-wide view. Events use the
shape the calendar pages expect (`start`, `end`, `type`, `editable`, ...) and also keep
the original keys (`start_time`, `event_type`, `int_id`) for older callers.
"""
import re
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.appointments.models import Appointment
from apps.assignments.models import Assignment
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from apps.exams.models import Exam, ExamAttempt
from apps.lessons.models import Lesson
from apps.quizzes.models import QuizSession

from .models import CalendarEvent

ADMIN_ROLES = {"MASTER_ADMIN", "CAMPUS_ADMIN"}

COLORS = {
    "custom": "#264796",
    "deadline": "#d97706",
    "exam": "#dc2626",
    "appointment": "#16a34a",
    "class": "#7c3aed",
    "meeting": "#2563eb",
}

DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

HIDDEN_APPOINTMENT_STATUSES = {"rejected", "cancelled", "canceled"}


def is_admin(user) -> bool:
    return getattr(user, "role", "") in ADMIN_ROLES or bool(getattr(user, "is_superuser", False))


def parse_when(value):
    """Parse the mixed formats stored across the platform into an aware datetime.

    Returns (datetime | None, is_all_day). Handles ISO strings, "YYYY-MM-DD HH:MM"
    appointment slots, and bare dates (treated as all-day).
    """
    if not value:
        return None, False
    if isinstance(value, datetime):
        dt, all_day = value, False
    else:
        text = str(value).strip()
        day = parse_date(text) if DATE_ONLY.match(text) else None
        if day is not None:
            # A bare date carries no time of day, so it is an all-day event.
            dt, all_day = datetime.combine(day, time.min), True
        else:
            dt = parse_datetime(text.replace(" ", "T", 1) if "T" not in text else text)
            all_day = False
            if dt is None:
                return None, False
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt, all_day


def course_ids_for(user):
    """Classroom ids the user takes part in; None means unrestricted (admins)."""
    if is_admin(user):
        return None
    if getattr(user, "role", "") == "STUDENT":
        return list(Enrollment.objects.filter(student=user).values_list("classroom_id", flat=True))
    return list(Classroom.objects.filter(teacher=user).values_list("id", flat=True))


def _iso(dt):
    """ISO string in local time, so the calendar groups an event under the user's own date."""
    if not dt:
        return None
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return dt.isoformat()


def _event(prefix, raw_id, title, start, *, kind, end=None, description="", color=None,
           location="", all_day=False, source=None, editable=False, status=None, **extra):
    event = {
        "id": f"{prefix}_{raw_id}",
        "raw_id": raw_id,
        "int_id": raw_id,
        "title": title,
        "description": description or "",
        "start": _iso(start),
        "end": _iso(end or start),
        "start_time": _iso(start),
        "end_time": _iso(end),
        "type": kind,
        "event_type": kind,
        "color": color or COLORS.get(kind, COLORS["custom"]),
        "location": location or "",
        "is_all_day": all_day,
        "source": source or prefix,
        "editable": editable,
        "status": status,
    }
    event.update(extra)
    return event


def custom_events_for(user, course_ids):
    """Personal events, class events for the user's courses, and unowned institution events."""
    if is_admin(user):
        return CalendarEvent.objects.all()
    visible = (
        Q(created_by=user)
        | Q(student_email__iexact=user.email)
        | Q(teacher_name__iexact=user.full_name)
        | Q(created_by__isnull=True, student_email__isnull=True, teacher_name__isnull=True,
            course_id__isnull=True)
    )
    if course_ids:
        visible |= Q(course_id__in=course_ids)
    return CalendarEvent.objects.filter(visible)


def can_edit_event(user, event) -> bool:
    if is_admin(user):
        return True
    if event.created_by_id is not None:
        return event.created_by_id == user.pk
    return (
        (event.student_email or "").lower() == (user.email or "").lower()
        or (event.teacher_name or "").lower() == user.full_name.lower()
    )


def build_feed(user):
    role = getattr(user, "role", "")
    student = role == "STUDENT"
    admin = is_admin(user)
    course_ids = course_ids_for(user)
    in_courses = {} if course_ids is None else {"course_id__in": course_ids}
    events = []

    for ev in custom_events_for(user, course_ids):
        start, _ = parse_when(ev.start_time)
        kind = ev.event_type or "custom"
        events.append(_event(
            "event", ev.id, ev.title, start, kind=kind, end=ev.end_time,
            description=ev.description, color=ev.color, location=ev.location,
            all_day=ev.is_all_day, source="custom", editable=can_edit_event(user, ev),
            teacher_name=ev.teacher_name, student_email=ev.student_email, course_id=ev.course_id,
        ))

    for a in Assignment.objects.filter(**in_courses).select_related("course"):
        due, all_day = parse_when(a.due_date)
        if due:
            events.append(_event(
                "assignment", a.id, f"Due: {a.title}", due, kind="deadline",
                description=a.description, all_day=all_day, source="assignment",
                course_id=a.course_id,
            ))

    exams = Exam.objects.filter(**in_courses)
    if student:
        exams = exams.exclude(status="draft")
    for ex in exams:
        events.append(_event(
            "exam", ex.id, f"Exam: {ex.title}", ex.created_at, kind="exam",
            description=ex.description, source="exam", status=ex.status, course_id=ex.course_id,
        ))

    if student:
        attempts = ExamAttempt.objects.filter(student_id=user.pk).select_related("exam")
        for at in attempts:
            score = f" · Score: {at.score:g}" if at.score is not None else ""
            events.append(_event(
                "attempt", at.id, f"Attempted: {at.exam.title}", at.start_time, kind="exam",
                end=at.end_time, description=f"Status: {at.status}{score}",
                source="activity", status=at.status, course_id=at.exam.course_id,
            ))

    appointments = Appointment.objects.exclude(status__in=HIDDEN_APPOINTMENT_STATUSES)
    if student:
        appointments = appointments.filter(student_email__iexact=user.email)
    elif not admin:
        appointments = appointments.filter(teacher_name__iexact=user.full_name)
    for appt in appointments:
        slot, _ = parse_when(appt.time_slot)
        if slot:
            events.append(_event(
                "appointment", appt.id, f"Meeting: {appt.agenda or appt.student_name}", slot,
                kind="appointment", end=slot + timedelta(minutes=30), description=appt.details,
                location=appt.meeting_mode, source="appointment", status=appt.status,
                teacher_name=appt.teacher_name, student_email=appt.student_email,
            ))

    for lesson in Lesson.objects.filter(posted_at__isnull=False, **in_courses):
        events.append(_event(
            "lesson", lesson.id, f"Lesson: {lesson.title or lesson.topic}", lesson.posted_at,
            kind="class", source="lesson", course_id=lesson.course_id,
        ))

    if student:
        activities = StudentActivity.objects.filter(student_id=user.pk, activity_type="game")
        for act in activities:
            score = f"Score: {act.score:g}" if act.score is not None else act.status
            events.append(_event(
                "activity", act.id, f"Played: {act.title}", act.occurred_at, kind="class",
                description=score, source="activity", status=act.status,
            ))
    else:
        sessions = QuizSession.objects.filter(is_test_run=False).select_related("quiz")
        if not admin:
            sessions = sessions.filter(quiz__teacher_id=user.pk)
        for session in sessions:
            events.append(_event(
                "quiz", session.id, f"Quiz: {session.quiz.title or 'Untitled'}",
                session.started_at or session.created_at, kind="class", source="quiz",
                description=f"PIN {session.pin}", status=session.status,
            ))

    return sorted((e for e in events if e["start"]), key=lambda e: e["start"])


def tomorrow_notifications(events, now=None):
    """Events starting tomorrow (local time), for the 'Upcoming Tomorrow' banner."""
    now = timezone.localtime(now or timezone.now())
    tomorrow = (now + timedelta(days=1)).date()
    out = []
    for e in events:
        start = parse_datetime(e["start"])
        if start is None or timezone.localtime(start).date() != tomorrow:
            continue
        stamp = "all day" if e["is_all_day"] else f"at {timezone.localtime(start):%H:%M}"
        out.append({
            "id": e["id"],
            "title": e["title"],
            "start": e["start"],
            "type": e["type"],
            "color": e["color"],
            "source": e["source"],
            "message": f"{e['title']} is tomorrow, {stamp}.",
        })
    return out
