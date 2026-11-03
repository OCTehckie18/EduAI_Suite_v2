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
