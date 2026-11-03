from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.institution.models import Campus, Department, School

User = get_user_model()


def google(client, email, app):
    with patch("apps.accounts.views.id_token.verify_oauth2_token") as verify:
        verify.return_value = {"email": email, "email_verified": True, "given_name": "Ada", "family_name": "Lovelace"}
        return client.post(reverse("google-login"), {"id_token": "t", "app": app}, format="json")


class TeacherApplicationFlowTests(APITestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        self.school = School.objects.create(name="Sciences", code="SCI", campus=self.campus)
        self.department = Department.objects.create(name="Computer Science", code="CSE", school=self.school)
        self.master = User.objects.create_user(email="m@x.com", password="Pass#12345", role="MASTER_ADMIN")

    def apply(self, email="teacher@x.com", complete=True):
        """Sign in on TeacherBuddy; leaves the client authenticated as the applicant."""
        response = google(self.client, email, "teacherbuddy")
        self.assertEqual(response.status_code, 200)
        self.token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")
        if complete:
            setup = self.client.post(reverse("profile-setup"), {
                "campus": self.campus.pk, "school": self.school.pk, "department": self.department.pk,
                "emp_no": "EMP9", "password": "Teach#12345",
            }, format="json")
            self.assertEqual(setup.status_code, 200)
            self.assertEqual(setup.data["status"], "pending")
        return User.objects.get(email=email), response

    def as_applicant(self):
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def as_master(self):
        self.client.credentials()
        self.client.force_authenticate(self.master)

    def test_teacher_app_signup_creates_a_pending_teacher(self):
        user, response = self.apply(complete=False)
        self.assertEqual((user.role, user.approval_status), ("TEACHER", "PENDING"))
        self.assertEqual(response.data["status"], "pending")

    def test_student_app_signup_is_approved_and_existing_accounts_keep_their_role(self):
        response = google(self.client, "kid@x.com", "edugames")
        self.assertEqual((response.data["user"]["role"], response.data["status"]), ("student", "approved"))
        again = google(self.client, "kid@x.com", "teacherbuddy")
        self.assertEqual(again.data["user"]["role"], "student")

    def test_pending_teacher_can_only_view_account_and_finish_profile(self):
        self.apply()
        self.assertEqual(self.client.get(reverse("current-user")).status_code, 200)
        for url in ("/api/v1/classrooms/", "/api/v1/quizzes/", "/api/v1/exams/", "/api/v1/lessons/"):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_pending_teacher_cannot_password_login_into_teacher_apis(self):
        self.apply()
        self.client.credentials()
        login = self.client.post(reverse("password-login"), {"username": "EMP9", "password": "Teach#12345"}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["status"], "pending")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get("/api/v1/classrooms/").status_code, 403)

    def test_approval_unlocks_access_and_rejection_locks_it_again(self):
        pending, _ = self.apply()
        self.as_master()
        approved = self.client.post(f"/api/v1/master-admin/teacher-approvals/{pending.pk}/approve/")
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.data["status"], "APPROVED")
        self.as_applicant()
        self.assertEqual(self.client.get("/api/v1/classrooms/").status_code, 200)
        self.assertEqual(self.client.get(reverse("current-user")).data["status"], "approved")

        self.as_master()
        rejected = self.client.post(
            f"/api/v1/master-admin/teacher-approvals/{pending.pk}/reject/", {"reason": "Not on the staff list"}, format="json"
        )
        self.assertEqual(rejected.status_code, 200)
        self.as_applicant()
        self.assertEqual(self.client.get("/api/v1/classrooms/").status_code, 403)
        me = self.client.get(reverse("current-user")).data
        self.assertEqual((me["status"], me["user"]["rejection_reason"]), ("denied", "Not on the staff list"))

    def test_cannot_approve_an_applicant_with_an_incomplete_profile(self):
        pending, _ = self.apply(complete=False)
        self.as_master()
        self.assertEqual(self.client.post(f"/api/v1/master-admin/teacher-approvals/{pending.pk}/approve/").status_code, 409)
        pending.refresh_from_db()
        self.assertEqual(pending.approval_status, "PENDING")

    def test_only_master_admin_can_review_applications(self):
        pending, _ = self.apply()  # authenticated as the pending teacher
        self.assertEqual(self.client.get("/api/v1/master-admin/teacher-approvals/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/master-admin/teacher-approvals/{pending.pk}/approve/").status_code, 403)
        student = User.objects.create_user(email="s@x.com", password="x", role="STUDENT")
        self.client.credentials()
        self.client.force_authenticate(student)
        self.assertEqual(self.client.get("/api/v1/master-admin/teacher-approvals/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get("/api/v1/master-admin/teacher-approvals/").status_code, (401, 403))

    def test_listing_filters_and_counts_by_status(self):
        pending, _ = self.apply("a@x.com")
        User.objects.create_user(email="old@x.com", role="TEACHER", emp_no="OLD1")
        self.as_master()
        queue = self.client.get("/api/v1/master-admin/teacher-approvals/").json()
        self.assertEqual([row["email"] for row in queue["results"]], ["a@x.com"])
        self.assertEqual(queue["pending_count"], 1)
        row = queue["results"][0]
        self.assertEqual((row["id"], row["emp_no"]), (pending.pk, "EMP9"))
        self.assertEqual((row["department"], row["campus"]), (str(self.department), str(self.campus)))
        approved = self.client.get("/api/v1/master-admin/teacher-approvals/?status=approved").json()
        self.assertEqual([r["email"] for r in approved["results"]], ["old@x.com"])
        overview = self.client.get("/api/v1/master-admin/overview/").json()
        self.assertEqual(overview["users"]["pending_teacher_approvals"], 1)

    def test_granting_the_teacher_role_in_the_user_directory_approves_the_account(self):
        self.as_master()
        student = User.objects.create_user(email="promote@x.com", role="STUDENT")
        response = self.client.patch(f"/api/v1/master-admin/users/{student.pk}/", {"role": "TEACHER"}, format="json")
        self.assertEqual(response.status_code, 200)
        student.refresh_from_db()
        self.assertEqual(student.approval_status, "APPROVED")
        created = self.client.post("/api/v1/master-admin/users/", {"email": "n@x.com", "password": "Str0ng!pass9", "role": "TEACHER"}, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(User.objects.get(email="n@x.com").approval_status, "APPROVED")
