"""The university that runs this installation: its details and logo."""

import io
import re

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.http import HttpResponse
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UniversityProfile

MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_LOGO_SIDE = 512  # logos are shown small, so we store a downscaled copy
MIN_LOGO_SIDE = 32
ALLOWED_LOGO_FORMATS = {"PNG", "JPEG", "WEBP"}  # SVG is refused: it can carry scripts

TEXT_LIMITS = {"name": 150, "short_name": 30, "email_domain": 100, "contact_email": 254, "phone": 30, "website": 200, "address": 500}
COLOR_FIELDS = ("primary_color", "secondary_color", "tertiary_color")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
MIN_PRIMARY_CONTRAST = 4.5  # white text sits on the primary colour, so it must be dark enough to read
DOMAIN_PATTERN = re.compile(r"^(?=.{1,100}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$")


def contrast_with_white(hex_color):
    """WCAG contrast ratio between white and ``#rrggbb``."""
    channels = []
    for i in (1, 3, 5):
        c = int(hex_color[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    return 1.05 / (luminance + 0.05)


def contrast_with_white(hex_color):
    """WCAG contrast ratio between white and ``#rrggbb``."""
    channels = []
    for i in (1, 3, 5):
        c = int(hex_color[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    return 1.05 / (luminance + 0.05)


def university_payload(profile):
    return {
        "configured": bool(profile.name),
        "name": profile.name,
        "short_name": profile.short_name,
        "email_domain": profile.email_domain,
        "contact_email": profile.contact_email,
        "phone": profile.phone,
        "website": profile.website,
        "address": profile.address,
        "primary_color": profile.primary_color,
        "secondary_color": profile.secondary_color,
        "tertiary_color": profile.tertiary_color,
        # Relative to the API base; the version makes browsers refetch after a new upload.
        "logo_url": (
            f"/institution/university/logo/?v={int(profile.logo_updated_at.timestamp())}"
            if profile.logo_updated_at else None
        ),
    }


def clean_details(data):
    """Validate the text fields present in ``data``; returns (cleaned, errors)."""
    cleaned, errors = {}, {}
    for field, limit in TEXT_LIMITS.items():
        if field not in data:
            continue
        value = str(data.get(field) or "").strip()
        if len(value) > limit:
            errors[field] = f"Keep this under {limit} characters."
            continue
        if field == "name" and not value:
            errors[field] = "The university name is required."
        elif field == "email_domain" and value:
            value = value.lower().lstrip("@")
            if not DOMAIN_PATTERN.match(value):
                errors[field] = "Enter a domain such as example.edu."
        elif field == "contact_email" and value:
            try:
                validate_email(value)
            except ValidationError:
                errors[field] = "Enter a valid email address."
        elif field == "website" and value:
            try:
                URLValidator(schemes=["http", "https"])(value)
            except ValidationError:
                errors[field] = "Enter a full web address starting with http:// or https://."
        if field not in errors:
            cleaned[field] = value
    for field in COLOR_FIELDS:
        if field not in data:
            continue
        value = str(data.get(field) or "").strip()
        if not COLOR_PATTERN.match(value):
            errors[field] = "Choose a colour in #rrggbb form, such as #264796."
            continue
        value = value.lower()
        if field == "primary_color" and contrast_with_white(value) < MIN_PRIMARY_CONTRAST:
            errors[field] = "The primary colour is too light: white button text would be hard to read. Choose a darker shade."
            continue
        cleaned[field] = value
    return cleaned, errors


def process_logo(uploaded):
    """Validate an uploaded logo and return (png_bytes, content_type)."""
    if uploaded.size > MAX_LOGO_BYTES:
        raise ValueError("The logo is too large. Please upload an image under 2 MB.")
    try:
        probe = Image.open(uploaded)
        image_format = probe.format
        probe.verify()
        uploaded.seek(0)
        image = Image.open(uploaded)
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise ValueError("That file is not a valid image. Upload a PNG, JPEG or WebP logo.")
    if image_format not in ALLOWED_LOGO_FORMATS:
        raise ValueError("Upload a PNG, JPEG or WebP logo (SVG is not supported).")
    if min(image.size) < MIN_LOGO_SIDE:
        raise ValueError(f"The logo is too small. Use at least {MIN_LOGO_SIDE}x{MIN_LOGO_SIDE} pixels.")
    image = image.convert("RGBA")
    image.thumbnail((MAX_LOGO_SIDE, MAX_LOGO_SIDE))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), "image/png"


def save_logo(profile, uploaded):
    data, content_type = process_logo(uploaded)
    profile.logo_data = data
    profile.logo_content_type = content_type
    profile.logo_updated_at = timezone.now()
    profile.save(update_fields=["logo_data", "logo_content_type", "logo_updated_at", "updated_at"])


def clear_logo(profile):
    profile.logo_data = None
    profile.logo_content_type = ""
    profile.logo_updated_at = None
    profile.save(update_fields=["logo_data", "logo_content_type", "logo_updated_at", "updated_at"])


class PublicUniversityView(APIView):
    """Shown on every login screen before anyone signs in, so it needs no authentication."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(university_payload(UniversityProfile.load()))


class UniversityLogoView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        profile = UniversityProfile.objects.first()
        if profile is None or not profile.logo_data:
            return Response({"detail": "No logo has been uploaded."}, status=404)
        response = HttpResponse(bytes(profile.logo_data), content_type=profile.logo_content_type or "image/png")
        response["Cache-Control"] = "public, max-age=86400"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["X-Content-Type-Options"] = "nosniff"
        return response
