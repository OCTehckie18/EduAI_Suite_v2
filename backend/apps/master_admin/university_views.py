from django.db import transaction
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsMasterAdmin
from apps.institution.models import UniversityProfile
from apps.institution.university import clean_details, clear_logo, save_logo, university_payload

from .views import _record_admin_action


class UniversityDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response(university_payload(UniversityProfile.load()))

    def put(self, request):
        cleaned, errors = clean_details(request.data)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile = UniversityProfile.load()
        for field, value in cleaned.items():
            setattr(profile, field, value)
        with transaction.atomic():
            profile.save(update_fields=[*cleaned.keys(), "updated_at"] if cleaned else ["updated_at"])
            _record_admin_action(request, "update_university", "institution.universityprofile:1", {"fields": sorted(cleaned)})
        return Response(university_payload(profile))


class UniversityLogoUploadView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose an image file to upload."}, status=400)
        variant = request.data.get("variant") or request.query_params.get("variant") or "light"
        profile = UniversityProfile.load()
        try:
            save_logo(profile, uploaded, variant)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(request, "upload_university_logo", "institution.universityprofile:1", {"variant": variant})
        return Response(university_payload(profile))

    def delete(self, request):
        variant = request.query_params.get("variant") or "light"
        profile = UniversityProfile.load()
        try:
            clear_logo(profile, variant)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(request, "remove_university_logo", "institution.universityprofile:1", {"variant": variant})
        return Response(university_payload(profile))
