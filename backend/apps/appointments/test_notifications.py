from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Notification


class AppointmentNotifications(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", first_name="Tina",
                                                last_name="Teacher", approval_status="APPROVED")
        self.student = User.objects.create_user(email="s@x.com", password="x", role="STUDENT", first_name="Sam", last_name="Student")

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_the_teacher_hears_of_a_request_and_the_student_of_the_answer(self):
        res = self.api(self.student).post("/appointments/", {
            "teacher_name": "Tina Teacher", "agenda": "Help with trees", "time_slot": "2026-11-12 11:30",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        mine = Notification.objects.get(user=self.teacher)
        self.assertIn("Sam Student asked for an appointment", mine.title)
        self.assertFalse(Notification.objects.filter(user=self.student).exists())

        appt = res.json()["id"]
        self.api(self.teacher).patch(f"/appointments/{appt}/status", {"status": "rejected", "rejection_reason": "On leave"}, format="json")
        told = Notification.objects.get(user=self.student)
        self.assertIn("declined your appointment", told.title)
        self.assertIn("On leave", told.body)

    def test_saving_the_same_status_again_does_not_repeat_the_notification(self):
        appt = self.api(self.student).post("/appointments/", {"teacher_name": "Tina Teacher"}, format="json").json()["id"]
        for _ in range(2):
            self.api(self.teacher).patch(f"/appointments/{appt}/status", {"status": "approved"}, format="json")
        self.assertEqual(Notification.objects.filter(user=self.student).count(), 1)
