from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.institution.models import Batch, Campus, Department, Program, School, Section


def _role_for_app(app_name):
    return "TEACHER" if app_name == "teacherbuddy" else "STUDENT"


def _role_label(role):
    if role in {"MASTER_ADMIN", "CAMPUS_ADMIN"}:
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
        "picture": user.avatar_url,
        "role": _role_label(role),
        "register_no": user.register_no,
        "emp_no": user.emp_no,
        "phone_number": user.phone_number,
        "is_profile_complete": user.is_profile_complete,
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
        "status": "approved",
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
            claims = id_token.verify_oauth2_token(credential, google_requests.Request(), audience=client_id)
        except ValueError:
            return Response({"detail": "Invalid Google credential."}, status=status.HTTP_401_UNAUTHORIZED)

        email = claims.get("email", "").strip().lower()
        if not email or not claims.get("email_verified", False):
            return Response({"detail": "Google account email is not verified."}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        role = _role_for_app(request.data.get("app", "edugames"))
        user, created = User.objects.get_or_create(
            email=email,
            defaults={"role": role, "first_name": claims.get("given_name", ""), "last_name": claims.get("family_name", ""), "avatar_url": claims.get("picture", "")},
        )
        changed = []
        for field, value in (("first_name", claims.get("given_name", "")), ("last_name", claims.get("family_name", "")), ("avatar_url", claims.get("picture", ""))):
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed.append(field)
        if not user.is_profile_complete and user.role != role:
            user.role = role
            changed.append("role")
        if changed and not created:
            user.save(update_fields=changed)
        return Response(_auth_response(user, user.role), status=status.HTTP_200_OK)


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")
        if not username or not password:
            return Response({"detail": "Username and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        user = User.objects.filter(email__iexact=username).first() or User.objects.filter(register_no__iexact=username).first() or User.objects.filter(emp_no__iexact=username).first()
        if user is None or not user.check_password(password):
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            payload = jwt.decode(request.data.get("refresh"), settings.JWT_SECRET_KEY, algorithms=["HS256"])
            if payload.get("type") != "refresh":
                raise jwt.InvalidTokenError
            user = get_user_model().objects.get(pk=payload["sub"])
        except (jwt.PyJWTError, KeyError, get_user_model().DoesNotExist, TypeError):
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(_auth_response(user, payload.get("role", user.role)), status=status.HTTP_200_OK)


class ProfileSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data
        valid_roles = {choice[0] for choice in user.Role.choices}
        requested_role = data.get("role", user.role)
        if requested_role not in valid_roles:
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            campus = Campus.objects.get(pk=data.get("campus"))
            school = School.objects.get(pk=data.get("school"), campus=campus)
            department = Department.objects.get(pk=data.get("department"), school=school)
        except (Campus.DoesNotExist, School.DoesNotExist, Department.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Invalid campus, school, or department hierarchy."}, status=status.HTTP_400_BAD_REQUEST)

        user.role, user.campus, user.school, user.department = requested_role, campus, school, department
        for field in ("first_name", "last_name", "phone_number", "register_no", "emp_no"):
            if field in data:
                setattr(user, field, data[field] or "")
        password = data.get("password", "")
        if len(password) < 6:
            return Response({"detail": "A password of at least 6 characters is required."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)

        if requested_role == user.Role.STUDENT:
            try:
                program = Program.objects.get(pk=data.get("program"), department=department)
                batch = Batch.objects.get(pk=data.get("batch"), program=program)
                section = Section.objects.get(pk=data.get("section"), batch=batch)
            except (Program.DoesNotExist, Batch.DoesNotExist, Section.DoesNotExist, TypeError, ValueError):
                return Response({"detail": "Invalid student program, batch, or section hierarchy."}, status=status.HTTP_400_BAD_REQUEST)
            user.program, user.batch, user.section = program, batch, section
            user.teaching_programs.clear()
            user.teaching_batches.clear()
        elif requested_role == user.Role.TEACHER:
            user.program = user.batch = user.section = None
            user.teaching_programs.set(Program.objects.filter(pk__in=data.get("programs", []), department=department))
            user.teaching_batches.set(Batch.objects.filter(pk__in=data.get("batches", []), program__department=department))
        user.is_profile_complete = True
        user.save()
        return Response(_auth_response(user), status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request.auth.get("role", request.user.role) if isinstance(request.auth, dict) else request.user.role
        return Response({"user": _user_payload(request.user, role), "status": "approved"})
