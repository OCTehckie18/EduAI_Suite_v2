import os
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


def _issue_token(user, role, token_type, lifetime):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user.pk),
            "email": user.email,
            "role": role,
            "type": token_type,
            "iat": now,
            "exp": now + lifetime,
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )


def _user_payload(user, role):
    return {
        "id": user.pk,
        "email": user.email,
        "name": user.get_full_name() or user.email.split("@", 1)[0],
        "picture": "",
        "role": role,
        "status": "approved",
    }


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get("id_token")
        app_name = request.data.get("app", "edugames")
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not credential or not client_id:
            return Response(
                {"detail": "Google authentication is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            claims = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                audience=client_id,
            )
        except ValueError:
            return Response({"detail": "Invalid Google credential."}, status=status.HTTP_401_UNAUTHORIZED)

        email = claims.get("email", "").strip().lower()
        if not email or not claims.get("email_verified", False):
            return Response({"detail": "Google account email is not verified."}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": claims.get("given_name", ""),
                "last_name": claims.get("family_name", ""),
            },
        )
        changed = []
        for field, value in (("email", email), ("first_name", claims.get("given_name", "")), ("last_name", claims.get("family_name", ""))):
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed.append(field)
        if changed:
            user.save(update_fields=changed)

        role = "teacher" if app_name == "teacherbuddy" else "student"
        user_data = _user_payload(user, role)
        return Response(
            {
                "access": _issue_token(user, role, "access", timedelta(minutes=settings.JWT_ACCESS_TOKEN_LIFETIME_MINUTES)),
                "refresh": _issue_token(user, role, "refresh", timedelta(days=settings.JWT_REFRESH_TOKEN_LIFETIME_DAYS)),
                "is_profile_complete": False,
                "status": "approved",
                "user": user_data,
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request.auth.get("role", "student") if isinstance(request.auth, dict) else "student"
        return Response({"user": _user_payload(request.user, role), "status": "approved"})
