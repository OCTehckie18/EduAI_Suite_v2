from django.db import transaction
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsMasterAdmin
from apps.institution import look as look_rules
from apps.institution.models import UniversityAsset, UniversityProfile
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


class UniversityLookView(APIView):
    """The look beyond colours: fonts, corners, density, portal names, sign-in pages and the landing page."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response(look_rules.look_payload(UniversityProfile.load()))

    def put(self, request):
        profile = UniversityProfile.load()
        cleaned, errors = look_rules.clean_look(request.data, profile.look)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.look = cleaned
        with transaction.atomic():
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "update_university_look", "institution.universityprofile:1", {"groups": sorted(k for k in request.data if isinstance(request.data, dict))})
        return Response(university_payload(profile))


class UniversityLookResetView(APIView):
    """Back to the default look: removes every uploaded font, icon and background."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request):
        profile = UniversityProfile.load()
        with transaction.atomic():
            profile.look = {}
            profile.save(update_fields=["look", "updated_at"])
            UniversityAsset.objects.all().delete()
            _record_admin_action(request, "reset_university_look", "institution.universityprofile:1")
        return Response(university_payload(profile))


class UniversityLookAssetView(APIView):
    """Upload or remove the file in one slot: heading_font, body_font, favicon, signin_background:<portal>."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, slot):
        if slot not in look_rules.SLOTS:
            return Response({"detail": "Unknown upload slot."}, status=404)
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose a file to upload."}, status=400)
        try:
            content, content_type = look_rules.process_upload(slot, uploaded)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        profile = UniversityProfile.load()
        look = look_rules._merged(profile.look)
        if slot in ("heading_font", "body_font"):
            family = str(request.data.get("family") or "").strip() or look_rules.font_family_name(uploaded.name)
            look[slot] = {"kind": "upload", "family": look_rules.font_family_name(family)}
        elif slot.startswith("signin_background:"):
            portal = slot.split(":", 1)[1]
            look["signin"][portal]["background"] = {"kind": "image", "colour": ""}
        with transaction.atomic():
            UniversityAsset.objects.update_or_create(
                slot=slot, defaults={"filename": uploaded.name[:150], "content_type": content_type, "data": content},
            )
            profile.look = look
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "upload_university_asset", "institution.universityprofile:1", {"slot": slot})
        return Response(university_payload(profile))

    def delete(self, request, slot):
        if slot not in look_rules.SLOTS:
            return Response({"detail": "Unknown upload slot."}, status=404)
        profile = UniversityProfile.load()
        look = look_rules._merged(profile.look)
        if slot in ("heading_font", "body_font") and look[slot].get("kind") == "upload":
            look[slot] = {"kind": "default", "family": ""}
        elif slot.startswith("signin_background:"):
            portal = slot.split(":", 1)[1]
            if look["signin"][portal]["background"].get("kind") == "image":
                look["signin"][portal]["background"] = {"kind": "brand", "colour": ""}
        with transaction.atomic():
            UniversityAsset.objects.filter(slot=slot).delete()
            profile.look = look
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "remove_university_asset", "institution.universityprofile:1", {"slot": slot})
        return Response(university_payload(profile))
