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
        if user is None:
            # Signing in on the teacher app is an application: it creates a teacher account
            # that stays unusable until the master admin approves it. Existing accounts never
            # change role here.
            applying = request.data.get("app") == "teacherbuddy"
            user = User.objects.create_user(
                email=email,
                role=User.Role.TEACHER if applying else User.Role.STUDENT,
                approval_status=User.ApprovalStatus.PENDING if applying else User.ApprovalStatus.APPROVED,
                first_name=claims.get("given_name", ""),
                last_name=claims.get("family_name", ""),
                avatar_url=claims.get("picture", ""),
            )
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

    @transaction.atomic
    def post(self, request):
        user = request.user
        data = request.data
        if user.is_profile_complete:
            return Response({"detail": "Profile is already complete. Use the profile editor to update it."}, status=status.HTTP_409_CONFLICT)
        requested_role = data.get("role", user.role)
        if requested_role != user.role:
            return Response({"detail": "Roles are assigned by an administrator."}, status=status.HTTP_400_BAD_REQUEST)
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
        for field in ("register_no", "emp_no"):
            if field in data:
                setattr(user, field, _clean_identifier(data[field]))
        user.set_password(password)

        if user.role == user.Role.STUDENT:
            try:
                program = Program.objects.get(pk=data.get("program"), department=department)
                batch = Batch.objects.get(pk=data.get("batch"), program=program)
                section = Section.objects.get(pk=data.get("section"), batch=batch)
            except (Program.DoesNotExist, Batch.DoesNotExist, Section.DoesNotExist, TypeError, ValueError):
                return Response({"detail": "Invalid student program, batch, or section hierarchy."}, status=status.HTTP_400_BAD_REQUEST)
            user.program, user.batch, user.section = program, batch, section
        elif user.role == user.Role.TEACHER:
            user.program = user.batch = user.section = None
        user.is_profile_complete = True
        try:
            user.save()
        except IntegrityError:
            transaction.set_rollback(True)
            return Response({"detail": "Register number or employee number is already in use."}, status=status.HTTP_400_BAD_REQUEST)
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
                return Response({"detail": "Register number or employee number is already in use."}, status=status.HTTP_400_BAD_REQUEST)
        return self.get(request)

    put = patch

    def delete(self, request):
        return Response({"detail": "Account deletion is not allowed."}, status=status.HTTP_403_FORBIDDEN)

    EDITABLE_FIELDS = ("first_name", "last_name", "phone_number", "register_no", "emp_no")
    LOCKED_ONCE_SET = ("register_no", "emp_no")
