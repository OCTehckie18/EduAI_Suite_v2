import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from docx import Document
from PIL import Image
from rest_framework.test import APITestCase

from apps.reports.builders import render_docx

from .models import UniversityProfile

User = get_user_model()
DOCS = "/api/v1/master-admin/university/documents/"
SAMPLE = DOCS + "sample/"
LOGO = "/api/v1/master-admin/university/logo/"
PUBLIC = "/api/v1/institution/university/"


def read(content):
    return Document(io.BytesIO(content))


def header_text(document):
    return "\n".join(p.text for p in document.sections[0].header.paragraphs)


class DocumentsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)
        profile = UniversityProfile.load()
        profile.name, profile.address = "Central Test University", "1 University Road,\nBengaluru"
        profile.save()

    def put(self, body):
        return self.client.put(DOCS, body, format="json")

    def test_documents_look_as_before_until_the_letterhead_is_switched_on(self):
        document = read(render_docx("Report", "# Title\n- one"))
        self.assertEqual(header_text(document).strip(), "")
        self.assertEqual(self.client.get(PUBLIC).json()["documents"]["enabled"], False)

    def test_the_letterhead_adds_name_address_footer_and_signatory(self):
        response = self.put({"enabled": True, "footer": "Computer generated report", "signatory_name": "Dr. A. Rao", "signatory_title": "Controller of Examinations"})
        self.assertEqual(response.status_code, 200, response.content)
        document = read(render_docx("Report", "# Title\n- one"))
        header = header_text(document)
        self.assertIn("Central Test University", header)
        self.assertIn("1 University Road, Bengaluru", header)
        self.assertIn("Computer generated report", document.sections[0].footer.paragraphs[0].text)
        body = [p.text for p in document.paragraphs]
        self.assertIn("Dr. A. Rao", body)
        self.assertIn("Controller of Examinations", body)

    def test_each_part_can_be_left_out(self):
        self.put({"enabled": True, "show_name": False, "show_address": False})
        document = read(render_docx("Report", "# Title"))
        self.assertEqual(header_text(document).strip(), "")

    def test_the_logo_is_placed_in_the_header_when_there_is_one(self):
        buffer = io.BytesIO()
        Image.new("RGB", (300, 200), (11, 74, 135)).save(buffer, format="PNG")
        self.client.post(LOGO, {"file": SimpleUploadedFile("logo.png", buffer.getvalue())}, format="multipart")
        self.put({"enabled": True})
        document = read(render_docx("Report", "# Title"))
        self.assertEqual(len(document.sections[0].header.part.related_parts), 1)
        self.put({"show_logo": False})
        document = read(render_docx("Report", "# Title"))
        self.assertEqual(len(document.sections[0].header.part.related_parts), 0)

    def test_the_sample_shows_the_letterhead_without_saving_anything(self):
        response = self.client.post(SAMPLE, {"footer": "Sample footer", "signatory_name": "Dr. A. Rao"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        document = read(response.content)
        self.assertIn("Central Test University", header_text(document))
        self.assertIn("Sample footer", document.sections[0].footer.paragraphs[0].text)
        self.assertEqual(UniversityProfile.load().documents, {})

    def test_wrong_values_are_refused_naming_the_field(self):
        for body, field in (
            ({"enabled": "yes"}, "enabled"),
            ({"footer": "x" * 201}, "footer"),
            ({"signatory_name": "x" * 81}, "signatory_name"),
            ({"signatory_title": "Registrar"}, "signatory_name"),
        ):
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)
        self.assertEqual(self.client.post(SAMPLE, {"footer": "x" * 201}, format="json").status_code, 400)

    def test_only_a_master_admin_can_change_it(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.put({"enabled": True}).status_code, 403)
        self.assertEqual(self.client.post(SAMPLE, {}, format="json").status_code, 403)
