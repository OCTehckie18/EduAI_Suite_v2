from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import UniversityProfile
from .notice import active_notice

User = get_user_model()
NOTICE = "/api/v1/master-admin/university/notice/"
PUBLIC = "/api/v1/institution/university/"


class NoticeAndHelpTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(NOTICE, body, format="json")

    def public(self):
        self.client.force_authenticate(None)
        body = self.client.get(PUBLIC).json()
        self.client.force_authenticate(self.master)
        return body

    def test_nothing_is_shown_by_default(self):
        body = self.public()
        self.assertIsNone(body["notice"])
        self.assertEqual(body["help"], {"email": "", "phone": "", "hours": "", "link": ""})

    def test_a_notice_is_saved_audited_and_public(self):
        response = self.put({"notice": {"enabled": True, "text": "  Exams start on Monday.  ", "tone": "urgent", "dismissable": False}})
        self.assertEqual(response.status_code, 200, response.content)
        shown = self.public()["notice"]
        self.assertEqual((shown["text"], shown["tone"], shown["dismissable"]), ("Exams start on Monday.", "urgent", False))
        self.assertTrue(response.json()["showing_now"])

    def test_the_version_changes_when_the_notice_changes_and_is_stable_otherwise(self):
        self.put({"notice": {"enabled": True, "text": "One"}})
        first = self.public()["notice"]["version"]
        self.assertEqual(self.public()["notice"]["version"], first)
        self.put({"notice": {"text": "Two"}})
        self.assertNotEqual(self.public()["notice"]["version"], first)

    def test_the_time_window_hides_it_before_and_after(self):
        now = timezone.now()
        profile = UniversityProfile.load()
        base = {"enabled": True, "text": "Hello", "tone": "info", "dismissable": True}
        profile.notice = {**base, "starts_at": (now + timedelta(hours=1)).isoformat(), "ends_at": None}
        self.assertIsNone(active_notice(profile.notice))
        profile.notice = {**base, "starts_at": (now - timedelta(hours=2)).isoformat(), "ends_at": (now - timedelta(hours=1)).isoformat()}
        self.assertIsNone(active_notice(profile.notice))
        profile.notice = {**base, "starts_at": (now - timedelta(hours=1)).isoformat(), "ends_at": (now + timedelta(hours=1)).isoformat()}
        self.assertEqual(active_notice(profile.notice)["text"], "Hello")

    def test_switching_it_off_hides_it_but_keeps_the_text(self):
        self.put({"notice": {"enabled": True, "text": "Hello"}})
        self.put({"notice": {"enabled": False}})
        self.assertIsNone(self.public()["notice"])
        self.assertEqual(self.client.get(NOTICE).json()["notice"]["text"], "Hello")

    def test_wrong_values_are_refused_naming_the_field(self):
        for body, field in (
            ({"notice": {"enabled": True, "text": ""}}, "text"),
            ({"notice": {"text": "x" * 301}}, "text"),
            ({"notice": {"tone": "loud"}}, "tone"),
            ({"notice": {"enabled": "yes"}}, "enabled"),
            ({"notice": {"starts_at": "someday"}}, "starts_at"),
            ({"notice": {"starts_at": "2026-12-02T10:00:00Z", "ends_at": "2026-12-01T10:00:00Z"}}, "ends_at"),
            ({"help": {"email": "not-an-email"}}, "help.email"),
            ({"help": {"link": "javascript:alert(1)"}}, "help.link"),
            ({"help": {"phone": "1" * 31}}, "help.phone"),
        ):
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)
        self.assertEqual(UniversityProfile.load().notice, {})

    def test_help_details_are_saved_and_public(self):
        self.put({"help": {"email": "help@ctu.edu", "phone": "+91 80 1234 5678", "hours": "Mon to Fri, 9 to 5", "link": "https://help.ctu.edu"}})
        self.assertEqual(self.public()["help"]["hours"], "Mon to Fri, 9 to 5")
        self.put({"help": {"hours": ""}})
        self.assertEqual(self.public()["help"]["email"], "help@ctu.edu")

    def test_only_a_master_admin_can_change_them(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.put({"notice": {"enabled": False}}).status_code, 403)
