from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from .test_integrity import ExamBase


def iso(delta):
    return (timezone.now() + delta).isoformat()


class ExamVisibilityTests(ExamBase):
    def test_a_student_gets_no_questions_before_the_exam_opens(self):
        exam = self.exam(opens_at=iso(timedelta(days=1)))
        self.client.force_authenticate(self.student)
        body = self.client.get(reverse("exam-detail", args=[exam.pk])).json()
        self.assertEqual(body["questions"], [])
        listed = next(e for e in self.client.get(reverse("exam-list-create")).json() if e["id"] == exam.pk)
        self.assertEqual(listed["questions"], [])
        self.client.force_authenticate(self.teacher)
        self.assertTrue(self.client.get(reverse("exam-detail", args=[exam.pk])).json()["questions"])

    def _finished(self, **overrides):
        exam = self.exam(**overrides)
        attempt = self.start(exam).json()
        self.submit(exam, attempt["id"], [])
        self.client.force_authenticate(self.student)
        return exam, attempt["id"]

    def _keys(self, exam, attempt_id):
        body = self.client.get(reverse("exam-attempt-detail", args=[exam.pk, attempt_id])).json()
        return [c for q in body["exam"]["questions"] for c in q["choices"]]

    def test_the_answer_key_is_withheld_while_a_retake_remains(self):
        exam, attempt_id = self._finished(attempts_allowed=2)
        choices = self._keys(exam, attempt_id)
        self.assertTrue(choices)
        self.assertTrue(all("is_correct" not in c for c in choices))

    def test_the_answer_key_shows_once_no_retake_is_left(self):
        exam, attempt_id = self._finished(attempts_allowed=1)
        self.assertTrue(any("is_correct" in c for c in self._keys(exam, attempt_id)))
