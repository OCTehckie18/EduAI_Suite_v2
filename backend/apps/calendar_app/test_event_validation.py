from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.calendar_app.models import CalendarEvent


class EventValidation(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="t@x.com", password="x", role="TEACHER")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def post(self, **body):
        return self.client.post("/calendar/events", {"title": "Meeting", **body}, format="json")

    def test_an_event_cannot_end_before_it_starts(self):
        res = self.post(start_time="2026-11-18T15:00:00", end_time="2026-11-18T14:00:00")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], "The event must end after it starts.")
        self.assertFalse(CalendarEvent.objects.exists())

    def test_bad_dates_and_missing_titles_are_refused(self):
        self.assertEqual(self.post(start_time="soon").status_code, 400)
        self.assertEqual(self.client.post("/calendar/events", {"title": " "}, format="json").status_code, 400)
        self.assertFalse(CalendarEvent.objects.exists())

    def test_a_good_event_saves_and_an_edit_cannot_make_it_backwards(self):
        res = self.post(start_time="2026-11-18T14:00:00", end_time="2026-11-18T15:00:00")
        self.assertEqual(res.status_code, 201, res.content)
        event_id = res.json()["id"]
        bad = self.client.put(f"/calendar/events/{event_id}", {"end_time": "2026-11-18T13:00:00"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.put(f"/calendar/events/{event_id}", {"title": "Moved", "end_time": "2026-11-18T16:00:00"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
