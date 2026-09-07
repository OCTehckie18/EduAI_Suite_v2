import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from django.contrib.auth import get_user_model


class EduAIJWTAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Invalid Authorization header.")

        try:
            payload = jwt.decode(
                parts[1].decode("utf-8"),
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
        return user, payload
