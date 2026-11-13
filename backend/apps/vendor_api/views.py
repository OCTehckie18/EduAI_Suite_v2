from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsMasterAdmin
from apps.core.utils.email_utils import email_configured, send_email

from . import signing as channel
from .models import VendorActionLog

User = get_user_model()
SET_PASSWORD_SALT = "vendor-set-password"
SET_PASSWORD_DAYS = 3
VERSION = "1.0"


class ChannelView(APIView):
    """Base for the locked endpoints: no user login, only a valid signature."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        channel.verify(request)
        super().initial(request, *args, **kwargs)


def _admins():
    return User.all_objects.filter(role=User.Role.MASTER_ADMIN).order_by("email")


def _admin_json(user):
    has_name = bool(user.first_name or user.last_name)
    return {
        "id": user.pk, "email": user.email, "name": user.full_name if has_name else "",
        "active": user.is_active, "last_login": user.last_login, "created_at": user.created_at,
    }


def _log(action, email="", result="ok", detail=""):
    VendorActionLog.objects.create(action=action, target_email=email, result=result, detail=detail[:300])


def _set_password_token(user):
    # The token carries a fingerprint of the current password, so it dies the moment the password is set.
    return signing.dumps({"uid": user.pk, "pw": user.password[-12:]}, salt=SET_PASSWORD_SALT)


def _mail_link(user, subject, lead):
    link = f"{settings.MASTER_ADMIN_URL.rstrip('/')}/set-password?token={_set_password_token(user)}"
    body = (f'<p>{lead}</p><p><a href="{link}">Set your password</a></p>'
            f"<p>The link works once and expires in {SET_PASSWORD_DAYS} days.</p>")
    sent = bool(email_configured() and send_email(to_email=user.email, subject=subject, body=body))
    return sent, link


class VendorSummaryView(ChannelView):
    def get(self, request):
        return Response({
            "version": VERSION,
            "admins": _admins().filter(is_active=True).count(),
            "teachers": User.objects.filter(role=User.Role.TEACHER).count(),
            "students": User.objects.filter(role=User.Role.STUDENT).count(),
            "email_configured": bool(email_configured()),
        })


class VendorAdminsView(ChannelView):
    def get(self, request):
        return Response([_admin_json(u) for u in _admins()])

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        if "@" not in email:
            return Response({"detail": "A valid email is required."}, status=status.HTTP_400_BAD_REQUEST)
        if User.all_objects.filter(email__iexact=email).exists():
            _log("invite", email, "refused", "email already has an account")
            return Response({"detail": "An account with this email already exists here."}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            user = User.objects.create_user(
                email=email, role=User.Role.MASTER_ADMIN, is_staff=True, is_profile_complete=True,
                first_name=str(request.data.get("first_name") or "").strip()[:150],
                last_name=str(request.data.get("last_name") or "").strip()[:150],
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
        sent, link = _mail_link(user, "Your Master Admin account", "You have been added as a Master Admin.")
        _log("invite", email, "ok", "emailed" if sent else "email not configured: link returned to EduAI")
        payload = _admin_json(user) | {"emailed": sent}
        if not sent:
            payload["set_password_link"] = link  # shown once to the EduAI owner, who passes it on
        return Response(payload, status=status.HTTP_201_CREATED)


class _AdminAction(ChannelView):
    def target(self, admin_id):
        return _admins().filter(pk=admin_id).first()


class VendorAdminDisableView(_AdminAction):
    def post(self, request, admin_id):
        user = self.target(admin_id)
        if not user:
            return Response({"detail": "No such Master Admin."}, status=status.HTTP_404_NOT_FOUND)
        others = _admins().filter(is_active=True).exclude(pk=user.pk).exists()
        if user.is_active and not others and request.data.get("force") is not True:
            _log("disable", user.email, "refused", "last active Master Admin")
            return Response({"detail": "This is the last active Master Admin. Confirm to disable it anyway."}, status=status.HTTP_409_CONFLICT)
        user.is_active = False  # their tokens stop working at once: authentication only loads active accounts
        user.save(update_fields=["is_active"])
        _log("disable", user.email)
        return Response(_admin_json(user))


class VendorAdminEnableView(_AdminAction):
    def post(self, request, admin_id):
        user = self.target(admin_id)
        if not user:
            return Response({"detail": "No such Master Admin."}, status=status.HTTP_404_NOT_FOUND)
        user.is_active = True
        user.deleted_at = None
        user.save(update_fields=["is_active", "deleted_at"])
        _log("enable", user.email)
        return Response(_admin_json(user))


class VendorAdminResetView(_AdminAction):
    def post(self, request, admin_id):
        user = self.target(admin_id)
        if not user or not user.is_active:
            return Response({"detail": "No such active Master Admin."}, status=status.HTTP_404_NOT_FOUND)
        sent, link = _mail_link(user, "Set a new password", "A new password was requested for your Master Admin account.")
        _log("reset_link", user.email, "ok", "emailed" if sent else "email not configured: link returned to EduAI")
        payload = {"emailed": sent}
        if not sent:
            payload["set_password_link"] = link
        return Response(payload)


class SetPasswordView(APIView):
    """Public: the Master Admin follows the emailed link. The signed token is the only credential."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        password = str(request.data.get("password") or "")
        if len(password) < 8:
            return Response({"detail": "Use at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = signing.loads(str(request.data.get("token") or ""), salt=SET_PASSWORD_SALT, max_age=SET_PASSWORD_DAYS * 86400)
            user = _admins().get(pk=data["uid"], is_active=True)
        except (signing.BadSignature, User.DoesNotExist, KeyError):
            return Response({"detail": "This link is not valid any more. Ask for a new one."}, status=status.HTTP_400_BAD_REQUEST)
        if user.password[-12:] != data["pw"]:
            return Response({"detail": "This link was already used. Ask for a new one."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password set. You can sign in now."})


class VendorActionsListView(APIView):
    """What EduAI support did here, for this university's own Master Admin to see."""

    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        rows = VendorActionLog.objects.all()[:100]
        return Response([
            {"id": r.pk, "action": r.action, "target_email": r.target_email, "result": r.result,
             "detail": r.detail, "at": r.created_at} for r in rows
        ])
