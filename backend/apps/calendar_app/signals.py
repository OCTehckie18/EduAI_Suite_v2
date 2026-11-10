"""Queue a Google Calendar sync for the users whose calendar a change affects.

Nothing here talks to Google: a change only adds the affected, connected users to the outbox
(``CalendarSyncRequest``), and the worker (``manage.py sync_google_calendars``) sends it within about a
minute. A failure in here must never undo the change that caused it, so everything is guarded.
"""

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.assignments.models import Assignment
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamAttempt
from apps.lessons.models import Lesson
from apps.quizzes.models import QuizSession

from .models import CalendarEvent, CalendarSyncRequest, GoogleCalendarLink

logger = logging.getLogger(__name__)


def queue_sync(user_ids):
    """Add the connected users among ``user_ids`` (and every connected admin, who sees everything) to the outbox."""
    ids = {pk for pk in user_ids if pk}
    links = GoogleCalendarLink.objects.exclude(status=GoogleCalendarLink.Status.REVOKED)
    if not links.exists():
        return
    User = get_user_model()
    admins = set(User.objects.filter(role=User.Role.MASTER_ADMIN, google_calendar_link__isnull=False).values_list("pk", flat=True))
    targets = set(links.filter(user_id__in=ids | admins).values_list("user_id", flat=True))
    now = timezone.now()
    for user_id in targets:
        # A new change is due at once, even if an earlier attempt was backing off.
        CalendarSyncRequest.objects.update_or_create(user_id=user_id, defaults={"attempts": 0, "next_attempt_at": now})


def _after_commit(user_ids_fn):
    """Work out the affected users when the change is committed, and never raise."""

    def run():
        try:
            queue_sync(user_ids_fn())
        except Exception:  # pragma: no cover - defensive
            logger.exception("Could not queue a Google Calendar sync")

    transaction.on_commit(run)


def course_people(course_id):
    """The teacher and the active students of a class."""
    if not course_id:
        return set()
    people = set(Enrollment.objects.filter(classroom_id=course_id, is_active=True).values_list("student_id", flat=True))
    teacher = Classroom.all_objects.filter(pk=course_id).values_list("teacher_id", flat=True).first()
    if teacher:
        people.add(teacher)
    return people


def _users_by_email(email):
    if not email:
        return set()
    return set(get_user_model().objects.filter(email__iexact=email).values_list("pk", flat=True))


def _users_by_name(name):
    if not name:
        return set()
    User = get_user_model()
    wanted = name.strip().lower()
    return {u.pk for u in User.objects.filter(role__in=[User.Role.TEACHER, User.Role.MASTER_ADMIN]) if u.full_name.lower() == wanted}


@receiver([post_save, post_delete], sender=CalendarEvent)
def calendar_event_changed(sender, instance, **kwargs):
    def users():
        if instance.course_id:
            people = course_people(instance.course_id)
        elif instance.created_by_id or instance.student_email or instance.teacher_name:
            people = set()
        else:
            # An institution-wide event: everyone sees it.
            people = set(GoogleCalendarLink.objects.values_list("user_id", flat=True))
        people |= {instance.created_by_id} | _users_by_email(instance.student_email) | _users_by_name(instance.teacher_name)
        return people
    _after_commit(users)


@receiver([post_save, post_delete], sender=Exam)
@receiver([post_save, post_delete], sender=Assignment)
@receiver([post_save, post_delete], sender=Lesson)
def course_item_changed(sender, instance, **kwargs):
    course_id = getattr(instance, "course_id", None)
    _after_commit(lambda: course_people(course_id))


@receiver([post_save, post_delete], sender=ExamAttempt)
def attempt_changed(sender, instance, **kwargs):
    student_id = instance.student_id
    _after_commit(lambda: {student_id})


@receiver([post_save, post_delete], sender=Appointment)
def appointment_changed(sender, instance, **kwargs):
    _after_commit(lambda: _users_by_email(instance.student_email) | _users_by_name(instance.teacher_name))


@receiver([post_save, post_delete], sender=Enrollment)
def enrollment_changed(sender, instance, **kwargs):
    _after_commit(lambda: {instance.student_id})


@receiver([post_save, post_delete], sender=QuizSession)
def quiz_session_changed(sender, instance, **kwargs):
    def users():
        teacher = getattr(instance.quiz, "teacher_id", None)
        return {teacher}
    _after_commit(users)
