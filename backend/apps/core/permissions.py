from rest_framework import permissions

class IsMasterAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, 'role', '') == 'MASTER_ADMIN'))

class IsCampusAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') in ['CAMPUS_ADMIN', 'MASTER_ADMIN'])

class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') in ['TEACHER', 'CAMPUS_ADMIN', 'MASTER_ADMIN'])

class IsStudent(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') == 'STUDENT')
