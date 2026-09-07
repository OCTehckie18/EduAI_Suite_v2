from unittest.mock import patch

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase


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
