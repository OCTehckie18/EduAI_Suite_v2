"""Security regressions: register and employee numbers and a student's sign-in email are not self-service or teacher-editable."""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase, APITransactionTestCase

from apps.classrooms.models import Classroom, Enrollment

from .models import AdmittedStaff
from .testing import admit, default_section
from .views import _issue_token

User = get_user_model()


def bearer(user):
    return {"HTTP_AUTHORIZATION": "Bearer " + _issue_token(user, user.role, "access", timedelta(minutes=5))}


def google(client, email, app="edugames"):
    with patch("apps.accounts.views.id_token.verify_oauth2_token") as verify:
        verify.return_value = {"email": email, "email_verified": True, "given_name": "V", "family_name": "R"}
        return client.post("/api/v1/auth/google/", {"id_token": "t", "app": app}, format="json")


class TeacherCannotRewriteStudentIdentityTests(APITestCase):
    def setUp(self):
        section = default_section()
        self.teacher = User.objects.create_user(email="t@example.com", password="pw", role="TEACHER", approval_status="APPROVED")
        self.admin = User.objects.create_user(email="m@example.com", password="pw", role="MASTER_ADMIN")
        self.student = User.objects.create_user(email="alice@example.com", password="pw", role="STUDENT", register_no="R100", first_name="Alice")
        self.course = Classroom.objects.create(
            name="C", subject_code="C1", teacher=self.teacher, department=section.batch.program.department,
            program=section.batch.program, batch=section.batch, section=section,
        )
        Enrollment.objects.create(classroom=self.course, student=self.student)
        self.url = f"/api/v1/students/detail/{self.student.pk}"

    def put(self, user, body):
        self.client.force_authenticate(user)
        return self.client.put(self.url, body, format="json")

    def test_a_teacher_cannot_change_the_email_or_register_number(self):
        for body in ({"email": "attacker@example.org"}, {"register_no": "HIJACK1"}, {"registration_number": "HIJACK1"}):
            self.assertEqual(self.put(self.teacher, body).status_code, 403, body)
        self.student.refresh_from_db()
        self.assertEqual((self.student.email, self.student.register_no), ("alice@example.com", "R100"))

    def test_a_teacher_can_still_edit_the_name_and_resend_the_same_identity(self):
        response = self.put(self.teacher, {"name": "Alice Jones", "email": "ALICE@example.com", "register_no": "R100"})
        self.assertEqual(response.status_code, 200, response.content)
        self.student.refresh_from_db()
        self.assertEqual(self.student.last_name, "Jones")

    def test_the_master_admin_can_change_them(self):
        self.assertEqual(self.put(self.admin, {"email": "new@example.com", "register_no": "R200"}).status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual((self.student.email, self.student.register_no), ("new@example.com", "R200"))


class SelfServiceIdentifiersTests(APITestCase):
    def test_nobody_can_claim_a_register_or_employee_number_through_their_profile(self):
        pending = User.objects.create_user(email="p@example.com", role="TEACHER", approval_status="PENDING")
        student = User.objects.create_user(email="s@example.com", role="STUDENT")
        for user, body in ((pending, {"register_no": "2641001"}), (student, {"emp_no": "EMP1001"}), (student, {"register_no": "2641002"})):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.patch("/api/v1/auth/me/", body, format="json").status_code, 403, body)
            user.refresh_from_db()
            self.assertIsNone(user.register_no or user.emp_no)

    def test_resending_the_number_the_account_already_has_is_fine(self):
        student = User.objects.create_user(email="s@example.com", role="STUDENT", register_no="R1")
        self.client.force_authenticate(student)
        response = self.client.patch("/api/v1/auth/me/", {"register_no": "R1", "phone_number": "999"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        student.refresh_from_db()
        self.assertEqual((student.register_no, student.phone_number), ("R1", "999"))

    def test_a_pending_teacher_cannot_register_with_a_listed_teachers_employee_number(self):
        section = default_section()
        AdmittedStaff.objects.create(emp_no="EMP1001", email="listed@example.com", name="L", department=section.batch.program.department)
        pending = User.objects.create_user(email="p@example.com", role="TEACHER", approval_status="PENDING")
        self.client.force_authenticate(pending)
        response = self.client.post("/api/v1/auth/profile/setup/", {
            "role": "TEACHER", "emp_no": "EMP1001", "campus": section.batch.program.department.school.campus_id,
            "school": section.batch.program.department.school_id, "department": section.batch.program.department_id, "password": "Secure#12345x",
        }, format="json")
        self.assertEqual(response.status_code, 409, response.content)
        pending.refresh_from_db()
        self.assertIsNone(pending.emp_no)


@override_settings(GOOGLE_CLIENT_ID="dummy-client.apps.googleusercontent.com")
class HeldIdentifierIsAClearConflictTests(APITransactionTestCase):
    def setUp(self):
        self.client.raise_request_exception = False

    def test_a_held_register_number_gives_409_and_leaves_no_half_made_account(self):
        admit("victim@example.com", "2641001", section=default_section())
        User.objects.create_user(email="other@example.com", role="STUDENT", register_no="2641001")  # held by someone else already
        before = User.all_objects.count()
        response = google(self.client, "victim@example.com")
        self.assertEqual(response.status_code, 409, response.content)
        self.assertIn("already linked", response.json()["detail"])
        self.assertEqual(User.all_objects.count(), before)

    def test_a_held_employee_number_gives_409_for_a_listed_teacher(self):
        section = default_section()
        AdmittedStaff.objects.create(emp_no="EMP1001", email="teacher@example.com", name="T", department=section.batch.program.department)
        User.objects.create_user(email="other@example.com", role="TEACHER", emp_no="EMP1001")
        before = User.all_objects.count()
        response = google(self.client, "teacher@example.com", app="teacherbuddy")
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(User.all_objects.count(), before)
