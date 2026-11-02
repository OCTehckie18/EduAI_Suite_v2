from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.institution.models import Campus

PROTECTED = [
    ("get", "/lessons/"),
    ("get", "/mail/drafts"),
    ("post", "/mail/filter"),
    ("get", "/reports/"),
    ("get", "/analytics/risk-global"),
    ("get", "/dashboard/summary"),
    ("get", "/announcements/1"),
    ("get", "/assignments/1"),
    ("get", "/trello/board"),
    ("get", "/api/v1/institution/campuses/"),
    ("post", "/api/v1/institution/campuses/"),
    ("get", "/engagement/student/1/"),
    ("post", "/games/chain-answer"),
    ("post", "/slido/sessions"),
]


class AuthRequiredByDefaultTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.student = User.objects.create_user(email="s@example.com", password="x", role="STUDENT")
        self.admin = User.objects.create_user(email="a@example.com", password="x", role="CAMPUS_ADMIN")

    def test_anonymous_requests_are_rejected(self):
        for method, url in PROTECTED:
            res = getattr(self.client, method)(url, {}, format="json")
            self.assertIn(res.status_code, (401, 403), f"{method.upper()} {url} -> {res.status_code}")

    def test_public_endpoints_stay_public(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        res = self.client.post("/api/v1/auth/login/", {"username": "nobody", "password": "x"}, format="json")
        self.assertEqual(res.status_code, 401)

    def test_institution_writes_need_admin(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get("/api/v1/institution/campuses/").status_code, 200)
        res = self.client.post("/api/v1/institution/campuses/", {"name": "X", "code": "X", "city": "Y"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Campus.objects.filter(code="X").exists())

        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/v1/institution/campuses/", {"name": "X", "code": "X", "city": "Y"}, format="json")
        self.assertEqual(res.status_code, 201)

    def test_student_cannot_read_another_students_engagement(self):
        other = get_user_model().objects.create_user(email="o@example.com", password="x", role="STUDENT")
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f"/engagement/student/{other.pk}/").status_code, 403)
        self.assertEqual(self.client.get(f"/engagement/student/{self.student.pk}/").status_code, 200)
