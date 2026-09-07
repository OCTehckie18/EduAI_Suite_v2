from unittest.mock import patch

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.institution.models import Campus, Department, School


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
    def test_profile_setup_and_password_login(self, verify_token):
        verify_token.return_value = {"email": "teacher@example.com", "email_verified": True, "given_name": "Test"}
        google_response = self.client.post(reverse("google-login"), {"id_token": "google-id-token", "app": "teacherbuddy"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {google_response.data['access']}")

        campus = Campus.objects.create(name="Central", code="CENTRAL", city="Bengaluru")
        school = School.objects.create(name="Sciences", code="SCI", campus=campus)
        department = Department.objects.create(name="Computer Science", code="CSE", school=school)
        profile_response = self.client.post(
            reverse("profile-setup"),
            {"role": "TEACHER", "campus": campus.pk, "school": school.pk, "department": department.pk, "emp_no": "EMP001", "password": "secure-pass"},
            format="json",
        )
        self.assertEqual(profile_response.status_code, 200)
        self.assertTrue(profile_response.data["is_profile_complete"])

        self.client.credentials()
        login_response = self.client.post(reverse("password-login"), {"username": "EMP001", "password": "secure-pass"}, format="json")
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["user"]["role"], "teacher")
