from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from .models import Exam, exam_availability
from .test_integrity import ExamBase


def iso(delta):
    return (timezone.now() + delta).isoformat()


class ExamWindowTests(ExamBase):
    def test_an_exam_without_dates_is_always_open(self):
        exam = self.exam()
        self.assertEqual(exam_availability(exam), "open")
        self.assertEqual(self.start(exam).status_code, 201)

    def test_students_cannot_start_before_it_opens_or_after_it_closes(self):
        soon = self.exam(opens_at=iso(timedelta(days=1)), closes_at=iso(timedelta(days=2)))
        res = self.start(soon)
        self.assertEqual(res.status_code, 409)
        self.assertIn("opens on", res.json()["detail"])
        gone = self.exam(opens_at=iso(timedelta(days=-2)), closes_at=iso(timedelta(days=-1)))
        res = self.start(gone)
        self.assertEqual((res.status_code, res.json()["detail"]), (409, "This exam has closed."))
        self.assertEqual(self.student.exam_attempts.count() if hasattr(self.student, "exam_attempts") else 0, 0)

    def test_a_late_starter_only_gets_the_time_left_in_the_window(self):
        exam = self.exam(time_limit=60, closes_at=iso(timedelta(minutes=10)))
        attempt = self.start(exam).json()
        left = (timezone.datetime.fromisoformat(attempt["expires_at"].replace("Z", "+00:00")) - timezone.now()).total_seconds()
        self.assertLess(left, 11 * 60)

    def test_the_window_is_validated(self):
        for body in (
            {"opens_at": "not a date"},
            {"closes_at": 5},
            {"opens_at": iso(timedelta(days=2)), "closes_at": iso(timedelta(days=1))},
        ):
            self.assertEqual(self.create_exam(**body).status_code, 400, body)
        self.assertEqual(Exam.objects.count(), 0)

    def test_dates_can_be_set_and_cleared_on_edit(self):
        exam = self.exam()
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-detail", args=[exam.pk])
        res = self.client.put(url, {"opens_at": iso(timedelta(days=1))}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["availability"], "upcoming")
        res = self.client.put(url, {"opens_at": None}, format="json")
        self.assertEqual((res.status_code, res.json()["availability"]), (200, "open"))
