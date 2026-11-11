import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from .models import UniversityAsset, UniversityProfile

User = get_user_model()
LOOK = "/api/v1/master-admin/university/look/"
RESET = "/api/v1/master-admin/university/look/reset/"
PUBLIC = "/api/v1/institution/university/"


def asset_url(slot):
    return f"/api/v1/master-admin/university/look/assets/{slot}/"


def image(fmt="PNG", size=(400, 300), name="pic.png"):
    buffer = io.BytesIO()
    Image.new("RGB", size, (11, 74, 135)).save(buffer, format=fmt)
    return SimpleUploadedFile(name, buffer.getvalue())


def font(header=b"wOF2", name="Gotham Rounded.woff2", size=2000):
    return SimpleUploadedFile(name, header + b"\x00" * size)


class LookBase(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(LOOK, body, format="json")

    def public_look(self):
        self.client.force_authenticate(None)
        look = self.client.get(PUBLIC).json()["look"]
        self.client.force_authenticate(self.master)
        return look


class LookSettingsTests(LookBase):
    def test_the_default_look_is_todays_look(self):
        look = self.public_look()
        self.assertEqual((look["corners"], look["density"], look["heading_font"]["kind"], look["body_font"]["kind"]), ("soft", "comfortable", "default", "default"))
        self.assertEqual(look["default_fonts"], {"heading_font": "Poppins", "body_font": "Inter"})
        self.assertEqual(look["signin"]["edugames"]["background"]["kind"], "brand")
        self.assertIsNone(look["favicon_url"])
        self.assertIn("Lora", look["curated_fonts"])

    def test_choices_are_saved_and_public(self):
        response = self.put({
            "corners": "round", "density": "compact",
            "heading_font": {"kind": "curated", "family": "Merriweather"},
            "portal_names": {"edugames": "Student Hub"},
            "signin": {"edugames": {"headline": "Welcome, learners", "text": "Sign in with your college account.", "motto": "Light and truth",
                                    "highlights": [{"title": "Quizzes", "text": "Live class quizzes"}], "background": {"kind": "colour", "colour": "#0B4A87"}}},
            "links": {"help": "https://help.example.edu", "privacy": "mailto:dpo@example.edu"},
            "landing": {"headline": "Our digital campus"},
        })
        self.assertEqual(response.status_code, 200, response.content)
        look = self.public_look()
        self.assertEqual((look["corners"], look["density"], look["heading_font"]), ("round", "compact", {"kind": "curated", "family": "Merriweather"}))
        self.assertEqual(look["portal_names"], {"teacherbuddy": "", "edugames": "Student Hub", "master_admin": ""})
        page = look["signin"]["edugames"]
        self.assertEqual((page["headline"], page["motto"], page["background"]), ("Welcome, learners", "Light and truth", {"kind": "colour", "colour": "#0b4a87"}))
        self.assertEqual(look["links"]["help"], "https://help.example.edu")
        self.assertEqual(look["landing"]["headline"], "Our digital campus")
        # a later save of one group keeps the others
        self.put({"density": "comfortable"})
        self.assertEqual(self.public_look()["corners"], "round")

    def test_wrong_values_are_refused_naming_the_field(self):
        cases = [
            ({"corners": "wavy"}, "corners"),
            ({"density": "tiny"}, "density"),
            ({"heading_font": {"kind": "curated", "family": "Comic Sans"}}, "heading_font"),
            ({"body_font": {"kind": "upload"}}, "body_font"),
            ({"portal_names": {"edugames": "x" * 31}}, "portal_names.edugames"),
            ({"links": {"terms": "javascript:alert(1)"}}, "links.terms"),
            ({"signin": {"teacherbuddy": {"headline": "x" * 81}}}, "signin.teacherbuddy.headline"),
            ({"signin": {"teacherbuddy": {"highlights": [{"title": "a"}] * 4}}}, "signin.teacherbuddy.highlights"),
            ({"signin": {"teacherbuddy": {"background": {"kind": "colour", "colour": "blue"}}}}, "signin.teacherbuddy.background"),
            ({"signin": {"teacherbuddy": {"background": {"kind": "image"}}}}, "signin.teacherbuddy.background"),
        ]
        for body, field in cases:
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)
        self.assertEqual(UniversityProfile.load().look, {})

    def test_unknown_keys_are_dropped(self):
        self.put({"corners": "sharp", "evil": "<script>", "portal_names": {"other": "x"}})
        stored = UniversityProfile.load().look
        self.assertNotIn("evil", stored)
        self.assertNotIn("other", stored["portal_names"])

    def test_only_a_master_admin_can_change_the_look(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.put({"corners": "sharp"}).status_code, 403)
        self.assertEqual(self.client.post(asset_url("favicon"), {"file": image()}, format="multipart").status_code, 403)
        self.assertEqual(self.client.post(RESET).status_code, 403)


class LookUploadTests(LookBase):
    def test_a_font_file_is_checked_by_its_signature_and_served_to_the_portals(self):
        response = self.client.post(asset_url("heading_font"), {"file": font()}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        look = self.public_look()
        self.assertEqual((look["heading_font"]["kind"], look["heading_font"]["family"], look["heading_font"]["format"]), ("upload", "Gotham Rounded", "woff2"))
        self.client.force_authenticate(None)
        served = self.client.get("/api/v1" + look["heading_font"]["url"])
        self.assertEqual((served.status_code, served["Content-Type"], served["Access-Control-Allow-Origin"]), (200, "font/woff2", "*"))

    def test_each_font_format_is_recognised_and_other_files_are_refused(self):
        for header, fmt in ((b"wOFF", "woff"), (b"\x00\x01\x00\x00", "truetype"), (b"OTTO", "opentype")):
            self.client.post(asset_url("body_font"), {"file": font(header, "Body.ttf")}, format="multipart")
            self.assertEqual(self.public_look()["body_font"]["format"], fmt)
        refused = self.client.post(asset_url("body_font"), {"file": image()}, format="multipart")
        self.assertEqual(refused.status_code, 400)
        too_big = self.client.post(asset_url("body_font"), {"file": font(size=3 * 1024 * 1024)}, format="multipart")
        self.assertEqual(too_big.status_code, 400)

    def test_a_saved_uploaded_font_can_be_kept_or_replaced_by_the_default(self):
        self.client.post(asset_url("heading_font"), {"file": font()}, format="multipart")
        self.assertEqual(self.put({"heading_font": {"kind": "upload"}}).status_code, 200)
        self.assertEqual(self.put({"heading_font": {"kind": "default"}}).status_code, 200)
        self.assertEqual(self.public_look()["heading_font"]["kind"], "default")

    def test_the_tab_icon_is_made_square_and_small(self):
        response = self.client.post(asset_url("favicon"), {"file": image(size=(900, 300))}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        stored = Image.open(io.BytesIO(bytes(UniversityAsset.objects.get(slot="favicon").data)))
        self.assertEqual((stored.format, stored.size), ("PNG", (128, 128)))
        self.assertIsNotNone(self.public_look()["favicon_url"])

    def test_images_must_be_png_jpeg_or_webp(self):
        svg = SimpleUploadedFile("x.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")
        self.assertEqual(self.client.post(asset_url("favicon"), {"file": svg}, format="multipart").status_code, 400)
        gif = io.BytesIO()
        Image.new("RGB", (40, 40)).save(gif, format="GIF")
        self.assertEqual(self.client.post(asset_url("favicon"), {"file": SimpleUploadedFile("x.gif", gif.getvalue())}, format="multipart").status_code, 400)

    def test_a_sign_in_background_is_shrunk_and_removing_it_returns_to_the_brand_colours(self):
        response = self.client.post(asset_url("signin_background:edugames"), {"file": image(size=(4000, 2500))}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        stored = Image.open(io.BytesIO(bytes(UniversityAsset.objects.get(slot="signin_background:edugames").data)))
        self.assertEqual((stored.format, max(stored.size)), ("JPEG", 2000))
        background = self.public_look()["signin"]["edugames"]["background"]
        self.assertEqual(background["kind"], "image")
        self.assertIn("signin_background:edugames", background["url"])
        self.client.delete(asset_url("signin_background:edugames"))
        self.assertEqual(self.public_look()["signin"]["edugames"]["background"]["kind"], "brand")

    def test_unknown_slots_are_refused(self):
        self.assertEqual(self.client.post(asset_url("../../etc"), {"file": image()}, format="multipart").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/institution/university/assets/favicon/").status_code, 404)

    def test_reset_goes_back_to_the_default_and_removes_uploads(self):
        self.client.post(asset_url("favicon"), {"file": image()}, format="multipart")
        self.client.post(asset_url("heading_font"), {"file": font()}, format="multipart")
        self.put({"corners": "sharp"})
        self.assertEqual(self.client.post(RESET).status_code, 200)
        look = self.public_look()
        self.assertEqual((look["corners"], look["heading_font"]["kind"], look["favicon_url"]), ("soft", "default", None))
        self.assertFalse(UniversityAsset.objects.exists())
