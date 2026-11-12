from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from . import terms
from .models import UniversityProfile

User = get_user_model()
URL = "/api/v1/master-admin/university/terms/"
PUBLIC = "/api/v1/institution/university/"


class TermsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(URL, {"terms": body}, format="json")

    def test_defaults_are_todays_words(self):
        table = self.client.get(PUBLIC).json()["terms"]
        self.assertEqual(table["register_no"], {"singular": "Register number", "plural": "Register numbers"})
        self.assertEqual(table["class"]["plural"], "Classes")
        self.assertEqual(terms.get("student"), "Student")

    def test_overrides_are_saved_and_reach_every_portal_and_the_server(self):
        response = self.put({"register_no": {"singular": "Enrolment no.", "plural": "Enrolment nos."}, "school": {"singular": "Faculty", "plural": ""}})
        self.assertEqual(response.status_code, 200, response.content)
        table = self.client.get(PUBLIC).json()["terms"]
        self.assertEqual(table["register_no"]["singular"], "Enrolment no.")
        self.assertEqual(table["school"], {"singular": "Faculty", "plural": "Schools"})  # a blank plural falls back to the default
        self.assertEqual(terms.get("register_no"), "Enrolment no.")
        self.assertEqual(terms.get("register_no", plural=True, lower=True), "enrolment nos.")

    def test_only_changed_words_are_stored(self):
        self.put({"exam": {"singular": "Exam", "plural": "Exams"}, "teacher": {"singular": "Faculty", "plural": "Faculty"}})
        self.assertEqual(list(UniversityProfile.load().terms), ["teacher"])

    def test_putting_the_defaults_back_restores_them(self):
        self.put({"teacher": {"singular": "Faculty", "plural": "Faculty"}})
        self.put({"teacher": {"singular": "Teacher", "plural": "Teachers"}})
        self.assertEqual(UniversityProfile.load().terms, {})

    def test_validation(self):
        for body in ({"nonsense": {"singular": "x", "plural": "x"}}, {"exam": {"singular": "x" * 31, "plural": "y"}}, {"exam": {"singular": "<b>Test</b>", "plural": "y"}}, {"exam": "Test"}):
            self.assertEqual(self.put(body).status_code, 400, body)
        self.assertEqual(UniversityProfile.load().terms, {})
        self.assertEqual(self.client.put(URL, {"terms": []}, format="json").status_code, 400)

    def test_only_master_admin(self):
        teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER")
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.put({}).status_code, 403)

    def test_rows_listed_for_the_admin_screen(self):
        rows = self.client.get(URL).json()["rows"]
        self.assertIn("register_no", [r["key"] for r in rows])
