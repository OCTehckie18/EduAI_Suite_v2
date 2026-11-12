from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.core.models import ActionHistory

from .models import UniversityProfile
from .modules import MODULES, module_for_path

User = get_user_model()
MODULES_URL = "/api/v1/master-admin/university/modules/"
PUBLIC = "/api/v1/institution/university/"


class ModuleSwitchTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER")
        self.client.force_authenticate(self.master)

    def switch(self, **states):
        return self.client.put(MODULES_URL, states, format="json")

    def test_every_module_starts_switched_on(self):
        body = self.client.get(PUBLIC).json()
        self.assertEqual(body["modules"], {key: True for key in MODULES})
        catalog = self.client.get(MODULES_URL).json()["modules"]
        self.assertEqual({m["key"] for m in catalog}, set(MODULES))
        self.assertTrue(all(m["enabled"] and m["label"] and m["description"] for m in catalog))

    def test_switching_off_is_public_audited_and_reversible(self):
        response = self.switch(forms=False, live_quizzes=False)
        self.assertEqual(response.status_code, 200, response.content)
        self.client.force_authenticate(None)
        modules = self.client.get(PUBLIC).json()["modules"]
        self.assertEqual((modules["forms"], modules["live_quizzes"], modules["mail"]), (False, False, True))
        log = ActionHistory.objects.filter(action="update_university_modules").latest("pk")
        self.assertEqual(log.metadata_json["changed"], {"forms": False, "live_quizzes": False})
        self.client.force_authenticate(self.master)
        self.switch(forms=True)
        self.assertTrue(UniversityProfile.load().modules["forms"])

    def test_the_server_refuses_a_switched_off_modules_api(self):
        self.client.force_authenticate(self.teacher)
        self.assertNotEqual(self.client.get("/api/v1/appointments/").status_code, 404)
        self.client.force_authenticate(self.master)
        self.switch(appointments=False)
        self.client.force_authenticate(self.teacher)
        for path in ("/api/v1/appointments/",):
            response = self.client.get(path)
            self.assertEqual((response.status_code, response.json()["module"]), (404, "appointments"), path)
            self.assertIn("switched off", response.json()["detail"])

    def test_other_routes_keep_working_when_a_module_is_off(self):
        self.switch(**{key: False for key in MODULES})
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get("/api/v1/exams/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/calendar/events").status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(PUBLIC).status_code, 200)

    def test_unknown_modules_and_non_boolean_values_are_refused(self):
        self.assertEqual(self.switch(teleport=False).status_code, 400)
        self.assertEqual(self.switch(forms="no").status_code, 400)
        self.assertEqual(UniversityProfile.load().modules, {})

    def test_only_a_master_admin_can_switch_modules(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.switch(forms=False).status_code, 403)

    def test_each_module_owns_the_right_paths(self):
        cases = {
            "/api/v1/quizzes/sessions": "live_quizzes",
            "/api/v1/games/chain-answer/abc/join": "chain_answer",
            "/api/v1/games/word-suggestions": "chain_answer",
            "/api/v1/wordcloud/sessions": "word_cloud",
            "/api/v1/trello/boards": "trello",
            "/api/v1/forms": "forms",
            "/api/v1/forms/3/submit": "forms",
            "/api/v1/mail/send": "mail",
            "/api/v1/reports/class/1": "reports",
            "/api/v1/omr/jobs": "omr",
            "/api/v1/ai/chat": "ai_assistant",
            "/api/v1/exams/extract": "ai_exam_tools",
            "/api/v1/exams/4/attempts/9/suggest-mark": "ai_exam_tools",
            "/api/v1/calendar/google/connect": "google_calendar",
        }
        for path, key in cases.items():
            self.assertEqual(module_for_path(path), key, path)
        for path in ("/api/v1/exams/4/attempts/9/mark", "/api/v1/exams/", "/api/v1/calendar/events", "/api/v1/master-admin/university/", "/api/v1/formsy"):
            self.assertIsNone(module_for_path(path), path)


class SlidoModuleTests(APITestCase):
    """Slido is kept but unfinished: a Master Admin can switch it off, and its API then closes."""

    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def test_slido_is_a_module_and_starts_on(self):
        self.assertIn("slido", MODULES)
        self.assertTrue(self.client.get(PUBLIC).json()["modules"]["slido"])

    def test_switched_off_its_api_is_refused(self):
        self.client.put(MODULES_URL, {"slido": False}, format="json")
        self.assertEqual(module_for_path("/api/v1/slido/polls/"), "slido")
        self.assertEqual(self.client.get("/api/v1/slido/polls/").status_code, 404)
