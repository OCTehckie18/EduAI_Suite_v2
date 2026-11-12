"""Security regression: an appointment belongs to a teacher account, not to a name anyone can type."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Appointment

User = get_user_model()


class AppointmentOwnershipTests(APITestCase):
    def setUp(self):
        self.ann = User.objects.create_user(email="ann@example.com", password="pw", role="TEACHER", approval_status="APPROVED", first_name="Ann", last_name="Lee")
        self.joanna = User.objects.create_user(email="jo@example.com", password="pw", role="TEACHER", approval_status="APPROVED", first_name="Joanna", last_name="Smith")
        self.student = User.objects.create_user(email="s@example.com", password="pw", role="STUDENT", first_name="Sam", last_name="Student")
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/v1/appointments/", {"teacher_name": "Ann Lee", "agenda": "Private agenda", "time_slot": "2026-12-01 10:00"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.appointment = Appointment.objects.get()

    def test_booking_records_the_teacher_account(self):
        self.assertEqual(self.appointment.teacher_id, self.ann.pk)

    def test_a_teacher_renamed_to_match_cannot_read_or_decide_it(self):
        self.client.force_authenticate(self.joanna)
        self.assertEqual(self.client.patch("/api/v1/auth/me/", {"first_name": "Ann", "last_name": "Lee"}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/appointments/").json(), [])
        self.assertEqual(self.client.get("/api/v1/appointments/teacher/Ann%20Lee").json(), [])
        response = self.client.patch(f"/api/v1/appointments/{self.appointment.pk}/status", {"status": "rejected", "rejection_reason": "x"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, "pending")

    def test_the_real_teacher_still_sees_and_decides_it(self):
        self.client.force_authenticate(self.ann)
        self.assertEqual(len(self.client.get("/api/v1/appointments/").json()), 1)
        self.assertEqual(self.client.patch(f"/api/v1/appointments/{self.appointment.pk}/status", {"status": "approved"}, format="json").status_code, 200)

    def test_a_renamed_teacher_does_not_see_the_victims_calendar_entries(self):
        self.appointment.status, self.appointment.time_slot = "approved", "2030-03-03 09:00"
        self.appointment.save()
        self.client.force_authenticate(self.joanna)
        self.client.patch("/api/v1/auth/me/", {"first_name": "Ann", "last_name": "Lee"}, format="json")
        titles = {e["title"] for e in self.client.get("/api/v1/calendar/events").json()} if self.client.get("/api/v1/calendar/events").status_code == 200 else set()
        self.assertFalse(any("Private agenda" in t for t in titles))
