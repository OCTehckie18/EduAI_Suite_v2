from datetime import datetime, timedelta, timezone

import logging

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from apps.institution import rules as university_rules

from . import roster, staff_roster
from apps.institution import terms as university_terms

logger = logging.getLogger(__name__)

# Docker Desktop hosts drift from real time; Google tokens are checked against the server clock.
GOOGLE_CLOCK_SKEW_SECONDS = 120


_STATUS_LABELS = {"APPROVED": "approved", "PENDING": "pending", "REJECTED": "denied"}


def _approval_label(user):
    return _STATUS_LABELS.get(user.approval_status, "pending")


def _clean_identifier(value):
    """Blank register/employee numbers are stored as NULL so the unique constraint ignores them."""
    value = str(value).strip() if value is not None else ""
    return value or None


def _password_error(password, user=None):
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        return " ".join(exc.messages)
    return None


def _role_label(role):
    if role in {"MASTER_ADMIN"}:
        return "admin"
    return role.lower().replace("_", "-")


def _issue_token(user, role, token_type, lifetime):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.pk), "email": user.email, "role": role, "type": token_type, "iat": now, "exp": now + lifetime},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )


def _hierarchy_item(value):
    return {"id": value.pk, "name": str(value)} if value else None


def _user_payload(user, role=None):
    role = role or user.role
    return {
        "id": user.pk,
        "email": user.email,
        "name": user.full_name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "picture": user.avatar_url,
        "role": _role_label(role),
        "role_code": role,
        "register_no": user.register_no,
        "emp_no": user.emp_no,
        "phone_number": user.phone_number,
        "is_profile_complete": user.is_profile_complete,
        "rejection_reason": user.rejection_reason,
        "hierarchy": {
            "campus": _hierarchy_item(user.campus),
            "school": _hierarchy_item(user.school),
            "department": _hierarchy_item(user.department),
            "program": _hierarchy_item(user.program),
            "batch": _hierarchy_item(user.batch),
            "section": _hierarchy_item(user.section),
        },
    }


def _auth_response(user, role=None):
    role = role or user.role
    return {
        "access": _issue_token(user, role, "access", timedelta(minutes=settings.JWT_ACCESS_TOKEN_LIFETIME_MINUTES)),
        "refresh": _issue_token(user, role, "refresh", timedelta(days=settings.JWT_REFRESH_TOKEN_LIFETIME_DAYS)),
        "is_profile_complete": user.is_profile_complete,
        "status": _approval_label(user),
        "user": _user_payload(user, role),
    }


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get("id_token")
        client_id = settings.GOOGLE_CLIENT_ID
        if not credential or not client_id:
            return Response({"detail": "Google authentication is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            claims = id_token.verify_oauth2_token(
                credential, google_requests.Request(), audience=client_id, clock_skew_in_seconds=GOOGLE_CLOCK_SKEW_SECONDS,
            )
        except ValueError as exc:
            logger.warning("Google credential rejected: %s", exc)
            return Response({"detail": "Invalid Google credential."}, status=status.HTTP_401_UNAUTHORIZED)

        email = claims.get("email", "").strip().lower()
        if not email or not claims.get("email_verified", False):
            return Response({"detail": "Google account email is not verified."}, status=status.HTTP_400_BAD_REQUEST)

        # Only the teacher app can create a (pending) teacher account; students sign in
        # through EduGames and an administrator grants every other role.
        User = get_user_model()
        user = User.all_objects.filter(email__iexact=email).first()
        rules = university_rules.current()
        master = user is not None and user.role == User.Role.MASTER_ADMIN  # never locked out by these rules
        if not master and rules["signin"]["methods"] == "password":
            return Response({"detail": "Google sign-in is switched off at this university. Sign in with your password."}, status=status.HTTP_403_FORBIDDEN)
        if not master and not university_rules.domain_allowed(email, rules["signin"]["allowed_domains"]):
            allowed = ", ".join("@" + d for d in rules["signin"]["allowed_domains"])
            return Response({"detail": f"Use your university Google account ({allowed})."}, status=status.HTTP_403_FORBIDDEN)
        if user is None:
            # Signing in on the teacher app is an application: it creates a teacher account
            # that stays unusable until the master admin approves it. Existing accounts never
            # change role here.
            applying = request.data.get("app") == "teacherbuddy"
            listed = staff_roster.entry_for_email(email) if applying else None
            if listed is not None and not listed.user_id:
                # A teacher on the university's list is approved as soon as they sign in.
                user = staff_roster.provision_teacher(listed)
                changed = [field for field, value in (("first_name", claims.get("given_name", "")), ("last_name", claims.get("family_name", ""))) if value and not getattr(user, field)]
                for field, value in (("first_name", claims.get("given_name", "")), ("last_name", claims.get("family_name", ""))):
                    if field in changed:
                        setattr(user, field, value)
                user.avatar_url = claims.get("picture", "")
                user.save()
            elif applying and rules["accounts"]["teacher_approval"] == "roster_only":
                return Response({"detail": "Only teachers on the university's teacher list can sign in. Please contact the administration."}, status=status.HTTP_403_FORBIDDEN)
            elif applying and rules["accounts"]["teacher_approval"] == "domain_auto":
                # Anyone signing in from the university's own domains is approved as a teacher.
                user = User.objects.create_user(
                    email=email, role=User.Role.TEACHER, approval_status=User.ApprovalStatus.APPROVED,
                    first_name=claims.get("given_name", ""), last_name=claims.get("family_name", ""), avatar_url=claims.get("picture", ""),
                )
            elif applying:
                user = User.objects.create_user(
                    email=email,
                    role=User.Role.TEACHER,
                    approval_status=User.ApprovalStatus.PENDING,
                    first_name=claims.get("given_name", ""),
                    last_name=claims.get("family_name", ""),
                    avatar_url=claims.get("picture", ""),
                )
            else:
                # Students can only join if the university has admitted them.
                entry = roster.entry_for_email(email)
                if entry is None:
                    return Response({"detail": roster.NOT_LISTED_MESSAGE}, status=status.HTTP_403_FORBIDDEN)
                user = roster.provision_student(entry)
                user.avatar_url = claims.get("picture", "")
                user.save(update_fields=["avatar_url"])
        elif not user.is_active:
            return Response({"detail": "This account has been deactivated."}, status=status.HTTP_403_FORBIDDEN)
        else:
            changed = []
            for field, value in (("first_name", claims.get("given_name", "")), ("last_name", claims.get("family_name", "")), ("avatar_url", claims.get("picture", ""))):
                if value and getattr(user, field) != value and not user.is_profile_complete:
                    setattr(user, field, value)
                    changed.append(field)
            if changed:
                user.save(update_fields=changed)
            roster.link_account_to_roster(user)
            staff_roster.link_account_to_roster(user)
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")
        if not username or not password:
            return Response({"detail": "Username and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        user = User.objects.filter(email__iexact=username).first() or User.objects.filter(register_no__iexact=username).first() or User.objects.filter(emp_no__iexact=username).first()
        if user is None or not user.is_active or not user.check_password(password):
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        if user.role != User.Role.MASTER_ADMIN and university_rules.current()["signin"]["methods"] == "google":
            return Response({"detail": "Password sign-in is switched off at this university. Use Sign in with Google."}, status=status.HTTP_403_FORBIDDEN)
        roster.link_account_to_roster(user)
        staff_roster.link_account_to_roster(user)
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "refresh"

    def post(self, request):
        try:
            payload = jwt.decode(request.data.get("refresh"), settings.JWT_SECRET_KEY, algorithms=["HS256"])
            if payload.get("type") != "refresh":
                raise jwt.InvalidTokenError
            user = get_user_model().objects.get(pk=payload["sub"])
        except (jwt.PyJWTError, KeyError, get_user_model().DoesNotExist, TypeError):
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class ProfileSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """What the profile page should show: for students, their admission record."""
        user = request.user
        if user.role == user.Role.TEACHER:
            listed = staff_roster.entry_for_user(user)
            if listed is None or (listed.user_id and listed.user_id != user.pk):
                return Response({"role": user.role, "matched": False})
            department = listed.department
            return Response({
                "role": user.role, "matched": True, "emp_no": listed.emp_no, "name": listed.name,
                "placement": {"campus": str(department.school.campus), "school": str(department.school), "department": str(department)},
                "placement_ids": {"campus": department.school.campus_id, "school": department.school_id, "department": department.pk},
            })
        if user.role != user.Role.STUDENT:
            return Response({"role": user.role, "matched": None})
        entry = roster.entry_for_email(user.email)
        if entry is None:
            return Response({"role": user.role, "matched": bool(user.register_no and user.section_id), "message": roster.NOT_LISTED_MESSAGE})
        placement = roster.hierarchy_for(entry.section)
        return Response({
            "role": user.role,
            "matched": True,
            "register_no": entry.register_no,
            "name": entry.name,
            "placement": {key: str(value) for key, value in placement.items()},
        })

    @transaction.atomic
    def post(self, request):
        user = request.user
        data = request.data
        if user.is_profile_complete:
            return Response({"detail": "Profile is already complete. Use the profile editor to update it."}, status=status.HTTP_409_CONFLICT)
        requested_role = data.get("role", user.role)
        if requested_role != user.role:
            return Response({"detail": "Roles are assigned by an administrator."}, status=status.HTTP_400_BAD_REQUEST)
        entry = roster.entry_for_email(user.email) if user.role == user.Role.STUDENT else None
        staff_entry = staff_roster.entry_for_user(user) if user.role == user.Role.TEACHER else None
        if staff_entry is not None and staff_entry.user_id not in (None, user.pk):
            staff_entry = None
        if user.role == user.Role.STUDENT:
            # A student's identity and placement come from the admission roster, never from the form.
            if entry is None and not (user.register_no and user.section_id):
                return Response({"detail": roster.NOT_LISTED_MESSAGE}, status=status.HTTP_403_FORBIDDEN)
            if entry is not None:
                taken = get_user_model().all_objects.filter(register_no__iexact=entry.register_no).exclude(pk=user.pk)
                if taken.exists():
                    return Response({"detail": f"This {university_terms.get('register_no', lower=True)} is already linked to another account."}, status=status.HTTP_409_CONFLICT)
            campus, school, department = user.campus, user.school, user.department
        elif staff_entry is not None:
            # A listed teacher's department and employee number come from the roster, not the form.
            department = staff_entry.department
            school, campus = department.school, department.school.campus
        else:
            try:
                campus = Campus.objects.get(pk=data.get("campus"))
                school = School.objects.get(pk=data.get("school"), campus=campus)
                department = Department.objects.get(pk=data.get("department"), school=school)
            except (Campus.DoesNotExist, School.DoesNotExist, Department.DoesNotExist, TypeError, ValueError):
                return Response({"detail": "Invalid campus, school, or department hierarchy."}, status=status.HTTP_400_BAD_REQUEST)

        password = data.get("password", "")
        if not password:
            return Response({"detail": "A password is required."}, status=status.HTTP_400_BAD_REQUEST)
        password_error = _password_error(password, user)
        if password_error:
            return Response({"detail": password_error}, status=status.HTTP_400_BAD_REQUEST)

        user.campus, user.school, user.department = campus, school, department
        for field in ("first_name", "last_name", "phone_number"):
            if field in data:
                setattr(user, field, str(data[field] or "").strip())
        if staff_entry is not None:
            user.emp_no = staff_entry.emp_no
        elif user.role == user.Role.TEACHER and "emp_no" in data:
            user.emp_no = _clean_identifier(data["emp_no"])
        user.set_password(password)

        if user.role == user.Role.STUDENT:
            if entry is not None:
                roster.apply_entry_to_user(user, entry)
        elif user.role == user.Role.TEACHER:
            user.program = user.batch = user.section = None
        user.is_profile_complete = True
        try:
            user.save()
        except IntegrityError:
            transaction.set_rollback(True)
            return Response({"detail": f"{university_terms.get('register_no')} or {university_terms.get('employee_no', lower=True)} is already in use."}, status=status.HTTP_400_BAD_REQUEST)
        if user.role == user.Role.TEACHER:
            user.teaching_programs.set(Program.objects.filter(pk__in=data.get("programs", []), department=department))
            user.teaching_batches.set(Batch.objects.filter(pk__in=data.get("batches", []), program__department=department))
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": _user_payload(request.user), "status": _approval_label(request.user)})

    def patch(self, request):
        user = request.user
        data = request.data
        changed = []
        if user.role == user.Role.STUDENT:
            # The university decides what students may change about themselves.
            allowed = university_rules.current()["accounts"]["student_can_edit"]
            blocked = [label for key, fields, label in (("name", ("first_name", "last_name"), "your name"), ("phone", ("phone_number",), "your phone number"), ("password", ("password",), "your password"))
                       if not allowed[key] and any(f in data for f in fields)]
            if blocked:
                return Response({"detail": f"At this university you cannot change {', '.join(blocked)} here. Please contact the administration."}, status=status.HTTP_403_FORBIDDEN)
        for field in self.EDITABLE_FIELDS:
            if field not in data:
                continue
            value = data[field].strip() if isinstance(data[field], str) else ""
            if field in self.LOCKED_ONCE_SET:
                value = value or None
                current = getattr(user, field)
                if current and value != current:
                    return Response({"detail": f"{field} can only be changed by an administrator."}, status=status.HTTP_403_FORBIDDEN)
                setattr(user, field, value)
            else:
                setattr(user, field, value or "")
            changed.append(field)
        if "password" in data:
            if not user.check_password(data.get("current_password") or ""):
                return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
            password_error = _password_error(data["password"] or "", user)
            if password_error:
                return Response({"detail": password_error}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(data["password"])
            changed.append("password")
        if changed:
            try:
                user.save(update_fields=changed)
            except IntegrityError:
                return Response({"detail": f"{university_terms.get('register_no')} or {university_terms.get('employee_no', lower=True)} is already in use."}, status=status.HTTP_400_BAD_REQUEST)
        return self.get(request)

    put = patch

    def delete(self, request):
        return Response({"detail": "Account deletion is not allowed."}, status=status.HTTP_403_FORBIDDEN)

    EDITABLE_FIELDS = ("first_name", "last_name", "phone_number", "register_no", "emp_no")
    LOCKED_ONCE_SET = ("register_no", "emp_no")
