from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import AdmittedStudent
from .testing import admit

User = get_user_model()
HEADER = "Register No,Student Name,Student Email,Campus Code,School Code,Department Code,Program Code,Class,Section\n"


def build_structure():
    campus = Campus.objects.create(name="Central", code="CEN", city="Bengaluru")
    school = School.objects.create(name="Sciences", code="SOS", campus=campus)
    department = Department.objects.create(name="Computer Science", code="CSE", school=school)
    program = Program.objects.create(
        name="BCA", code="BCA", department=department, degree_level=Program.DegreeLevel.UG, duration_years=3
    )
    batch = Batch.objects.create(name="2026-29", program=program, start_year=2026, end_year=2029, academic_year="2026-27")
    return Section.objects.create(name="A", batch=batch), Section.objects.create(name="B", batch=batch)


def csv_file(*rows, name="roster.csv"):
    return SimpleUploadedFile(name, (HEADER + "\n".join(rows) + "\n").encode(), content_type="text/csv")


def google(client, email, app="edugames"):
    with patch("apps.accounts.views.id_token.verify_oauth2_token") as verify:
        verify.return_value = {"email": email, "email_verified": True, "given_name": "Asha", "family_name": "Rao"}
        return client.post(reverse("google-login"), {"id_token": "t", "app": app}, format="json")


class RosterImportTests(APITestCase):
    def setUp(self):
        self.section_a, self.section_b = build_structure()
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def upload(self, *rows):
        return self.client.post("/api/v1/master-admin/roster/import/", {"file": csv_file(*rows)}, format="multipart")

    def test_import_creates_entries_and_reports_row_errors(self):
        response = self.upload(
            "2641001,Asha Rao,Asha.Rao@Example.com,CEN,SOS,CSE,BCA,2026-29,A",
            "2641002,Ravi K,ravi@example.com,CEN,SOS,CSE,BCA,2026-29,B",
            "2641003,Lost,lost@example.com,CEN,SOS,CSE,BCA,2026-29,Z",
            "2641004,Bad,not-an-email,CEN,SOS,CSE,BCA,2026-29,A",
            ",NoReg,noreg@example.com,CEN,SOS,CSE,BCA,2026-29,A",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["created"], body["updated"], body["unchanged"]), (2, 0, 0))
        self.assertEqual([e["row"] for e in body["errors"]], [4, 5, 6])
        self.assertIn("Section 'Z'", body["errors"][0]["error"])
        self.assertEqual(AdmittedStudent.objects.get(register_no="2641001").email, "asha.rao@example.com")
        self.assertEqual(AdmittedStudent.objects.get(register_no="2641002").section, self.section_b)

    def test_reimport_is_idempotent_and_updates_unclaimed_entries(self):
        row = "2641001,Asha Rao,asha@example.com,CEN,SOS,CSE,BCA,2026-29,A"
        self.upload(row)
        again = self.upload(row).json()
        self.assertEqual((again["created"], again["updated"], again["unchanged"]), (0, 0, 1))
        moved = self.upload("2641001,Asha Rao,asha@example.com,CEN,SOS,CSE,BCA,2026-29,B").json()
        self.assertEqual(moved["updated"], 1)
        self.assertEqual(AdmittedStudent.objects.get().section, self.section_b)

    def test_a_student_who_has_signed_up_cannot_be_changed_by_import(self):
        self.upload("2641001,Asha Rao,asha@example.com,CEN,SOS,CSE,BCA,2026-29,A")
        google(APITestCase().client_class(), "asha@example.com")
        moved = self.upload("2641001,Asha Rao,asha@example.com,CEN,SOS,CSE,BCA,2026-29,B").json()
        self.assertEqual(moved["updated"], 0)
        self.assertIn("already signed up", moved["errors"][0]["error"])

    def test_mismatched_email_and_register_number_are_rejected(self):
        self.upload("1,One,one@example.com,CEN,SOS,CSE,BCA,2026-29,A", "2,Two,two@example.com,CEN,SOS,CSE,BCA,2026-29,A")
        clash = self.upload("1,One,two@example.com,CEN,SOS,CSE,BCA,2026-29,A").json()
        self.assertIn("different students", clash["errors"][0]["error"])

    def test_bad_files_are_refused_with_a_clear_message(self):
        missing = self.client.post(
            "/api/v1/master-admin/roster/import/",
            {"file": SimpleUploadedFile("r.csv", b"Register No,Student Email\n1,a@b.com\n", content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("Missing column", missing.json()["detail"])
        wrong = self.client.post(
            "/api/v1/master-admin/roster/import/", {"file": SimpleUploadedFile("r.pdf", b"x")}, format="multipart"
        )
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(self.client.post("/api/v1/master-admin/roster/import/", {}, format="multipart").status_code, 400)

    def test_template_download_and_listing(self):
        template = self.client.get("/api/v1/master-admin/roster/template/")
        self.assertEqual(template.status_code, 200)
        self.assertIn("spreadsheetml", template["Content-Type"])
        admit("a@x.com", "R1", section=self.section_a)
        admit("b@x.com", "R2", section=self.section_b)
        listing = self.client.get("/api/v1/master-admin/roster/?search=R1").json()
        self.assertEqual((listing["total"], listing["count"]), (2, 1))
        self.assertEqual(listing["results"][0]["section"], "A")
        self.assertEqual(listing["results"][0]["status"], "not_signed_up")

    def test_only_master_admin_can_use_the_roster(self):
        for user in (User.objects.create_user(email="t@x.com", role="TEACHER"), User.objects.create_user(email="s@x.com", role="STUDENT")):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/v1/master-admin/roster/").status_code, 403)
            self.assertEqual(self.client.post("/api/v1/master-admin/roster/import/", {"file": csv_file()}, format="multipart").status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get("/api/v1/master-admin/roster/").status_code, (401, 403))

    def test_unclaimed_entries_can_be_removed_but_signed_up_students_cannot(self):
        free = admit("free@x.com", "F1", section=self.section_a)
        self.assertEqual(self.client.delete(f"/api/v1/master-admin/roster/{free.pk}/").status_code, 200)
        taken = admit("taken@x.com", "T1", section=self.section_a)
        google(APITestCase().client_class(), "taken@x.com")
        self.assertEqual(self.client.delete(f"/api/v1/master-admin/roster/{taken.pk}/").status_code, 409)


class StudentSignUpTests(APITestCase):
    def setUp(self):
        self.section_a, self.section_b = build_structure()

    def test_unlisted_students_cannot_create_an_account(self):
        response = google(self.client, "stranger@example.com")
        self.assertEqual(response.status_code, 403)
        self.assertIn("admitted-students list", response.json()["detail"])
        self.assertFalse(User.all_objects.filter(email="stranger@example.com").exists())

    def test_listed_students_get_their_placement_from_the_roster(self):
        admit("asha@example.com", "2641001", name="Asha Rao", section=self.section_b)
        response = google(self.client, "Asha@Example.com")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="asha@example.com")
        self.assertEqual((user.role, user.register_no, user.section_id, user.is_profile_complete), ("STUDENT", "2641001", self.section_b.pk, False))
        self.assertEqual((user.batch_id, user.program_id, user.department_id), (self.section_b.batch_id, self.section_b.batch.program_id, self.section_b.batch.program.department_id))
        self.assertEqual(AdmittedStudent.objects.get().user_id, user.pk)

    def test_profile_setup_ignores_forged_placement_and_register_number(self):
        other_section = build_structure_other()
        admit("asha@example.com", "2641001", section=self.section_a)
        token = google(self.client, "asha@example.com").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        info = self.client.get(reverse("profile-setup")).json()
        self.assertTrue(info["matched"])
        self.assertEqual((info["register_no"], info["placement"]["section"].endswith("A")), ("2641001", True))
        response = self.client.post(reverse("profile-setup"), {
            "password": "Secure#123", "register_no": "HACKED", "section": other_section.pk,
            "batch": other_section.batch_id, "campus": other_section.batch.program.department.school.campus_id,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        user = User.objects.get(email="asha@example.com")
        self.assertEqual((user.register_no, user.section_id, user.is_profile_complete), ("2641001", self.section_a.pk, True))

    def test_profile_setup_is_blocked_for_students_missing_from_the_roster(self):
        legacy = User.objects.create_user(email="legacy@example.com", role="STUDENT")
        self.client.force_authenticate(legacy)
        response = self.client.post(reverse("profile-setup"), {"password": "Secure#123"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.client.get(reverse("profile-setup")).json()["matched"])

    def test_teacher_signup_is_unaffected_by_the_roster(self):
        response = google(self.client, "teacher@example.com", app="teacherbuddy")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "teacher")


def build_structure_other():
    campus = Campus.objects.create(name="Other", code="OTH", city="Pune")
    school = School.objects.create(name="Arts", code="ART", campus=campus)
    department = Department.objects.create(name="English", code="ENG", school=school)
    program = Program.objects.create(
        name="BA", code="BA", department=department, degree_level=Program.DegreeLevel.UG, duration_years=3
    )
    batch = Batch.objects.create(name="2026-29", program=program, start_year=2026, end_year=2029, academic_year="2026-27")
    return Section.objects.create(name="A", batch=batch)
