from datetime import datetime, timezone as dt_timezone

from django.utils import timezone

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.permissions import IsMasterAdmin
from apps.core.models import ActionHistory
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .services import content_type_key, model_for_key, soft_delete_models


_EPOCH = datetime(1970, 1, 1, tzinfo=dt_timezone.utc)
MAX_RECYCLE_ITEMS_PER_MODEL = 200


def _record_admin_action(request, action, target, metadata=None):
    ActionHistory.objects.create(
        feature="master_admin",
        action=action,
        reaction="master_admin_triggered",
        result="success",
        user_id=str(request.user.pk),
        metadata_json={
            "target": target,
            **(metadata or {}),
        },
    )


class MasterAdminOverviewView(APIView):
    """Cross-campus KPI snapshot for the Master Admin dashboard."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        return Response({
            "institution": {
                "campuses": Campus.objects.count(),
                "schools": School.objects.count(),
                "departments": Department.objects.count(),
                "programs": Program.objects.count(),
                "batches": Batch.objects.count(),
                "sections": Section.objects.count(),
            },
            "classrooms": Classroom.objects.count(),
            "users": {
                "total": User.objects.count(),
                "master_admins": User.objects.filter(role=User.Role.MASTER_ADMIN).count(),
                "teachers": User.objects.filter(role=User.Role.TEACHER, approval_status=User.ApprovalStatus.APPROVED).count(),
                "pending_teacher_approvals": User.objects.filter(role=User.Role.TEACHER, approval_status=User.ApprovalStatus.PENDING).count(),
                "students": User.objects.filter(role=User.Role.STUDENT).count(),
            },
        })


class RecycleBinListView(APIView):
    """Unified view of soft-deleted records across every app, filterable by ?model=app_label.model_name."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        requested_key = request.query_params.get("model")
        search = request.query_params.get("search", "").strip().lower()
        if requested_key:
            model = model_for_key(requested_key)
            models = [model] if model else []
        else:
            models = soft_delete_models()

        items = []
        for model in models:
            key = content_type_key(model)
            matched = 0
            # Search first, then cap, so older deleted records stay findable.
            for instance in model.all_objects.filter(is_active=False).order_by("-deleted_at", "-pk").iterator():
                label = str(instance)
                if search and search not in label.lower() and search not in key.lower():
                    continue
                items.append({
                    "content_type": key,
                    "id": instance.pk,
                    "label": label,
                    "deleted_at": instance.deleted_at,
                })
                matched += 1
                if matched >= MAX_RECYCLE_ITEMS_PER_MODEL:
                    break
        items.sort(key=lambda entry: entry["deleted_at"] or _EPOCH, reverse=True)
        return Response({"count": len(items), "results": items})


class RecycleBinRestoreView(APIView):
    """Generic restore endpoint for any soft-deleted record, addressed by content type + id."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request, content_type, pk):
        model = model_for_key(content_type)
        if model is None:
            return Response({"detail": "Unknown or unsupported content type."}, status=404)
        try:
            instance = model.all_objects.get(pk=pk)
        except model.DoesNotExist:
            return Response({"detail": "Record not found."}, status=404)
        if instance.is_active:
            return Response({"detail": "Record is already active."}, status=400)
        blockers = instance.restore_blockers()
        if blockers:
            return Response(
                {"detail": "Restore the parent records first: " + "; ".join(blockers)},
                status=409,
            )
        try:
            with transaction.atomic():
                instance.restore()
                _record_admin_action(
                    request, "restore_record", f"{content_type}:{instance.pk}"
                )
        except IntegrityError:
            return Response(
                {"detail": "This record conflicts with an existing active record."},
                status=409,
            )
        return Response({"success": True, "content_type": content_type, "id": instance.pk})


class CampusSummaryView(APIView):
    """Per-campus counts for the Master Admin campus table, straight from the database."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        campuses = Campus.objects.annotate(
            school_count=Count("schools", filter=Q(schools__is_active=True), distinct=True),
            department_count=Count(
                "schools__departments",
                filter=Q(schools__is_active=True, schools__departments__is_active=True),
                distinct=True,
            ),
            student_count=Count(
                "users",
                filter=Q(users__role=User.Role.STUDENT, users__is_active=True),
                distinct=True,
            ),
        ).order_by("name")
        return Response({"results": [
            {
                "id": c.pk,
                "name": c.name,
                "code": c.code,
                "city": c.city,
                "state": c.state,
                "address": c.address,
                "schools": c.school_count,
                "departments": c.department_count,
                "students": c.student_count,
                "is_active": c.is_active,
            }
            for c in campuses
        ]})

    def post(self, request):
        data = request.data
        name = str(data.get("name", "")).strip()
        code = str(data.get("code", "")).strip().upper()
        city = str(data.get("city", "")).strip()
        if not name or not code or not city:
            return Response(
                {"detail": "Name, code, and city are required."},
                status=400,
            )
        try:
            with transaction.atomic():
                campus = Campus.objects.create(
                    name=name,
                    code=code,
                    city=city,
                    state=str(data.get("state", "Karnataka")).strip(),
                    address=str(data.get("address", "")).strip(),
                )
                _record_admin_action(
                    request, "create_campus", f"institution.campus:{campus.pk}"
                )
        except IntegrityError:
            return Response(
                {"detail": "A campus with this code already exists."},
                status=400,
            )
        return Response(_campus_payload(campus), status=201)


def _campus_payload(campus):
    return {
        "id": campus.pk,
        "name": campus.name,
        "code": campus.code,
        "city": campus.city,
        "state": campus.state,
        "address": campus.address,
        "is_active": campus.is_active,
    }


class CampusDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request, pk):
        campus = get_object_or_404(Campus, pk=pk)
        return Response(_campus_payload(campus))

    def put(self, request, pk):
        campus = get_object_or_404(Campus, pk=pk)
        data = request.data
        for field in ("name", "city", "state", "address"):
            if field in data:
                value = str(data[field]).strip()
                if field in ("name", "city") and not value:
                    return Response(
                        {"detail": f"{field.capitalize()} is required."},
                        status=400,
                    )
                setattr(campus, field, value)
        if "code" in data:
            code = str(data["code"]).strip().upper()
            if not code:
                return Response({"detail": "Code is required."}, status=400)
            campus.code = code
        try:
            with transaction.atomic():
                campus.save()
                _record_admin_action(
                    request, "update_campus", f"institution.campus:{campus.pk}"
                )
        except IntegrityError:
            return Response(
                {"detail": "A campus with this code already exists."},
                status=400,
            )
        return Response(_campus_payload(campus))

    def delete(self, request, pk):
        campus = get_object_or_404(Campus, pk=pk)
        campus.delete()
        _record_admin_action(
            request, "deactivate_campus", f"institution.campus:{campus.pk}"
        )
        return Response({"success": True, "id": campus.pk})


def _user_payload(user):
    return {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": user.full_name,
        "register_no": user.register_no,
        "emp_no": user.emp_no,
        "role": user.role,
        "approval_status": user.approval_status,
        "is_active": user.is_active,
        "campus": (
            {"id": user.campus_id, "name": user.campus.name}
            if user.campus_id and user.campus
            else None
        ),
        "created_at": user.created_at,
    }


class UserDirectoryView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        queryset = User.all_objects.select_related("campus").order_by("email")
        active = request.query_params.get("active", "true").lower()
        if active == "true":
            queryset = queryset.filter(is_active=True)
        elif active == "false":
            queryset = queryset.filter(is_active=False)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(register_no__icontains=search)
                | Q(emp_no__icontains=search)
            )
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        campus_id = request.query_params.get("campus")
        if campus_id:
            queryset = queryset.filter(campus_id=campus_id)
        results = list(queryset[:200])
        return Response({
            "count": queryset.count(),
            "results": [_user_payload(user) for user in results],
        })

    def post(self, request):
        User = get_user_model()
        data = request.data
        email = str(data.get("email", "")).strip().lower()
        if not email or not data.get("password"):
            return Response(
                {"detail": "Email and password are required."}, status=400
            )
        role = data.get("role", User.Role.STUDENT)
        if role not in {choice[0] for choice in User.Role.choices}:
            return Response({"detail": "Invalid role."}, status=400)
        try:
            validate_password(str(data["password"]))
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email,
                    password=data["password"],
                    first_name=str(data.get("first_name", "")).strip(),
                    last_name=str(data.get("last_name", "")).strip(),
                    role=role,
                    campus_id=data.get("campus"),
                    register_no=data.get("register_no") or None,
                    emp_no=data.get("emp_no") or None,
                )
                _record_admin_action(
                    request, "create_user", f"accounts.user:{user.pk}"
                )
        except (IntegrityError, ValueError):
            return Response(
                {"detail": "User data is invalid or already in use."}, status=400
            )
        return Response(_user_payload(user), status=201)


class UserDirectoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get_object(self, pk):
        User = get_user_model()
        return get_object_or_404(User.all_objects.select_related("campus"), pk=pk)

    def get(self, request, pk):
        return Response(_user_payload(self.get_object(pk)))

    def patch(self, request, pk):
        user = self.get_object(pk)
        data = request.data
        if user.pk == request.user.pk and data.get("role") not in (None, user.role):
            return Response(
                {"detail": "You cannot change your own Master Admin role."},
                status=400,
            )
        for field in ("first_name", "last_name", "phone_number"):
            if field in data:
                setattr(user, field, str(data[field] or "").strip())
        for field in ("register_no", "emp_no"):
            if field in data:
                setattr(user, field, str(data[field] or "").strip() or None)
        if "role" in data:
            valid_roles = {choice[0] for choice in user.Role.choices}
            if data["role"] not in valid_roles:
                return Response({"detail": "Invalid role."}, status=400)
            if user.role == user.Role.MASTER_ADMIN and data["role"] != user.role:
                if not self._has_another_admin(user):
                    return Response(
                        {"detail": "At least one active Master Admin must remain."},
                        status=400,
                    )
                # A demoted admin must not keep superuser access through the flag.
                user.is_superuser = False
                user.is_staff = False
            user.role = data["role"]
            if user.role == user.Role.TEACHER and user.approval_status != user.ApprovalStatus.APPROVED:
                # Making someone a teacher here is itself the approval.
                user.approval_status = user.ApprovalStatus.APPROVED
                user.rejection_reason = ""
                user.approval_reviewed_at = timezone.now()
                user.approval_reviewed_by = request.user
        if "campus" in data:
            campus_id = data["campus"]
            if campus_id is None:
                user.campus = None
            else:
                user.campus = get_object_or_404(Campus, pk=campus_id)
        try:
            user.save()
        except IntegrityError:
            return Response(
                {"detail": "Register number or employee number is already in use."},
                status=400,
            )
        _record_admin_action(request, "update_user", f"accounts.user:{user.pk}")
        return Response(_user_payload(user))

    def delete(self, request, pk):
        user = self.get_object(pk)
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot deactivate your own account."}, status=400
            )
        if user.role == user.Role.MASTER_ADMIN and not UserDirectoryDetailView._has_another_admin(user):
            return Response(
                {"detail": "At least one active Master Admin must remain."},
                status=400,
            )
        user.delete()
        _record_admin_action(request, "deactivate_user", f"accounts.user:{user.pk}")
        return Response({"success": True, "id": user.pk})

    @staticmethod
    def _has_another_admin(user):
        User = get_user_model()
        return User.objects.filter(
            role=User.Role.MASTER_ADMIN, is_active=True
        ).exclude(pk=user.pk).exists()

    def post(self, request, pk):
        user = self.get_object(pk)
        if user.is_active:
            return Response({"detail": "User is already active."}, status=400)
        user.restore()
        _record_admin_action(request, "restore_user", f"accounts.user:{user.pk}")
        return Response({"success": True, "user": _user_payload(user)})


def _hierarchy_name(value):
    return str(value) if value else None


def _application_payload(user):
    return {
        "id": user.pk,
        "name": user.full_name,
        "email": user.email,
        "emp_no": user.emp_no,
        "phone_number": user.phone_number,
        "profile_complete": user.is_profile_complete,
        "status": user.approval_status,
        "rejection_reason": user.rejection_reason,
        "campus": _hierarchy_name(user.campus),
        "school": _hierarchy_name(user.school),
        "department": _hierarchy_name(user.department),
        "applied_at": user.created_at,
        "reviewed_at": user.approval_reviewed_at,
        "reviewed_by": user.approval_reviewed_by.full_name if user.approval_reviewed_by_id else None,
    }


class TeacherApprovalListView(APIView):
    """Teacher applications from TeacherBuddy, awaiting the master admin's decision."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        applications = User.objects.filter(role=User.Role.TEACHER).select_related(
            "campus", "school", "department", "approval_reviewed_by"
        )
        wanted = request.query_params.get("status", "pending").upper()
        if wanted in {choice[0] for choice in User.ApprovalStatus.choices}:
            applications = applications.filter(approval_status=wanted)
        search = request.query_params.get("search", "").strip()
        if search:
            applications = applications.filter(
                Q(email__icontains=search) | Q(first_name__icontains=search)
                | Q(last_name__icontains=search) | Q(emp_no__icontains=search)
            )
        applications = applications.order_by("created_at")
        return Response({
            "count": applications.count(),
            "pending_count": User.objects.filter(
                role=User.Role.TEACHER, approval_status=User.ApprovalStatus.PENDING
            ).count(),
            "results": [_application_payload(user) for user in applications[:200]],
        })


class TeacherApprovalDecisionView(APIView):
    """Approve or reject one teacher application."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    decision = None  # set by as_view(decision="approve"|"reject")

    def post(self, request, pk):
        User = get_user_model()
        teacher = get_object_or_404(User.objects.filter(role=User.Role.TEACHER), pk=pk)
        if self.decision == "approve":
            if not teacher.is_profile_complete or not teacher.emp_no:
                return Response(
                    {"detail": "This applicant has not completed their profile (employee number and department) yet."},
                    status=409,
                )
            teacher.approval_status = User.ApprovalStatus.APPROVED
            teacher.rejection_reason = ""
        else:
            teacher.approval_status = User.ApprovalStatus.REJECTED
            teacher.rejection_reason = str(request.data.get("reason", "")).strip()[:500]
        teacher.approval_reviewed_at = timezone.now()
        teacher.approval_reviewed_by = request.user
        with transaction.atomic():
            teacher.save(update_fields=[
                "approval_status", "rejection_reason", "approval_reviewed_at", "approval_reviewed_by", "updated_at",
            ])
            _record_admin_action(
                request, f"{self.decision}_teacher", f"accounts.user:{teacher.pk}",
                {"reason": teacher.rejection_reason} if self.decision == "reject" else None,
            )
        return Response(_application_payload(teacher))
