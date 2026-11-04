import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from apps.core.models import ActionHistory

from .models import UniversityProfile

User = get_user_model()
DETAILS = "/api/v1/master-admin/university/"
LOGO = "/api/v1/master-admin/university/logo/"
PUBLIC = "/api/v1/institution/university/"
PUBLIC_LOGO = "/api/v1/institution/university/logo/"


def image_file(fmt="PNG", size=(300, 200), name="logo.png", content_type="image/png"):
    buffer = io.BytesIO()
    Image.new("RGB", size, (38, 71, 150)).save(buffer, format=fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


class UniversityDetailsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")

    def test_public_endpoint_works_without_login_and_starts_unconfigured(self):
        body = self.client.get(PUBLIC).json()
        self.assertFalse(body["configured"])
        self.assertIsNone(body["logo_url"])
        self.assertEqual(self.client.get(PUBLIC_LOGO).status_code, 404)

    def test_public_endpoint_ignores_a_stale_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(self.client.get(PUBLIC).status_code, 200)

    def test_master_admin_saves_details_and_everyone_sees_them(self):
        self.client.force_authenticate(self.master)
        response = self.client.put(DETAILS, {
            "name": "  Christ University ", "short_name": "CU", "email_domain": "@ChristUniversity.in",
            "contact_email": "it@christuniversity.in", "website": "https://christuniversity.in",
            "phone": "+91 80 1234 5678", "address": "Hosur Road, Bengaluru",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.client.force_authenticate(None)
        body = self.client.get(PUBLIC).json()
        self.assertTrue(body["configured"])
        self.assertEqual((body["name"], body["email_domain"], body["short_name"]), ("Christ University", "christuniversity.in", "CU"))
        self.assertTrue(ActionHistory.objects.filter(action="update_university").exists())

    def test_partial_updates_keep_other_fields(self):
        self.client.force_authenticate(self.master)
        self.client.put(DETAILS, {"name": "Uni", "short_name": "U"}, format="json")
        self.client.put(DETAILS, {"phone": "123"}, format="json")
        body = self.client.get(DETAILS).json()
        self.assertEqual((body["name"], body["short_name"], body["phone"]), ("Uni", "U", "123"))

    def test_invalid_details_are_rejected_with_the_field_named(self):
        self.client.force_authenticate(self.master)
        for payload, field in [
            ({"name": "   "}, "name"),
            ({"name": "x" * 151}, "name"),
            ({"email_domain": "not a domain"}, "email_domain"),
            ({"contact_email": "nope"}, "contact_email"),
            ({"website": "javascript:alert(1)"}, "website"),
            ({"website": "christ.edu"}, "website"),
        ]:
            response = self.client.put(DETAILS, payload, format="json")
            self.assertEqual(response.status_code, 400, payload)
            self.assertIn(field, response.json()["errors"])
        self.assertEqual(UniversityProfile.load().name, "")

    def test_only_master_admin_can_change_details(self):
        for user in (User.objects.create_user(email="t@x.com", role="TEACHER"), User.objects.create_user(email="s@x.com", role="STUDENT")):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(DETAILS).status_code, 403)
            self.assertEqual(self.client.put(DETAILS, {"name": "Hacked"}, format="json").status_code, 403)
            self.assertEqual(self.client.post(LOGO, {"file": image_file()}, format="multipart").status_code, 403)
            self.assertEqual(self.client.delete(LOGO).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.put(DETAILS, {"name": "Hacked"}, format="json").status_code, (401, 403))
        self.assertEqual(UniversityProfile.load().name, "")


class UniversityLogoTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def test_valid_logo_is_stored_downscaled_and_served_publicly(self):
        response = self.client.post(LOGO, {"file": image_file(size=(1600, 800))}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        logo_url = response.json()["logo_url"]
        self.assertTrue(logo_url.startswith("/institution/university/logo/?v="))
        self.client.force_authenticate(None)
        served = self.client.get(PUBLIC_LOGO)
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served["Content-Type"], "image/png")
        self.assertIn("sandbox", served["Content-Security-Policy"])
        stored = Image.open(io.BytesIO(served.content))
        self.assertEqual(max(stored.size), 512)
        self.assertEqual(self.client.get(PUBLIC).json()["logo_url"], logo_url)

    def test_jpeg_and_webp_are_accepted(self):
        for fmt, name, ctype in (("JPEG", "l.jpg", "image/jpeg"), ("WEBP", "l.webp", "image/webp")):
            response = self.client.post(LOGO, {"file": image_file(fmt, name=name, content_type=ctype)}, format="multipart")
            self.assertEqual(response.status_code, 200, fmt)

    def test_unsafe_or_invalid_files_are_refused(self):
        svg = SimpleUploadedFile("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", content_type="image/svg+xml")
        fake = SimpleUploadedFile("logo.png", b"this is not an image", content_type="image/png")
        gif = image_file("GIF", name="logo.gif", content_type="image/gif")
        tiny = image_file(size=(10, 10))
        for upload in (svg, fake, gif, tiny):
            response = self.client.post(LOGO, {"file": upload}, format="multipart")
            self.assertEqual(response.status_code, 400, upload.name)
        self.assertEqual(self.client.post(LOGO, {}, format="multipart").status_code, 400)
        self.assertIsNone(self.client.get(DETAILS).json()["logo_url"])

    def test_oversized_files_are_refused(self):
        big = SimpleUploadedFile("big.png", b"0" * (2 * 1024 * 1024 + 1), content_type="image/png")
        response = self.client.post(LOGO, {"file": big}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("2 MB", response.json()["detail"])

    def test_removing_the_logo_and_replacing_it_changes_the_version(self):
        first = self.client.post(LOGO, {"file": image_file()}, format="multipart").json()["logo_url"]
        removed = self.client.delete(LOGO).json()
        self.assertIsNone(removed["logo_url"])
        self.assertEqual(self.client.get(PUBLIC_LOGO).status_code, 404)
        again = self.client.post(LOGO, {"file": image_file(size=(120, 120))}, format="multipart").json()["logo_url"]
        self.assertTrue(first and again)


class UniversityColorTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def test_defaults_are_published_before_anything_is_set(self):
        self.client.force_authenticate(None)
        body = self.client.get(PUBLIC).json()
        self.assertEqual((body["primary_color"], body["secondary_color"], body["tertiary_color"]), ("#264796", "#d0ae61", "#0f766e"))

    def test_three_colours_are_saved_normalised_and_public(self):
        response = self.client.put(DETAILS, {"primary_color": "#7A1F2B", "secondary_color": "#F2C94C", "tertiary_color": "#2D9CDB"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.client.force_authenticate(None)
        body = self.client.get(PUBLIC).json()
        self.assertEqual((body["primary_color"], body["secondary_color"], body["tertiary_color"]), ("#7a1f2b", "#f2c94c", "#2d9cdb"))

    def test_invalid_colours_are_refused(self):
        for bad in ("red", "#fff", "#12345g", "264796", "url(x)", ""):
            response = self.client.put(DETAILS, {"secondary_color": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)
            self.assertEqual(response.json()["field"], "secondary_color")

    def test_a_primary_colour_too_light_for_white_text_is_refused(self):
        response = self.client.put(DETAILS, {"primary_color": "#ffee99"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("too light", response.json()["detail"])
        self.assertEqual(UniversityProfile.load().primary_color, "#264796")

    def test_only_a_master_admin_can_change_colours(self):
        teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER")
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.put(DETAILS, {"primary_color": "#7a1f2b"}, format="json").status_code, 403)
