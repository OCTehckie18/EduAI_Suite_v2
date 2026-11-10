import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import load_workbook
from rest_framework.test import APITestCase

from apps.core.models import ActionHistory

from .models import AdmittedStaff
from .staff_roster import link_existing_account
from .test_roster import build_structure, google

User = get_user_model()
HEADER = "Employee No,Name,Email,Campus Code,School Code,Department Code,Designation\n"
API = "/api/v1/master-admin/staff-roster/"


def csv_file(*rows):
    return SimpleUploadedFile("staff.csv", (HEADER + "\n".join(rows) + "\n").encode(), content_type="text/csv")


class StaffRosterBase(APITestCase):
    def setUp(self):
        self.section, _ = build_structure()
        self.department = self.section.batch.program.department
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")

    def admin(self):
        self.client.credentials()
        self.client.force_authenticate(self.master)

    def listed(self, email="tina@example.com", emp_no="EMP1", **extra):
        return AdmittedStaff.objects.create(emp_no=emp_no, email=email, name="Tina Rao", department=self.department, **extra)

    def upload(self, *rows):
        self.admin()
        return self.client.post(API + "import/", {"file": csv_file(*rows)}, format="multipart").json()


class SignInTests(StaffRosterBase):
    def test_a_listed_teacher_is_approved_with_roster_details(self):
        entry = self.listed()
        response = google(self.client, "Tina@example.com", app="teacherbuddy")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="tina@example.com")
        self.assertEqual((user.role, user.approval_status, user.emp_no, user.department_id), ("TEACHER", "APPROVED", "EMP1", self.department.pk))
        self.assertEqual(response.json()["status"], "approved")
        entry.refresh_from_db()
        self.assertEqual(entry.user_id, user.pk)

    def test_an_unlisted_teacher_still_applies_and_waits(self):
        response = google(self.client, "new@example.com", app="teacherbuddy")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="new@example.com")
        self.assertEqual(user.approval_status, "PENDING")
        self.assertEqual(response.json()["status"], "pending")

    def test_a_pending_applicant_added_to_the_roster_is_approved_by_the_upload(self):
        google(self.client, "tina@example.com", app="teacherbuddy")
        user = User.objects.get(email="tina@example.com")
        self.assertEqual(user.approval_status, "PENDING")
        result = self.upload("EMP1,Tina Rao,tina@example.com,CEN,SOS,CSE,Lecturer")
        self.assertEqual((result["created"], result["errors"]), (1, []))
        user.refresh_from_db()
        self.assertEqual((user.approval_status, user.emp_no, user.department_id), ("APPROVED", "EMP1", self.department.pk))
        self.assertEqual(AdmittedStaff.objects.get().user_id, user.pk)

    def test_a_pending_applicant_is_approved_at_next_sign_in_if_listed_later(self):
        google(self.client, "tina@example.com", app="teacherbuddy")
        self.listed()
        response = google(self.client, "tina@example.com", app="teacherbuddy")
        self.assertEqual(response.json()["status"], "approved")

    def test_existing_approved_teacher_still_signs_in_unchanged(self):
        User.objects.create_user(email="old@example.com", password="pw", role="TEACHER", emp_no="OLD1")
        self.assertEqual(google(self.client, "old@example.com", app="teacherbuddy").status_code, 200)
        self.assertEqual(User.objects.get(email="old@example.com").emp_no, "OLD1")

    def test_a_student_account_with_a_listed_email_is_not_converted(self):
        student = User.objects.create_user(email="tina@example.com", password="pw", role="STUDENT")
        entry = self.listed()
        self.assertIsNone(link_existing_account(entry))
        student.refresh_from_db()
        self.assertEqual(student.role, "STUDENT")

    def test_a_different_employee_number_is_never_linked(self):
        User.objects.create_user(email="tina@example.com", password="pw", role="TEACHER", emp_no="OTHER", approval_status="PENDING")
        entry = self.listed()
        self.assertIsNone(link_existing_account(entry))

    def test_password_login_links_and_approves(self):
        user = User.objects.create_user(email="tina@example.com", password="Pw-12345678", role="TEACHER", approval_status="PENDING")
        self.listed()
        response = self.client.post(reverse("password-login"), {"username": "tina@example.com", "password": "Pw-12345678"}, format="json")
        self.assertEqual(response.json()["status"], "approved")
        user.refresh_from_db()
        self.assertEqual(user.approval_status, "APPROVED")

    def test_profile_setup_takes_department_and_number_from_the_roster(self):
        self.listed()
        token = google(self.client, "tina@example.com", app="teacherbuddy").json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        info = self.client.get(reverse("profile-setup")).json()
        self.assertEqual((info["matched"], info["emp_no"]), (True, "EMP1"))
        response = self.client.post(reverse("profile-setup"), {"password": "Strong-Pass-123", "emp_no": "SNEAKY", "campus": 999, "school": 999, "department": 999}, format="json")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="tina@example.com")
        self.assertEqual((user.emp_no, user.department_id, user.is_profile_complete), ("EMP1", self.department.pk, True))


class RosterEndpointTests(StaffRosterBase):
    def setUp(self):
        super().setUp()
        self.admin()

    def test_import_creates_updates_and_reports_bad_rows(self):
        result = self.upload(
            "EMP1,Tina,tina@example.com,CEN,SOS,CSE,Lecturer",
            "EMP2,Raj,raj@example.com,CEN,SOS,XXX,",
            "EMP3,Bad,not-an-email,CEN,SOS,CSE,",
        )
        self.assertEqual(result["created"], 1)
        self.assertEqual([e["row"] for e in result["errors"]], [3, 4])
        again = self.upload("EMP1,Tina Rao,tina@example.com,CEN,SOS,CSE,Professor")
        self.assertEqual((again["updated"], AdmittedStaff.objects.get().designation), (1, "Professor"))

    def test_signed_up_teacher_cannot_be_changed_or_deleted(self):
        entry = self.listed()
        google(self.client, "tina@example.com", app="teacherbuddy")
        self.assertIn("already signed up", self.upload("EMP9,Tina,tina@example.com,CEN,SOS,CSE,")["errors"][0]["error"])
        self.assertEqual(self.client.delete(f"{API}{entry.pk}/").status_code, 409)

    def test_unlinked_entry_can_be_deleted(self):
        entry = self.listed()
        self.assertEqual(self.client.delete(f"{API}{entry.pk}/").status_code, 200)

    def test_listing_filters_and_status(self):
        self.listed()
        self.listed("b@example.com", "EMP2")
        google(self.client, "b@example.com", app="teacherbuddy")
        self.admin()
        body = self.client.get(API).json()
        self.assertEqual((body["total"], body["count"]), (2, 2))
        self.assertEqual({r["emp_no"]: r["status"] for r in body["results"]}, {"EMP1": "not_signed_up", "EMP2": "not_signed_up"})
        user = User.objects.get(email="b@example.com")
        user.is_profile_complete = True
        user.save()
        self.assertEqual(self.client.get(API + "?status=signed_up").json()["count"], 1)
        user.delete()
        self.assertEqual(self.client.get(API + "?status=deactivated").json()["count"], 1)
        self.assertEqual(self.client.get(API + "?status=not_signed_up").json()["count"], 1)
        self.assertEqual(self.client.get(API + "?search=EMP2").json()["count"], 1)

    def test_download_add_a_row_upload(self):
        self.listed()
        response = self.client.get(API + "template/")
        workbook = load_workbook(io.BytesIO(response.content))
        self.assertEqual(workbook.sheetnames, ["Teachers", "How to fill this in"])
        rows = list(workbook["Teachers"].values)
        self.assertEqual(rows[1][:3], ("EMP1", "Tina Rao", "tina@example.com"))
        workbook["Teachers"].append(["EMP2", "Raj", "raj@example.com", "CEN", "SOS", "CSE", ""])
        buffer = io.BytesIO()
        workbook.save(buffer)
        result = self.client.post(API + "import/", {"file": SimpleUploadedFile("t.xlsx", buffer.getvalue())}, format="multipart").json()
        self.assertEqual((result["created"], result["unchanged"], result["errors"]), (1, 1, []))
        self.assertEqual(ActionHistory.objects.filter(action="download_staff_roster").count(), 1)

    def test_only_master_admins(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", role="TEACHER"))
        for path in ("", "template/"):
            self.assertEqual(self.client.get(API + path).status_code, 403)
        self.assertEqual(self.client.post(API + "import/", {"file": csv_file()}, format="multipart").status_code, 403)


class ManualApprovalTests(StaffRosterBase):
    def pending(self):
        return User.objects.create_user(email="p@example.com", role="TEACHER", approval_status="PENDING", emp_no="EMP7",
                                        department=self.department, is_profile_complete=True, first_name="Pat", last_name="P")

    def test_approving_can_also_add_the_teacher_to_the_roster(self):
        teacher = self.pending()
        self.admin()
        response = self.client.post(f"/api/v1/master-admin/teacher-approvals/{teacher.pk}/approve/", {"add_to_roster": True}, format="json")
        self.assertEqual((response.status_code, response.json()["added_to_roster"]), (200, True))
        entry = AdmittedStaff.objects.get()
        self.assertEqual((entry.emp_no, entry.user_id), ("EMP7", teacher.pk))

    def test_plain_approval_does_not_touch_the_roster(self):
        teacher = self.pending()
        self.admin()
        self.assertEqual(self.client.post(f"/api/v1/master-admin/teacher-approvals/{teacher.pk}/approve/").status_code, 200)
        self.assertFalse(AdmittedStaff.objects.exists())
