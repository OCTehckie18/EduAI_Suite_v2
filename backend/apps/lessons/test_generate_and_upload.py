from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

User = get_user_model()


class LessonGenerateTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(email="t@x.com", role="TEACHER")
        self.client.force_authenticate(self.teacher)

    def test_the_plan_says_whether_the_ai_wrote_it(self):
        with mock.patch("services.groq_service.GroqService.get_client", return_value=None):
            body = self.client.post("/api/v1/lessons/generate", {"topic": "Photosynthesis"}, format="json").json()
        self.assertEqual((body["success"], body["source"]), (True, "template"))

    def test_internal_errors_are_not_leaked(self):
        with mock.patch("services.groq_service.GroqService.generate_lesson_plan", side_effect=RuntimeError("secret internals")):
            response = self.client.post("/api/v1/lessons/generate", {"topic": "X"}, format="json")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret", str(response.json()))

    def test_plan_uploads_are_checked_for_type_and_size(self):
        bad = SimpleUploadedFile("plan.exe", b"MZ")
        self.assertEqual(self.client.post("/api/v1/lessons/parse-plan", {"file": bad}, format="multipart").status_code, 400)
        big = SimpleUploadedFile("plan.txt", b"x" * (11 * 1024 * 1024))
        self.assertEqual(self.client.post("/api/v1/lessons/parse-plan", {"file": big}, format="multipart").status_code, 400)
        ok = SimpleUploadedFile("plan.txt", b"Topic: Algebra\nWeek 1: equations")
        self.assertEqual(self.client.post("/api/v1/lessons/parse-plan", {"file": ok}, format="multipart").status_code, 200)
