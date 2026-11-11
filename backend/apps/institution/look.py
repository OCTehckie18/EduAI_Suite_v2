"""The university's look beyond colours: fonts, corners, density, portal names, the tab icon,
sign-in pages and the landing page.

Everything is stored in ``UniversityProfile.look`` as JSON, but only through ``clean_look``: unknown keys
are dropped, wrong values are refused with the field named, and anything missing falls back to the default
(today's look). Uploaded files live in ``UniversityAsset`` slots and are never set by a plain save.
"""

import io
import re

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.http import HttpResponse
from PIL import Image, UnidentifiedImageError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UniversityAsset

PORTALS = ("teacherbuddy", "edugames", "master_admin")
CORNERS = ("sharp", "soft", "round")
DENSITIES = ("comfortable", "compact")
BACKGROUNDS = ("brand", "colour", "image")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# Readable fonts available from Google Fonts; the portals load the one chosen.
CURATED_FONTS = (
    "Inter", "Poppins", "Roboto", "Open Sans", "Lato", "Montserrat", "Nunito", "Source Sans 3",
    "Work Sans", "IBM Plex Sans", "Noto Sans", "Merriweather", "Playfair Display", "Lora",
)
DEFAULT_FONTS = {"heading_font": "Poppins", "body_font": "Inter"}

MAX_FONT_BYTES = 2 * 1024 * 1024
FONT_SIGNATURES = (
    (b"wOF2", "font/woff2", "woff2"),
    (b"wOFF", "font/woff", "woff"),
    (b"\x00\x01\x00\x00", "font/ttf", "truetype"),
    (b"true", "font/ttf", "truetype"),
    (b"OTTO", "font/otf", "opentype"),
)
MAX_IMAGE_BYTES = 4 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"PNG", "JPEG", "WEBP"}  # no SVG: it can carry scripts
FAVICON_SIZE = 128
MAX_BACKGROUND_SIDE = 2000

TEXT_LIMITS = {"headline": 80, "text": 240, "motto": 80, "highlight_title": 40, "highlight_text": 100, "portal_name": 30}
MAX_HIGHLIGHTS = 3

SLOTS = {
    "heading_font": "font",
    "body_font": "font",
    "favicon": "image",
    **{f"signin_background:{portal}": "image" for portal in PORTALS},
}


def default_look():
    return {
        "heading_font": {"kind": "default", "family": ""},
        "body_font": {"kind": "default", "family": ""},
        "corners": "soft",
        "density": "comfortable",
        "portal_names": {portal: "" for portal in PORTALS},
        "signin": {
            portal: {"headline": "", "text": "", "motto": "", "highlights": [], "background": {"kind": "brand", "colour": ""}}
            for portal in PORTALS
        },
        "links": {"help": "", "privacy": "", "terms": ""},
        "landing": {"headline": "", "text": ""},
    }


def _merged(stored):
    """The stored look on top of the defaults, keeping only known keys."""
    look = default_look()
    stored = stored if isinstance(stored, dict) else {}
    for key in ("corners", "density"):
        if key in stored:
            look[key] = stored[key]
    for key in ("heading_font", "body_font"):
        if isinstance(stored.get(key), dict):
            look[key].update({k: stored[key][k] for k in ("kind", "family") if k in stored[key]})
    for group in ("portal_names", "links", "landing"):
        if isinstance(stored.get(group), dict):
            look[group].update({k: v for k, v in stored[group].items() if k in look[group]})
    for portal in PORTALS:
        page = (stored.get("signin") or {}).get(portal) if isinstance(stored.get("signin"), dict) else None
        if isinstance(page, dict):
            target = look["signin"][portal]
            for k in ("headline", "text", "motto", "highlights"):
                if k in page:
                    target[k] = page[k]
            if isinstance(page.get("background"), dict):
                target["background"].update({k: page["background"][k] for k in ("kind", "colour") if k in page["background"]})
    return look


def _text(value, limit, label, errors, key):
    value = str(value or "").strip()
    if len(value) > limit:
        errors[key] = f"{label} must be at most {limit} characters."
    return value


def clean_look(data, stored):
    """(look, errors): ``data`` validated and laid over what is stored. Uploaded fonts stay as uploaded."""
    look = _merged(stored)
    errors = {}
    if not isinstance(data, dict):
        return look, {"look": "Send the look as an object."}
    if "corners" in data:
        if data["corners"] not in CORNERS:
            errors["corners"] = f"Corners must be one of: {', '.join(CORNERS)}."
        else:
            look["corners"] = data["corners"]
    if "density" in data:
        if data["density"] not in DENSITIES:
            errors["density"] = f"Density must be one of: {', '.join(DENSITIES)}."
        else:
            look["density"] = data["density"]
    for key in ("heading_font", "body_font"):
        if key not in data:
            continue
        choice = data[key] if isinstance(data[key], dict) else {}
        kind = choice.get("kind")
        if kind == "default":
            look[key] = {"kind": "default", "family": ""}
        elif kind == "curated":
            family = choice.get("family")
            if family not in CURATED_FONTS:
                errors[key] = "Choose a font from the list."
            else:
                look[key] = {"kind": "curated", "family": family}
        elif kind == "upload":
            # Only the upload endpoint can point a font at a file; a save may just keep it.
            if look[key].get("kind") != "upload":
                errors[key] = "Upload the font file first."
        else:
            errors[key] = "Choose the default font, one from the list, or an uploaded font."
    if isinstance(data.get("portal_names"), dict):
        for portal in PORTALS:
            if portal in data["portal_names"]:
                look["portal_names"][portal] = _text(data["portal_names"][portal], TEXT_LIMITS["portal_name"], "A portal name", errors, f"portal_names.{portal}")
    if isinstance(data.get("links"), dict):
        for key in ("help", "privacy", "terms"):
            if key not in data["links"]:
                continue
            value = str(data["links"][key] or "").strip()
            if value:
                try:
                    if value.lower().startswith("mailto:"):
                        validate_email(value[7:])
                    else:
                        URLValidator(schemes=["http", "https"])(value)
                except ValidationError:
                    errors[f"links.{key}"] = "Enter a full address starting with https:// (or mailto: for an email)."
                    continue
            look["links"][key] = value
    if isinstance(data.get("landing"), dict):
        for key, limit in (("headline", 100), ("text", 300)):
            if key in data["landing"]:
                look["landing"][key] = _text(data["landing"][key], limit, "This text", errors, f"landing.{key}")
    if isinstance(data.get("signin"), dict):
        for portal in PORTALS:
            page = data["signin"].get(portal)
            if not isinstance(page, dict):
                continue
            target = look["signin"][portal]
            for key in ("headline", "text", "motto"):
                if key in page:
                    target[key] = _text(page[key], TEXT_LIMITS[key], "This text", errors, f"signin.{portal}.{key}")
            if "highlights" in page:
                items = page["highlights"] if isinstance(page["highlights"], list) else []
                if len(items) > MAX_HIGHLIGHTS:
                    errors[f"signin.{portal}.highlights"] = f"Show at most {MAX_HIGHLIGHTS} highlights."
                cleaned = []
                for item in items[:MAX_HIGHLIGHTS]:
                    if not isinstance(item, dict):
                        continue
                    title = _text(item.get("title"), TEXT_LIMITS["highlight_title"], "A highlight title", errors, f"signin.{portal}.highlights")
                    text = _text(item.get("text"), TEXT_LIMITS["highlight_text"], "A highlight line", errors, f"signin.{portal}.highlights")
                    if title:
                        cleaned.append({"title": title, "text": text})
                target["highlights"] = cleaned
            if isinstance(page.get("background"), dict):
                background = page["background"]
                kind = background.get("kind")
                if kind not in BACKGROUNDS:
                    errors[f"signin.{portal}.background"] = "The background must be the brand colours, a colour, or an image."
                elif kind == "colour":
                    colour = str(background.get("colour") or "").strip().lower()
                    if not HEX.match(colour):
                        errors[f"signin.{portal}.background"] = "Choose a colour in #rrggbb form."
                    else:
                        target["background"] = {"kind": "colour", "colour": colour}
                elif kind == "image":
                    if not UniversityAsset.objects.filter(slot=f"signin_background:{portal}").exists():
                        errors[f"signin.{portal}.background"] = "Upload the background image first."
                    else:
                        target["background"] = {"kind": "image", "colour": ""}
                else:
                    target["background"] = {"kind": "brand", "colour": ""}
    return look, errors


def _asset_url(slot, assets):
    asset = assets.get(slot)
    return f"/institution/university/assets/{slot}/?v={int(asset.updated_at.timestamp())}" if asset else None


def look_payload(profile):
    """The look as every portal needs it: the stored choices with defaults, plus addresses of uploaded files."""
    look = _merged(profile.look)
    assets = {a.slot: a for a in UniversityAsset.objects.defer("data")}
    for key in ("heading_font", "body_font"):
        if look[key].get("kind") == "upload":
            asset = assets.get(key)
            if asset is None:
                look[key] = {"kind": "default", "family": ""}
                continue
            look[key]["url"] = _asset_url(key, assets)
            look[key]["format"] = next((fmt for _, ctype, fmt in FONT_SIGNATURES if ctype == asset.content_type), "woff2")
    look["favicon_url"] = _asset_url("favicon", assets)
    for portal in PORTALS:
        background = look["signin"][portal]["background"]
        if background.get("kind") == "image":
            url = _asset_url(f"signin_background:{portal}", assets)
            if url:
                background["url"] = url
            else:
                look["signin"][portal]["background"] = {"kind": "brand", "colour": ""}
    look["curated_fonts"] = list(CURATED_FONTS)
    look["default_fonts"] = dict(DEFAULT_FONTS)
    return look


# ---- uploads -------------------------------------------------------------

def _font_type(content):
    head = content[:4]
    for signature, content_type, _ in FONT_SIGNATURES:
        if head == signature:
            return content_type
    return None


def _image(uploaded, label):
    if uploaded.size > MAX_IMAGE_BYTES:
        raise ValueError(f"The {label} is too large. Upload an image under 4 MB.")
    try:
        probe = Image.open(uploaded)
        image_format = probe.format
        probe.verify()
        uploaded.seek(0)
        image = Image.open(uploaded)
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise ValueError(f"That file is not a valid image. Upload a PNG, JPEG or WebP {label}.")
    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise ValueError(f"Upload a PNG, JPEG or WebP {label} (SVG is not supported).")
    return image


def process_upload(slot, uploaded):
    """(bytes, content_type) for a file uploaded to ``slot``; raises ValueError with a message for the admin."""
    kind = SLOTS.get(slot)
    if kind is None:
        raise ValueError("Unknown upload slot.")
    if kind == "font":
        if uploaded.size > MAX_FONT_BYTES:
            raise ValueError("The font file is too large. Upload a font under 2 MB.")
        content = uploaded.read()
        content_type = _font_type(content)
        if content_type is None:
            raise ValueError("That file is not a font. Upload a WOFF2, WOFF, TTF or OTF file.")
        return content, content_type
    if slot == "favicon":
        image = _image(uploaded, "tab icon").convert("RGBA")
        image.thumbnail((FAVICON_SIZE, FAVICON_SIZE))
        canvas = Image.new("RGBA", (FAVICON_SIZE, FAVICON_SIZE), (0, 0, 0, 0))
        canvas.paste(image, ((FAVICON_SIZE - image.width) // 2, (FAVICON_SIZE - image.height) // 2))
        out = io.BytesIO()
        canvas.save(out, format="PNG")
        return out.getvalue(), "image/png"
    image = _image(uploaded, "background")
    image.thumbnail((MAX_BACKGROUND_SIDE, MAX_BACKGROUND_SIDE))
    out = io.BytesIO()
    image.convert("RGB").save(out, format="JPEG", quality=85, optimize=True)  # also strips the photo's metadata
    return out.getvalue(), "image/jpeg"


def font_family_name(filename):
    """A safe CSS font-family name from an uploaded file name."""
    base = re.sub(r"\.[A-Za-z0-9]+$", "", filename or "")
    base = re.sub(r"[^A-Za-z0-9 \-]", " ", base).strip()
    return (base or "University font")[:40]


class UniversityAssetView(APIView):
    """Public: the file in one slot (fonts must be readable by every portal before anyone signs in)."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slot):
        asset = UniversityAsset.objects.filter(slot=slot).first()
        if asset is None:
            return Response({"detail": "Nothing has been uploaded here."}, status=404)
        response = HttpResponse(bytes(asset.data), content_type=asset.content_type)
        response["Cache-Control"] = "public, max-age=86400"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["X-Content-Type-Options"] = "nosniff"
        response["Access-Control-Allow-Origin"] = "*"  # fonts are loaded cross-origin by the portals
        return response
