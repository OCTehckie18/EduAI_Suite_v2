from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.core.validators import validate_email
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.accounts.models import AdmittedStudent
from apps.accounts.roster import hierarchy_for
from apps.core.permissions import IsMasterAdmin
from apps.core.models import ActionHistory
from apps.institution.models import Batch, Campus, Department, Program, School, Section
from apps.institution import fields as university_fields
from apps.institution import terms as university_terms

from .services import (
    RestoreConflict, RestoreInvalid, apply_changes, content_type_key, editable_fields, find_conflicts,
    model_for_key, save_edited, soft_delete_models,
)


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


def _overview_extras(User):
    """The numbers a university board needs beyond plain counts: sign-up progress, teacher states,
    per-campus size, setup problems to fix, and what changed this week. Every figure is counted in the database."""
    from apps.accounts.models import AdmittedStudent

    week_ago = timezone.now() - timedelta(days=7)
    teachers = User.objects.filter(role=User.Role.TEACHER)
    oldest_pending = teachers.filter(approval_status=User.ApprovalStatus.PENDING).order_by("created_at").first()

    roster_by_class = [
        {
            "class_name": row["section__batch__name"],
            "program": row["section__batch__program__name"],
            "total": row["total"],
            "signed_up": row["signed_up"],
        }
        for row in AdmittedStudent.objects.values("section__batch__name", "section__batch__program__name")
        .annotate(total=Count("id"), signed_up=Count("id", filter=Q(user__is_profile_complete=True)))
        .order_by("-total")[:12]
    ]

    classroom_counts = {r["department__school__campus_id"]: r["n"] for r in Classroom.objects.values("department__school__campus_id").annotate(n=Count("id"))}
    teacher_counts = {
        r["department__school__campus_id"]: r["n"]
        for r in teachers.filter(approval_status=User.ApprovalStatus.APPROVED, department__isnull=False)
        .values("department__school__campus_id").annotate(n=Count("id"))
    }
    campus_stats = {
        str(campus_id): {"classrooms": classroom_counts.get(campus_id, 0), "teachers": teacher_counts.get(campus_id, 0)}
        for campus_id in set(classroom_counts) | set(teacher_counts)
    }

    # Things that are set up incompletely. Only problems that exist are listed.
    candidates = [
        ("batches_without_sections", "Classes (batches) with no section. Every class needs at least one.",
         Batch.objects.annotate(n=Count("sections")).filter(n=0).count(), "structure"),
        ("departments_without_programs", "Departments with no program yet.",
         Department.objects.annotate(n=Count("programs")).filter(n=0).count(), "structure"),
        ("empty_classrooms", "Classrooms with no enrolled students.",
         Classroom.objects.annotate(n=Count("enrollments", filter=Q(enrollments__is_active=True))).filter(n=0).count(), "users"),
        ("idle_teachers", "Approved teachers who have not created a classroom.",
         teachers.filter(approval_status=User.ApprovalStatus.APPROVED).annotate(n=Count("classrooms")).filter(n=0).count(), "users"),
        ("unplaced_students", "Signed-up students who are not in any classroom.",
         User.objects.filter(role=User.Role.STUDENT, is_profile_complete=True).annotate(n=Count("enrollments", filter=Q(enrollments__is_active=True))).filter(n=0).count(), "users"),
        ("unfinished_signups", "Admitted students who created an account but have not finished their profile.",
         AdmittedStudent.objects.filter(user__isnull=False, user__is_profile_complete=False).count(), "roster"),
    ]
    warnings = [{"key": key, "label": label, "count": count, "tab": tab} for key, label, count, tab in candidates if count]

    return {
        "teachers": {
            "approved": teachers.filter(approval_status=User.ApprovalStatus.APPROVED).count(),
            "pending": teachers.filter(approval_status=User.ApprovalStatus.PENDING).count(),
            "rejected": teachers.filter(approval_status=User.ApprovalStatus.REJECTED).count(),
            "oldest_pending_at": oldest_pending.created_at.isoformat() if oldest_pending else None,
        },
        "roster_by_class": roster_by_class,
        "campus_stats": campus_stats,
        "warnings": warnings,
        "last_7_days": {
            "students_joined": User.objects.filter(role=User.Role.STUDENT, created_at__gte=week_ago).count(),
            "teachers_approved": teachers.filter(approval_status=User.ApprovalStatus.APPROVED, approval_reviewed_at__gte=week_ago).count(),
            "classrooms_created": Classroom.objects.filter(created_at__gte=week_ago).count(),
        },
    }


class MasterAdminOverviewView(APIView):
    """Cross-campus KPI snapshot for the Master Admin dashboard."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        from apps.accounts.models import AdmittedStudent

        # The last few changes made in this portal, with the admin's name, so the page needs no extra requests.
        history = list(ActionHistory.objects.filter(feature="master_admin").order_by("-timestamp")[:8])
        actors = {str(u.pk): (u.full_name or u.email) for u in User.objects.filter(pk__in=[int(h.user_id) for h in history if (h.user_id or "").isdigit()])}
        recent_actions = [
            {
                "id": h.id,
                "action": h.action,
                "actor": actors.get(h.user_id or "", "An admin"),
                "target": (h.metadata_json or {}).get("target"),
                "timestamp": h.timestamp.isoformat() if h.timestamp else None,
            }
            for h in history
        ]
        return Response({
            "roster": {
                "total": AdmittedStudent.objects.count(),
                "signed_up": AdmittedStudent.objects.filter(user__is_profile_complete=True).count(),
            },
            "recent_actions": recent_actions,
            **_overview_extras(User),
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
                "rejected_teacher_applications": User.objects.filter(role=User.Role.TEACHER, approval_status=User.ApprovalStatus.REJECTED).count(),
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


def _recycle_target(content_type, pk):
    model = model_for_key(content_type)
    if model is None:
        return None, None, Response({"detail": "Unknown or unsupported content type."}, status=404)
    try:
        return model, model.all_objects.get(pk=pk), None
    except model.DoesNotExist:
        return None, None, Response({"detail": "Record not found."}, status=404)


class RecycleBinDetailView(APIView):
    """What a restore needs to show: editable fields, deleted parents and records in the way."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request, content_type, pk):
        model, instance, error = _recycle_target(content_type, pk)
        if error:
            return error
        return Response({
            "content_type": content_type, "id": instance.pk, "label": str(instance),
            "is_active": instance.is_active,
            "fields": editable_fields(instance),
            "blockers": instance.restore_blockers(),
            "conflicts": find_conflicts(instance),
        })


class RecycleBinRestoreView(APIView):
    """Generic restore endpoint for any soft-deleted record, addressed by content type + id.

    The body is optional. ``changes`` edits the restored record; ``existing_changes`` edits other
    records that are in the way, keyed ``"app.model:id"``. Everything happens in one transaction.
    """
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request, content_type, pk):
        model, instance, error = _recycle_target(content_type, pk)
        if error:
            return error
        if instance.is_active:
            return Response({"detail": "Record is already active."}, status=400)
        blockers = instance.restore_blockers()
        if blockers:
            return Response(
                {"detail": "Restore the parent records first: " + "; ".join(blockers), "blockers": blockers},
                status=409,
            )
        data = request.data if isinstance(request.data, dict) else {}
        changes = data.get("changes") or {}
        existing_changes = data.get("existing_changes") or {}
        if not isinstance(changes, dict) or not isinstance(existing_changes, dict):
            return Response({"detail": "changes and existing_changes must be objects."}, status=400)
        record = {}
        try:
            with transaction.atomic():
                if existing_changes:
                    in_the_way = {f'{c["record"]["content_type"]}:{c["record"]["id"]}' for c in find_conflicts(instance)}
                    for key, edits in existing_changes.items():
                        if key not in in_the_way or not isinstance(edits, dict):
                            continue
                        other_type, other_id = key.rsplit(":", 1)
                        _, other, _ = _recycle_target(other_type, int(other_id))
                        changed = apply_changes(other, edits)
                        save_edited(other, changed)
                        if changed:
                            record[key] = changed
                    # (the loop above only touches records the restore actually collides with)
                changed = apply_changes(instance, changes)
                remaining = find_conflicts(instance)
                if remaining:
                    raise RestoreConflict(remaining)
                save_edited(instance, changed)
                if changed:
                    record[f"{content_type}:{instance.pk}"] = changed
                instance.restore()
                _record_admin_action(request, "restore_record", f"{content_type}:{instance.pk}", {"changes": record} if record else None)
        except RestoreInvalid as exc:
            return Response({"detail": "Some values are not valid.", "errors": exc.errors}, status=400)
        except RestoreConflict as exc:
            return Response({
                "detail": "This record conflicts with an existing record: change one of them.",
                "conflicts": exc.conflicts,
            }, status=409)
        except IntegrityError:
            return Response(
                {"detail": "This record conflicts with an existing record.", "conflicts": find_conflicts(instance)},
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
        state = str(data.get("state", "")).strip()
        if not name or not code or not city or not state:
            return Response(
                {"detail": "Name, code, city, and state are required."},
                status=400,
            )
        try:
            with transaction.atomic():
                campus = Campus.objects.create(
                    name=name,
                    code=code,
                    city=city,
                    state=state,
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


def _department_from(data):
    """(provided, department, error) for an optional ``department`` id in a request body."""
    if "department" not in data:
        return False, None, None
    value = data.get("department")
    if value in (None, ""):
        return True, None, None
    try:
        department = Department.objects.select_related("school__campus").get(pk=int(value))
    except (Department.DoesNotExist, TypeError, ValueError):
        return True, None, Response({"detail": "That department does not exist."}, status=400)
    return True, department, None


def _user_payload(user):
    return {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": user.full_name,
        "register_no": user.register_no,
        "emp_no": user.emp_no,
        "extra": user.extra or {},
        "role": user.role,
        "approval_status": user.approval_status,
        "is_active": user.is_active,
        "campus": (
            {"id": user.campus_id, "name": user.campus.name}
            if user.campus_id and user.campus
            else None
        ),
        "department": (
            {"id": user.department_id, "name": user.department.name}
            if user.department_id and user.department
            else None
        ),
        "section": (
            {"id": user.section_id, "name": f"{user.section.batch.name} - {user.section.name}"} if user.section_id and user.section else None
        ),
        "teaching_programs": [program.pk for program in user.teaching_programs.all()] if user.role == "TEACHER" else [],
        "created_at": user.created_at,
    }


class PlacementOptionsView(APIView):
    """Sections and programs, labelled, for the user edit form."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        sections = Section.objects.select_related("batch__program__department__school__campus").order_by(
            "batch__program__department__school__campus__name", "batch__program__department__name",
            "batch__program__name", "batch__name", "name",
        )
        programs = Program.objects.select_related("department__school__campus").order_by("department__name", "name")
        return Response({
            "sections": [
                {"id": s.pk, "label": f"{s.batch.program.department.school.campus.name} › {s.batch.program.name} › {s.batch.name} › {s.name}"}
                for s in sections
            ],
            "programs": [
                {"id": p.pk, "label": f"{p.name} ({p.department.name})", "department": p.department_id} for p in programs
            ],
        })


class UserDirectoryView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        User = get_user_model()
        queryset = User.all_objects.select_related("campus", "department", "section__batch").prefetch_related("teaching_programs").order_by("email")
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
        _, department, department_error = _department_from(data)
        if department_error:
            return department_error
        try:
            validate_password(str(data["password"]))
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        for number_kind, number_field in (("register_no", "register_no"), ("employee_no", "emp_no")):
            format_error = university_fields.check_id(number_kind, data.get(number_field))
            if format_error:
                return Response({"detail": format_error, "field": number_field}, status=400)
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email,
                    password=data["password"],
                    first_name=str(data.get("first_name", "")).strip(),
                    last_name=str(data.get("last_name", "")).strip(),
                    role=role,
                    campus_id=department.school.campus_id if department else data.get("campus"),
                    school=department.school if department else None,
                    department=department,
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
        return get_object_or_404(User.all_objects.select_related("campus", "department", "section__batch").prefetch_related("teaching_programs"), pk=pk)

    def get(self, request, pk):
        return Response(_user_payload(self.get_object(pk)))

    def patch(self, request, pk):
        user = self.get_object(pk)
        data = request.data
        User = get_user_model()
        if user.pk == request.user.pk and data.get("role") not in (None, user.role):
            return Response(
                {"detail": "You cannot change your own Master Admin role."},
                status=400,
            )
        for field in ("first_name", "last_name", "phone_number"):
            if field in data:
                setattr(user, field, str(data[field] or "").strip())
        original_email = user.email
        if "email" in data:
            email = str(data["email"] or "").strip().lower()
            try:
                validate_email(email)
            except DjangoValidationError:
                return Response({"detail": "Enter a valid email address."}, status=400)
            if email != user.email:
                if user.pk == request.user.pk:
                    return Response({"detail": "You cannot change the email you are signed in with."}, status=400)
                if User.all_objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                    return Response({"detail": "Another account already uses this email.", "field": "email"}, status=409)
                user.email = email
        for field, label in (("register_no", "register number"), ("emp_no", "employee number")):
            if field in data:
                value = str(data[field] or "").strip() or None
                if value and User.all_objects.filter(**{f"{field}__iexact": value}).exclude(pk=user.pk).exists():
                    return Response({"detail": f"Another account already uses this {label}.", "field": field}, status=409)
                if value and value != getattr(user, field):
                    format_error = (university_fields.check_register(value, user.section) if field == "register_no"
                                    else university_fields.check_id("employee_no", value))
                    if format_error:
                        return Response({"detail": format_error, "field": field}, status=400)
                setattr(user, field, value)
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
        provided, department, department_error = _department_from(data)
        if department_error:
            return department_error
        if provided:
            user.department = department
            user.school = department.school if department else None
            if department:
                user.campus = department.school.campus
        if "campus" in data and not (provided and department):
            campus_id = data["campus"]
            if campus_id is None:
                user.campus = None
            else:
                user.campus = get_object_or_404(Campus, pk=campus_id)
        section = None
        if data.get("section") not in (None, ""):
            if user.role != user.Role.STUDENT:
                return Response({"detail": "Only students belong to a section."}, status=400)
            try:
                section = Section.objects.select_related("batch__program__department__school__campus").get(pk=int(data["section"]))
            except (Section.DoesNotExist, TypeError, ValueError):
                return Response({"detail": "That section does not exist."}, status=400)
        programs = None
        if "teaching_programs" in data:
            if user.role != user.Role.TEACHER:
                return Response({"detail": "Only teachers have teaching programs."}, status=400)
            try:
                ids = {int(value) for value in (data["teaching_programs"] or [])}
            except (TypeError, ValueError):
                return Response({"detail": "Teaching programs must be a list of program ids."}, status=400)
            programs = list(Program.objects.filter(pk__in=ids))
            if len(programs) != len(ids):
                return Response({"detail": "One of those programs does not exist."}, status=400)
            if any(program.department_id != user.department_id for program in programs):
                return Response({"detail": "A teacher can only teach programs in their own department."}, status=400)
        if "extra" in data:
            extra, extra_error = university_fields.apply_extra(user, data["extra"], by_admin=True, enforce_required=False)
            if extra_error:
                return Response({"detail": extra_error, "field": "extra"}, status=400)
            user.extra = extra
        entry = AdmittedStudent.objects.filter(user=user).first()
        if section is not None:
            for name, value in hierarchy_for(section).items():
                setattr(user, name, value)
        if entry is not None and user.role == user.Role.STUDENT:
            clash = AdmittedStudent.objects.exclude(pk=entry.pk)
            if clash.filter(email__iexact=user.email).exists() or (user.register_no and clash.filter(register_no__iexact=user.register_no).exists()):
                return Response({"detail": f"The {university_terms.get('student', lower=True)} roster already has another entry with this email or {university_terms.get('register_no', lower=True)}."}, status=409)
        try:
            with transaction.atomic():
                user.save()
                if entry is not None and user.role == user.Role.STUDENT:
                    entry.email = user.email
                    entry.register_no = user.register_no or entry.register_no
                    if section is not None:
                        entry.section = section
                    entry.save()
                if programs is not None:
                    user.teaching_programs.set(programs)
        except IntegrityError:
            return Response(
                {"detail": f"{university_terms.get('register_no')}, {university_terms.get('employee_no', lower=True)} or email is already in use."},
                status=409,
            )
        changes = {"email_from": original_email, "email_to": user.email} if user.email != original_email else {}
        _record_admin_action(request, "update_user", f"accounts.user:{user.pk}", changes)
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
        payload = _application_payload(teacher)
        if self.decision == "approve" and request.data.get("add_to_roster"):
            from apps.accounts import staff_roster
            payload["added_to_roster"] = staff_roster.add_teacher_to_roster(teacher) is not None
        return Response(payload)
