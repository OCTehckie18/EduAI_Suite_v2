import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from django.contrib.auth import get_user_model


# A teacher still waiting for approval may only see their own account and finish their profile.
PENDING_TEACHER_PATHS = ("/auth/me", "/auth/profile/setup")


def authenticate_access_token(token, allow_unapproved=False):
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=["HS256"],
        )
        if payload.get("type") != "access":
            raise jwt.InvalidTokenError("Not an access token")
        user = get_user_model().objects.get(pk=payload["sub"])
    except (jwt.PyJWTError, KeyError, get_user_model().DoesNotExist) as exc:
        raise AuthenticationFailed("Invalid or expired token.") from exc

    if not user.is_active:
        raise AuthenticationFailed("User account is inactive.")
    if (
        not allow_unapproved
        and user.role == user.Role.TEACHER
        and user.approval_status != user.ApprovalStatus.APPROVED
    ):
        raise PermissionDenied("Your teacher account is awaiting approval by the administrator.")
    return user, payload


class EduAIJWTAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Invalid Authorization header.")

        allow_unapproved = request.path.rstrip("/").endswith(PENDING_TEACHER_PATHS)
        return authenticate_access_token(parts[1].decode("utf-8"), allow_unapproved=allow_unapproved)
