from rest_framework import permissions

class IsMasterAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, 'role', '') == 'MASTER_ADMIN'))

class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') in ['TEACHER', 'MASTER_ADMIN'])

class IsStudent(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') == 'STUDENT')


class IsAdminOrAuthenticatedReadOnly(permissions.BasePermission):
    """Any signed-in user may read; only master admins may change data."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.is_superuser or getattr(user, 'role', '') in ['MASTER_ADMIN']
