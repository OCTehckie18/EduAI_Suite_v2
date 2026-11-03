from unittest.mock import patch

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.institution.models import Batch, Campus, Department, Program, School, Section


class LoginHardeningTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            email="active@example.com", password="secure-pass", register_no="REG1"
        )

    def tearDown(self):
        cache.clear()

    def test_inactive_user_cannot_login_or_refresh(self):
        login = self.client.post(reverse("password-login"), {"username": "REG1", "password": "secure-pass"}, format="json")
        self.assertEqual(login.status_code, 200)
        refresh_token = login.data["refresh"]

        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        login = self.client.post(reverse("password-login"), {"username": "REG1", "password": "secure-pass"}, format="json")
        self.assertEqual(login.status_code, 401)
        refresh = self.client.post(reverse("refresh-token"), {"refresh": refresh_token}, format="json")
        self.assertEqual(refresh.status_code, 401)

    def test_password_login_is_rate_limited(self):
        statuses = [
            self.client.post(reverse("password-login"), {"username": "REG1", "password": "wrong"}, format="json").status_code
            for _ in range(12)
        ]
        self.assertEqual(statuses[:10], [401] * 10)
        self.assertIn(429, statuses[10:])


class GoogleAuthenticationTests(APITestCase):
    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_google_login_issues_eduai_jwt(self, verify_token):
        verify_token.return_value = {
            "email": "student@example.com",
            "email_verified": True,
            "given_name": "Test",
            "family_name": "Student",
        }

        response = self.client.post(
            reverse("google-login"),
            {"id_token": "google-id-token", "app": "edugames"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "student")
        payload = jwt.decode(response.data["access"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
        self.assertEqual(payload["email"], "student@example.com")
        self.assertTrue(get_user_model().objects.filter(email="student@example.com").exists())

    def test_me_requires_eduai_jwt(self):
        response = self.client.get(reverse("current-user"))
        self.assertEqual(response.status_code, 403)

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_admin_granted_teacher_profile_setup_and_password_login(self, verify_token):
        User = get_user_model()
        User.objects.create_user(email="teacher@example.com", role=User.Role.TEACHER)
        verify_token.return_value = {"email": "teacher@example.com", "email_verified": True, "given_name": "Test"}
        google_response = self.client.post(reverse("google-login"), {"id_token": "google-id-token", "app": "edugames"}, format="json")
        self.assertEqual(google_response.data["user"]["role"], "teacher")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")

        campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SCI", campus=campus)
        department = Department.objects.create(name="Computer Science", code="CSE", school=school)
        profile_response = self.client.post(
            reverse("profile-setup"),
            {"campus": campus.pk, "school": school.pk, "department": department.pk, "emp_no": "EMP001", "password": "secure-pass"},
            format="json",
        )
        self.assertEqual(profile_response.status_code, 200)
        self.assertTrue(profile_response.data["is_profile_complete"])

        self.client.credentials()
        login_response = self.client.post(reverse("password-login"), {"username": "EMP001", "password": "secure-pass"}, format="json")
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["user"]["role"], "teacher")

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_teacher_app_signup_and_self_promotion_are_blocked(self, verify_token):
        verify_token.return_value = {"email": "wannabe@example.com", "email_verified": True, "given_name": "Wannabe"}
        google_response = self.client.post(reverse("google-login"), {"id_token": "t", "app": "teacherbuddy"}, format="json")
        self.assertEqual(google_response.data["user"]["role"], "student")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")

        campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SCI", campus=campus)
        department = Department.objects.create(name="Computer Science", code="CSE", school=school)
        response = self.client.post(
            reverse("profile-setup"),
            {"role": "TEACHER", "campus": campus.pk, "school": school.pk, "department": department.pk, "password": "secure-pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(get_user_model().objects.get(email="wannabe@example.com").role, "STUDENT")

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_completed_profile_cannot_be_set_up_again(self, verify_token):
        User = get_user_model()
        user = User.objects.create_user(email="done@example.com", role=User.Role.STUDENT, is_profile_complete=True)
        verify_token.return_value = {"email": "done@example.com", "email_verified": True}
        google_response = self.client.post(reverse("google-login"), {"id_token": "t"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")
        response = self.client.post(reverse("profile-setup"), {"password": "secure-pass"}, format="json")
        self.assertEqual(response.status_code, 409)
        user.refresh_from_db()
        self.assertTrue(user.is_profile_complete)

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_deactivated_user_google_login_is_forbidden(self, verify_token):
        User = get_user_model()
        user = User.objects.create_user(email="gone@example.com", role=User.Role.STUDENT)
        user.is_active = False
        user.save(update_fields=["is_active"])
        verify_token.return_value = {"email": "gone@example.com", "email_verified": True}
        response = self.client.post(reverse("google-login"), {"id_token": "t"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_refresh_and_me_use_current_database_role(self):
        User = get_user_model()
        user = User.objects.create_user(email="demoted@example.com", password="secure-pass", role=User.Role.TEACHER)
        login = self.client.post(reverse("password-login"), {"username": "demoted@example.com", "password": "secure-pass"}, format="json")
        user.role = User.Role.STUDENT
        user.save(update_fields=["role"])
        refreshed = self.client.post(reverse("refresh-token"), {"refresh": login.data["refresh"]}, format="json")
        self.assertEqual(refreshed.data["user"]["role"], "student")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get(reverse("current-user")).data["user"]["role"], "student")

    def test_password_change_requires_current_password_and_strength(self):
        User = get_user_model()
        User.objects.create_user(email="pw@example.com", password="secure-pass", role=User.Role.STUDENT)
        login = self.client.post(reverse("password-login"), {"username": "pw@example.com", "password": "secure-pass"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        url = reverse("current-user")
        self.assertEqual(self.client.patch(url, {"password": "brand-new-pass"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"password": "brand-new-pass", "current_password": "wrong"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"password": "123456", "current_password": "secure-pass"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"password": "brand-new-pass", "current_password": "secure-pass"}, format="json").status_code, 200)
        self.client.credentials()
        ok = self.client.post(reverse("password-login"), {"username": "pw@example.com", "password": "brand-new-pass"}, format="json")
        self.assertEqual(ok.status_code, 200)

    def test_register_number_is_locked_once_set_and_blank_is_null(self):
        User = get_user_model()
        User.objects.create_user(email="a@example.com", password="secure-pass", role=User.Role.STUDENT, register_no="REG1")
        User.objects.create_user(email="b@example.com", password="secure-pass", role=User.Role.STUDENT)
        login = self.client.post(reverse("password-login"), {"username": "a@example.com", "password": "secure-pass"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.patch(reverse("current-user"), {"register_no": "OTHER"}, format="json").status_code, 403)
        login_b = self.client.post(reverse("password-login"), {"username": "b@example.com", "password": "secure-pass"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_b.data['access']}")
        self.assertEqual(self.client.patch(reverse("current-user"), {"register_no": "  "}, format="json").status_code, 200)
        self.assertIsNone(User.objects.get(email="b@example.com").register_no)

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_profile_setup_rejects_admin_role_escalation(self, verify_token):
        verify_token.return_value = {"email": "sneaky@example.com", "email_verified": True, "given_name": "Sneaky"}
        google_response = self.client.post(reverse("google-login"), {"id_token": "t", "app": "edugames"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")

        campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SCI", campus=campus)
        department = Department.objects.create(name="Computer Science", code="CSE", school=school)
        for role in ("MASTER_ADMIN",):
            response = self.client.post(
                reverse("profile-setup"),
                {"role": role, "campus": campus.pk, "school": school.pk, "department": department.pk, "password": "secure-pass"},
                format="json",
            )
            self.assertEqual(response.status_code, 400)
        user = get_user_model().objects.get(email="sneaky@example.com")
        self.assertEqual(user.role, "STUDENT")

    @patch("apps.accounts.views.id_token.verify_oauth2_token")
    def test_student_register_number_can_login_after_profile_setup(self, verify_token):
        verify_token.return_value = {"email": "student2@example.com", "email_verified": True, "given_name": "Test"}
        google_response = self.client.post(
            reverse("google-login"),
            {"id_token": "google-id-token", "app": "edugames"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")

        campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SCI", campus=campus)
        department = Department.objects.create(name="Computer Science", code="CSE", school=school)
        program = Program.objects.create(
            name="BCA", code="BCA", department=department, degree_level=Program.DegreeLevel.UG, duration_years=3
        )
        batch = Batch.objects.create(name="2026", program=program, start_year=2026, end_year=2029, academic_year="2026-27")
        section = Section.objects.create(name="A", batch=batch)

        profile_response = self.client.post(
            reverse("profile-setup"),
            {
                "role": "STUDENT",
                "campus": campus.pk,
                "school": school.pk,
                "department": department.pk,
                "program": program.pk,
                "batch": batch.pk,
                "section": section.pk,
                "register_no": "STU001",
                "password": "secure-pass",
            },
            format="json",
        )
        self.assertEqual(profile_response.status_code, 200)
        self.assertTrue(profile_response.data["is_profile_complete"])

        self.client.credentials()
        login_response = self.client.post(
            reverse("password-login"),
            {"username": "STU001", "password": "secure-pass"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["user"]["role"], "student")
