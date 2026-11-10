import json
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from apps.analytics import risk as risk_module
from apps.core.models import Notification, StudentActivity

from .models import AttemptQuestion, ExamAnswer, ExamAttempt, ExamReset
from .test_paper import PaperBase, pool_of_mcqs
from .test_question_types import long_answer


class ResetBase(PaperBase):
    def flagged_attempt(self, exam, student):
        response = self.start(student, exam)
        self.client.post(reverse("exam-attempt-violation", args=[exam.pk, response.json()["id"]]), {"type": "tab_hidden"}, format="json")
        return ExamAttempt.objects.get(pk=response.json()["id"]), self.paper_ids(response)

    def reset(self, user, exam, attempt, **body):
        self.client.force_authenticate(user)
        return self.client.post(reverse("exam-attempt-reset", args=[exam.pk, attempt.pk]), {"reason": "Power cut", **body}, format="json")


class ResetTests(ResetBase):
    def test_a_reset_clears_the_block_on_a_flagged_student_and_removes_the_zero(self):
        exam = self.make_exam(pool_of_mcqs(4), attempts_allowed=1)
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        self.assertEqual(self.start(student, exam).status_code, 403)  # flagged: cannot retake
        self.assertTrue(StudentActivity.objects.filter(student_id=student.pk, source_id=str(attempt.pk)).exists())
        response = self.reset(self.teacher, exam, attempt)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(ExamAttempt.objects.filter(pk=attempt.pk).exists())
        self.assertFalse(AttemptQuestion.objects.filter(attempt_id=attempt.pk).exists())
        self.assertFalse(StudentActivity.objects.filter(student_id=student.pk, source_id=str(attempt.pk)).exists())
        again = self.start(student, exam)
        self.assertEqual(again.status_code, 201, again.content)
        self.assertTrue(Notification.objects.filter(user=student, title__contains="reset").exists())

    def test_the_snapshot_keeps_what_the_attempt_held(self):
        exam = self.make_exam([long_answer(points=6), *pool_of_mcqs(2)], randomize_questions=False)
        student = self.student_number(1)
        response, attempt = self.sit_as(student, exam, {0: {"text_answer": "My long answer"}})
        self.assertEqual(attempt.status, "pending_review")
        done = self.reset(self.teacher, exam, attempt, reason="Browser crashed while submitting")
        self.assertEqual(done.status_code, 201)
        saved = ExamReset.objects.get()
        self.assertEqual((saved.student_id, saved.reset_by_id, saved.reason), (student.pk, self.teacher.pk, "Browser crashed while submitting"))
        self.assertEqual((saved.snapshot["status"], saved.snapshot["total_points"]), ("pending_review", 8.0))
        self.assertEqual(len(saved.snapshot["question_ids"]), 3)
        self.assertIn("My long answer", [a["text_answer"] for a in saved.snapshot["answers"]])
        self.assertEqual(ExamAnswer.objects.filter(attempt_id=attempt.pk).count(), 0)

    def sit_as(self, student, exam, answers):
        self.client.force_authenticate(student)
        started = self.client.post(reverse("exam-attempt-start", args=[exam.pk])).json()
        order = {q["id"]: q for q in started["paper"]}
        questions = list(exam.questions.order_by("order", "id"))
        payload = [{"question_id": questions[i].pk, **fields} for i, fields in answers.items()]
        response = self.client.post(reverse("exam-attempt-submit", args=[exam.pk, started["id"]]), {"answers": payload}, format="json")
        return response, ExamAttempt.objects.get(pk=started["id"])

    def test_the_new_attempt_avoids_the_questions_seen_before_when_the_pool_allows(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 4}], pool_of_mcqs(8))
        student = self.student_number(1)
        attempt, first = self.flagged_attempt(exam, student)
        self.reset(self.teacher, exam, attempt)
        second = self.paper_ids(self.start(student, exam))
        self.assertFalse(set(first) & set(second))

    def test_when_the_pool_runs_short_it_falls_back_to_the_least_seen(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 4}], pool_of_mcqs(5))
        student = self.student_number(1)
        attempt, first = self.flagged_attempt(exam, student)
        self.reset(self.teacher, exam, attempt)
        second = self.start(student, exam)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(len(self.paper_ids(second)), 4)
        self.assertEqual(len(set(self.paper_ids(second)) - set(first)), 1)  # the single unseen question comes first

    def test_a_reset_after_the_window_closed_works_only_with_a_personal_deadline(self):
        exam = self.make_exam(pool_of_mcqs(3), closes_at=(timezone.now() + timedelta(hours=1)).isoformat())
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        exam.closes_at = timezone.now() - timedelta(minutes=5)
        exam.save()
        self.reset(self.teacher, exam, attempt)
        closed = self.start(student, exam)
        self.assertEqual((closed.status_code, closed.json()["detail"]), (409, "This exam has closed."))
        self.assertFalse(ExamAttempt.objects.filter(exam=exam, student_id=student.pk).exists())

    def test_a_personal_deadline_lets_the_student_in_and_caps_their_time(self):
        exam = self.make_exam(pool_of_mcqs(3), closes_at=(timezone.now() + timedelta(hours=1)).isoformat(), time_limit=120)
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        exam.closes_at = timezone.now() - timedelta(minutes=5)
        exam.save()
        until = timezone.now() + timedelta(minutes=30)
        response = self.reset(self.teacher, exam, attempt, allowed_until=until.isoformat())
        self.assertEqual(response.status_code, 201, response.content)
        self.client.force_authenticate(student)
        listing = self.client.get(reverse("exam-list-create")).json()[0]
        self.assertEqual((listing["availability"], listing["my_reset"] is not None), ("open", True))
        started = self.start(student, exam)
        self.assertEqual(started.status_code, 201, started.content)
        self.assertLessEqual(started.json()["remaining_seconds"], 30 * 60)

    def test_an_expired_personal_deadline_no_longer_opens_the_exam(self):
        exam = self.make_exam(pool_of_mcqs(3), closes_at=(timezone.now() + timedelta(hours=1)).isoformat())
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        exam.closes_at = timezone.now() - timedelta(minutes=5)
        exam.save()
        self.reset(self.teacher, exam, attempt, allowed_until=(timezone.now() + timedelta(minutes=1)).isoformat())
        ExamReset.objects.update(allowed_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.start(student, exam).status_code, 409)


class ResetRulesTests(ResetBase):
    def test_only_the_class_teacher_or_an_admin_can_reset(self):
        exam = self.make_exam(pool_of_mcqs(3))
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        for user in (student, self.other_teacher):
            self.assertEqual(self.reset(user, exam, attempt).status_code, 403)
        self.assertTrue(ExamAttempt.objects.filter(pk=attempt.pk).exists())

    def test_a_reason_is_required_and_the_deadline_must_be_valid(self):
        exam = self.make_exam(pool_of_mcqs(3))
        attempt, _ = self.flagged_attempt(exam, self.student_number(1))
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-attempt-reset", args=[exam.pk, attempt.pk])
        for body in ({}, {"reason": "   "}, {"reason": "x" * 501}, {"reason": "ok", "allowed_until": "tomorrow"}, {"reason": "ok", "allowed_until": (timezone.now() - timedelta(hours=1)).isoformat()}):
            self.assertEqual(self.client.post(url, body, format="json").status_code, 400, body)
        self.assertTrue(ExamAttempt.objects.filter(pk=attempt.pk).exists())

    def test_an_attempt_still_in_progress_cannot_be_reset(self):
        exam = self.make_exam(pool_of_mcqs(3))
        student = self.student_number(1)
        started = self.start(student, exam).json()
        self.client.force_authenticate(self.teacher)
        response = self.client.post(reverse("exam-attempt-reset", args=[exam.pk, started["id"]]), {"reason": "x"}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_the_history_lists_resets_for_the_teacher_only(self):
        exam = self.make_exam(pool_of_mcqs(3))
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        self.reset(self.teacher, exam, attempt, reason="Crash")
        self.client.force_authenticate(self.teacher)
        history = self.client.get(reverse("exam-resets", args=[exam.pk])).json()
        self.assertEqual((len(history), history[0]["reason"], history[0]["student_email"], history[0]["previous"]["status"]), (1, "Crash", student.email, "flagged"))
        for user in (student, self.other_teacher):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(reverse("exam-resets", args=[exam.pk])).status_code, 403)

    def test_risk_drops_the_old_flag_and_notes_that_one_was_cleared(self):
        exam = self.make_exam(pool_of_mcqs(3))
        student = self.student_number(1)
        attempt, _ = self.flagged_attempt(exam, student)
        before = risk_module.analyse([self.classroom])[student.pk]
        self.assertEqual((len(before.flags), before.cleared), (1, 0))
        self.reset(self.teacher, exam, attempt)
        after = risk_module.analyse([self.classroom])[student.pk]
        self.assertEqual((len(after.flags), after.cleared), (0, 1))

    def test_a_students_exam_card_shows_the_reset_and_it_is_not_visible_to_others(self):
        exam = self.make_exam(pool_of_mcqs(3))
        student, other = self.student_number(1), self.student_number(2)
        attempt, _ = self.flagged_attempt(exam, student)
        self.reset(self.teacher, exam, attempt)
        self.client.force_authenticate(student)
        self.assertIsNotNone(self.client.get(reverse("exam-list-create")).json()[0]["my_reset"])
        self.client.force_authenticate(other)
        self.assertIsNone(self.client.get(reverse("exam-list-create")).json()[0]["my_reset"])
        self.assertNotIn("Power cut", json.dumps(self.client.get(reverse("exam-list-create")).json()))
