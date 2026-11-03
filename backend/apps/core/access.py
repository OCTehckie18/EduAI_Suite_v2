"""Shared role and campus-scope helpers.

Master admins (and Django superusers) act across every campus. Campus admins
are limited to the campus on their own account. Everything that decides "may
this admin touch that record" should go through these helpers so the rule is
written once.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

MASTER_ROLE = "MASTER_ADMIN"
CAMPUS_ROLE = "CAMPUS_ADMIN"

# Attribute chain from a record to its owning campus id.
_CAMPUS_CHAINS = {
    "Campus": (),
    "School": ("campus",),
    "Department": ("school", "campus"),
    "Program": ("department", "school", "campus"),
    "Batch": ("program", "department", "school", "campus"),
    "Section": ("batch", "program", "department", "school", "campus"),
    "Classroom": ("department", "school", "campus"),
}


def is_master_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") == MASTER_ROLE)
    )


def is_campus_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and not is_master_admin(user)
        and getattr(user, "role", "") == CAMPUS_ROLE
    )


def campus_id_of(obj):
    """Id of the campus a hierarchy record (or classroom) belongs to, if any."""
    chain = _CAMPUS_CHAINS.get(type(obj).__name__)
    if chain is None:
        return None
    if not chain:
        return obj.pk
    current = obj
    for attribute in chain[:-1]:
        current = getattr(current, attribute, None)
        if current is None:
            return None
    return getattr(current, f"{chain[-1]}_id", None)


def can_manage_campus(user, campus_id) -> bool:
    if is_master_admin(user):
        return True
    return bool(is_campus_admin(user) and campus_id and user.campus_id == campus_id)


def scope_to_campus(queryset, user, lookup):
    """Limit a queryset to the admin's campus; ``lookup`` is the ORM path to the campus id."""
    if is_master_admin(user):
        return queryset
    if is_campus_admin(user) and user.campus_id:
        return queryset.filter(**{lookup: user.campus_id})
    return queryset.none()


class IsMasterOrCampusAdminForWrites(BasePermission):
    """Any signed-in user may read; writes need an admin and, for campus admins, campus scope."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_master_admin(user) or is_campus_admin(user)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS or is_master_admin(request.user):
            return True
        if type(obj).__name__ == "Campus":
            return False  # creating, editing or removing campuses is master-admin only
        return can_manage_campus(request.user, campus_id_of(obj))
