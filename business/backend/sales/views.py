import logging

from django.conf import settings
from django.core.mail import send_mail
from rest_framework import generics, mixins, status, viewsets
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Campus, DemoRequest
from .serializers import CampusSerializer, DemoRequestCreateSerializer, DemoRequestStaffSerializer

logger = logging.getLogger(__name__)


class DemoRequestThrottle(AnonRateThrottle):
    """Limits how often one address can send the form. The rate comes from settings.DEMO_REQUEST_RATE."""

    scope = "demo_requests"

    def get_rate(self):
        return settings.DEMO_REQUEST_RATE


def notify_sales(demo: DemoRequest) -> None:
    lines = [
        f"Name: {demo.name}",
        f"Role: {demo.role}",
        f"Institution: {demo.institution}",
        f"City: {demo.city or '-'}",
        f"Approx. students: {demo.approx_students or '-'}",
        f"Work email: {demo.work_email}",
        f"Phone: {demo.phone or '-'}",
        "",
        demo.message or "(no message)",
    ]
    try:
        send_mail(
            subject=f"Demo request: {demo.institution}",
            message="\n".join(lines),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[settings.SALES_EMAIL],
        )
    except Exception:  # the request is saved either way; the team can still see it in the admin
        logger.exception("Could not email the sales team about demo request %s", demo.pk)


class DemoRequestCreateView(generics.CreateAPIView):
    """POST /api/demo-requests/ from the public website."""

    serializer_class = DemoRequestCreateSerializer
    permission_classes = [AllowAny]
    authentication_classes: list = []  # public form: no session, so no CSRF check
    throttle_classes = [DemoRequestThrottle]

    def create(self, request, *args, **kwargs):
        if str(request.data.get("website", "")).strip():
            # A bot filled the hidden field. Answer as if it worked, but keep nothing.
            logger.info("Dropped a demo request that filled the honeypot field")
            return Response({"ok": True}, status=status.HTTP_201_CREATED)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        demo = serializer.save()
        notify_sales(demo)
        return Response({"ok": True, "id": demo.pk}, status=status.HTTP_201_CREATED)


class StaffDemoRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Staff only: list demo requests and update their status and notes. Phase 5 builds the UI."""

    queryset = DemoRequest.objects.all()
    serializer_class = DemoRequestStaffSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        wanted = self.request.query_params.get("status")
        return qs.filter(status=wanted) if wanted else qs


class StaffCampusViewSet(viewsets.ModelViewSet):
    """Staff only: the colleges we run installations for."""

    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [IsAdminUser]
    lookup_field = "slug"


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response({"status": "ok"})
