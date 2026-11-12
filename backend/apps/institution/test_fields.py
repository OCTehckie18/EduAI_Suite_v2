import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from apps.accounts import roster
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from . import fields
from .models import UniversityProfile

User = get_user_model()
URL = "/api/v1/master-admin/university/fields/"
PUBLIC = "/api/v1/institution/university/"
ME = "/api/v1/auth/me/"

HOSTEL = {"label": "Hostel", "type": "choice", "choices": ["North", "South"], "applies_to": "student"}
GUARDIAN = {"label": "Guardian phone", "type": "text", "applies_to": "student", "required": True}
BLOOD = {"label": "Blood group", "type": "text", "applies_to": "both", "admin_only": True}


class PatternTests(APITestCase):
    def test_matching(self):
        self.assertTrue(fields.matches("9999999", "2100042"))
        self.assertFalse(fields.matches("9999999", "210004"))
        self.assertFalse(fields.matches("9999999", "21000a2"))
        self.assertTrue(fields.matches("99-AAA-9999", "21-MCA-0042"))
        self.assertTrue(fields.matches("XXX", "a1B"))
        self.assertTrue(fields.matches("", "anything"))

    def test_description(self):
        info = fields.describe("99-AAA-9999")
        self.assertEqual(info["description"], "2 digits, '-', 3 letters, '-', 4 digits")
        self.assertEqual(info["example"], "77-KKK-7777")


class FieldsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)
        campus = Campus.objects.create(name="Main", code="MAIN")
        school = School.objects.create(campus=campus, name="Sci", code="SCI")
        dept = Department.objects.create(school=school, name="CS", code="CS")
        program = Program.objects.create(department=dept, name="MCA", code="MCA", duration_years=2)
        batch = Batch.objects.create(program=program, name="2026", start_year=2026, end_year=2028)
        self.section = Section.objects.create(batch=batch, name="A")
        self.student = User.objects.create_user(email="s@x.com", password="pw", role="STUDENT", register_no="OLD1")

    def save(self, body):
        return self.client.put(URL, body, format="json")

    def test_nothing_changes_by_default(self):
        public = self.client.get(PUBLIC).json()["fields"]
        self.assertEqual(public["custom"], [])
        self.assertEqual(public["id_formats"]["register_no"]["pattern"], "")
        self.assertIsNone(fields.check_id("register_no", "whatever 123"))

    def test_definitions_are_saved_and_published(self):
        response = self.save({"custom": [HOSTEL, GUARDIAN], "id_formats": {"register_no": {"pattern": "9999999"}}})
        self.assertEqual(response.status_code, 200, response.content)
        public = self.client.get(PUBLIC).json()["fields"]
        self.assertEqual([f["key"] for f in public["custom"]], ["hostel", "guardian_phone"])
        self.assertEqual(public["id_formats"]["register_no"]["description"], "7 digits")

    def test_definition_validation(self):
        bad = [
            {"custom": [{"label": "", "type": "text"}]},
            {"custom": [{"label": "Hostel", "type": "choice", "choices": ["Only one"]}]},
            {"custom": [{"label": "X", "type": "ghost"}]},
            {"custom": [{"label": "Email", "type": "text"}]},
            {"custom": [{"label": "A", "type": "text"}, {"label": "a", "type": "text"}]},
            {"custom": [{"label": f"F{i}", "type": "text"} for i in range(11)]},
            {"id_formats": {"register_no": {"pattern": "----"}}},
        ]
        for body in bad:
            self.assertEqual(self.save(body).status_code, 400, body)
        self.assertEqual(UniversityProfile.load().fields, {})

    def test_id_format_checks_new_numbers_only(self):
        self.save({"id_formats": {"register_no": {"pattern": "9999999"}}})
        self.client.force_authenticate(self.student)
        # the existing, non-conforming number stays; an unchanged value is not re-checked
        self.assertEqual(self.client.patch(ME, {"register_no": "OLD1"}, format="json").status_code, 200)
        self.client.force_authenticate(self.master)
        response = self.client.patch(f"/api/v1/master-admin/users/{self.student.pk}/", {"register_no": "12"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("7 digits", response.json()["detail"])
        ok = self.client.patch(f"/api/v1/master-admin/users/{self.student.pk}/", {"register_no": "2100042"}, format="json")
        self.assertEqual(ok.status_code, 200)

    def test_roster_import_names_the_row(self):
        self.save({"id_formats": {"register_no": {"pattern": "9999999"}}})
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(list(roster.TEMPLATE_COLUMNS))
        sheet.append(["2100042", "Good", "good@x.com", "MAIN", "SCI", "CS", "MCA", "2026", "A"])
        sheet.append(["BAD", "Bad", "bad@x.com", "MAIN", "SCI", "CS", "MCA", "2026", "A"])
        buffer = io.BytesIO()
        workbook.save(buffer)
        result = roster.import_roster(SimpleUploadedFile("r.xlsx", buffer.getvalue()))
        self.assertEqual(result.created, 1)
        self.assertEqual(len(result.errors), 1)
        self.assertEqual(result.errors[0]["row"], 3)
        self.assertIn("7 digits", result.errors[0]["error"])

    def test_people_fill_their_own_fields(self):
        self.save({"custom": [HOSTEL, GUARDIAN, BLOOD]})
        self.client.force_authenticate(self.student)
        for body in ({"extra": {"hostel": "East"}}, {"extra": {"blood_group": "O+"}}, {"extra": {"guardian_phone": ""}}, {"extra": []}):
            self.assertEqual(self.client.patch(ME, body, format="json").status_code, 400, body)
        ok = self.client.patch(ME, {"extra": {"hostel": "south", "guardian_phone": "98765"}}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["user"]["extra"], {"hostel": "South", "guardian_phone": "98765"})

    def test_admin_can_edit_any_field_and_teachers_do_not_get_student_fields(self):
        self.save({"custom": [HOSTEL, BLOOD]})
        response = self.client.patch(f"/api/v1/master-admin/users/{self.student.pk}/", {"extra": {"blood_group": "O+", "hostel": "North"}}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.student.refresh_from_db()
        self.assertEqual(self.student.extra, {"blood_group": "O+", "hostel": "North"})
        teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER")
        self.assertEqual([d["key"] for d in fields.definitions_for(teacher.role)], ["blood_group"])

    def test_only_master_admin(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.save({}).status_code, 403)
