"""Shared role helpers.

Master admins (and Django superusers) administer the whole institution. There
is no campus-level administrator role: every hierarchy and approval power
belongs to the master admin.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

MASTER_ROLE = "MASTER_ADMIN"


def is_master_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") == MASTER_ROLE)
    )


class IsMasterAdminOrReadOnly(BasePermission):
    """Any signed-in user may read; only master admins may write."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or is_master_admin(user)


# ---- course (classroom) access ------------------------------------------------

def can_manage_course(user, classroom) -> bool:
    """The course's own teacher, or a master admin."""
    return bool(
        user
        and user.is_authenticated
        and (is_master_admin(user) or classroom.teacher_id == user.pk)
    )


def can_view_course(user, classroom) -> bool:
    """Whoever manages the course, plus students actively enrolled in it."""
    if can_manage_course(user, classroom):
        return True
    if not (user and user.is_authenticated and getattr(user, "role", "") == "STUDENT"):
        return False
    from apps.classrooms.models import Enrollment

    return Enrollment.objects.filter(classroom=classroom, student=user, is_active=True).exists()


def managed_courses(user):
    """Classrooms the user may manage (all for master admins)."""
    from apps.classrooms.models import Classroom

    return Classroom.objects.all() if is_master_admin(user) else Classroom.objects.filter(teacher=user)


def managed_students(user):
    """Students enrolled in a classroom the user manages (every student for a master admin)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    students = User.objects.filter(role=User.Role.STUDENT)
    if is_master_admin(user):
        return students
    return students.filter(enrollments__is_active=True, enrollments__classroom__teacher=user).distinct()


def visible_courses(user):
    """Classrooms the user may see: their own as a teacher, or the ones a student is enrolled in."""
    from apps.classrooms.models import Classroom

    if is_master_admin(user):
        return Classroom.objects.all()
    if getattr(user, "role", "") == "TEACHER":
        return Classroom.objects.filter(teacher=user)
    return Classroom.objects.filter(enrollments__student=user, enrollments__is_active=True).distinct()
