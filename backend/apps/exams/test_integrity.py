from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.classrooms.models import Classroom, Enrollment
from .models import Exam, ExamAttempt

User = get_user_model()


def question(text, points=1, correct=0, choices=("A", "B", "C")):
    return {
        "question_text": text,
        "points": points,
        "choices": [{"choice_text": c, "is_correct": i == correct} for i, c in enumerate(choices)],
    }


class ExamBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        self.teacher = User.objects.create_user(email="t@x.com", role="TEACHER", first_name="Tess", last_name="Teach", department=department)
        self.student = User.objects.create_user(email="s@x.com", role="STUDENT", first_name="Sam", last_name="Stu", register_no="R1")
        self.other = User.objects.create_user(email="o@x.com", role="STUDENT", register_no="R2")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        Enrollment.objects.create(classroom=self.course, student=self.student)

    def create_exam(self, **overrides):
        self.client.force_authenticate(self.teacher)
        body = {"course_id": self.course.pk, "title": "Quiz", "time_limit": 30, "status": "published",
                "questions": [question("Q1", 1, 0), question("Q2", 3, 1)]}
        body.update(overrides)
        response = self.client.post(reverse("exam-list-create"), body, format="json")
        return response

    def exam(self, **overrides):
        response = self.create_exam(**overrides)
        self.assertEqual(response.status_code, 201, response.content)
        return Exam.objects.get(pk=response.json()["id"])

    def start(self, exam, user=None):
        self.client.force_authenticate(user or self.student)
        return self.client.post(reverse("exam-attempt-start", args=[exam.pk]))

    def submit(self, exam, attempt_id, answers, user=None):
        self.client.force_authenticate(user or self.student)
        return self.client.post(reverse("exam-attempt-submit", args=[exam.pk, attempt_id]), {"answers": answers}, format="json")


class ScoringTests(ExamBase):
    def setUp(self):
        super().setUp()
        self.exam_obj = self.exam()
        self.q1, self.q2 = self.exam_obj.questions.all()
        self.right = {q.pk: next(c.pk for c in q.choices.all() if c.is_correct) for q in (self.q1, self.q2)}
        self.wrong = {q.pk: next(c.pk for c in q.choices.all() if not c.is_correct) for q in (self.q1, self.q2)}

    def run_attempt(self, answers):
        attempt_id = self.start(self.exam_obj).json()["id"]
        return self.submit(self.exam_obj, attempt_id, answers)

    def test_a_blank_paper_scores_zero_not_one_hundred(self):
        response = self.run_attempt([])
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["score"], response.json()["earned_points"], response.json()["total_points"]), (0.0, 0.0, 4.0))

    def test_unanswered_questions_count_against_the_score(self):
        response = self.run_attempt([{"question_id": self.q2.pk, "selected_choice_id": self.right[self.q2.pk]}])
        self.assertEqual(response.json()["score"], 75.0)  # 3 of 4 points

    def test_full_marks_and_wrong_answers(self):
        self.assertEqual(self.run_attempt([{"question_id": q.pk, "selected_choice_id": self.right[q.pk]} for q in (self.q1, self.q2)]).json()["score"], 100.0)

    def test_a_choice_from_another_question_is_rejected_and_nothing_is_saved(self):
        response = self.run_attempt([{"question_id": self.q1.pk, "selected_choice_id": self.right[self.q2.pk]}])
        self.assertEqual(response.status_code, 400)
        attempt = ExamAttempt.objects.get()
        self.assertEqual((attempt.status, attempt.answers.count()), ("in_progress", 0))

    def test_an_answer_for_a_question_outside_the_exam_is_rejected(self):
        self.assertEqual(self.run_attempt([{"question_id": 999999, "selected_choice_id": 1}]).status_code, 400)

    def test_score_is_stored_on_the_students_record(self):
        from apps.core.models import StudentActivity
        self.run_attempt([{"question_id": self.q1.pk, "selected_choice_id": self.right[self.q1.pk]}])
        self.assertEqual(StudentActivity.objects.get(activity_type="exam").score, 25.0)


class TimeLimitTests(ExamBase):
    def setUp(self):
        super().setUp()
        self.exam_obj = self.exam(time_limit=10)

    def test_the_server_sets_the_deadline_and_reports_the_time_left(self):
        body = self.start(self.exam_obj).json()
        self.assertTrue(595 <= body["remaining_seconds"] <= 600)
        self.assertIsNotNone(body["expires_at"])

    def test_restarting_resumes_the_same_attempt_with_the_remaining_time(self):
        first = self.start(self.exam_obj).json()
        again = self.start(self.exam_obj)
        self.assertEqual((again.status_code, again.json()["id"]), (200, first["id"]))
        self.assertEqual(ExamAttempt.objects.count(), 1)

    def test_a_submission_long_after_the_deadline_is_closed_with_no_score(self):
        attempt = ExamAttempt.objects.get(pk=self.start(self.exam_obj).json()["id"])
        ExamAttempt.objects.filter(pk=attempt.pk).update(expires_at=timezone.now() - timedelta(minutes=5))
        q = self.exam_obj.questions.first()
        response = self.submit(self.exam_obj, attempt.pk, [{"question_id": q.pk, "selected_choice_id": q.choices.first().pk}])
        self.assertEqual(response.status_code, 409)
        attempt.refresh_from_db()
        self.assertEqual((attempt.status, attempt.score), ("expired", 0.0))

    def test_a_submission_just_after_the_deadline_is_still_accepted(self):
        attempt = ExamAttempt.objects.get(pk=self.start(self.exam_obj).json()["id"])
        ExamAttempt.objects.filter(pk=attempt.pk).update(expires_at=timezone.now() - timedelta(seconds=5))
        self.assertEqual(self.submit(self.exam_obj, attempt.pk, []).status_code, 200)

    def test_an_abandoned_overdue_attempt_uses_up_an_attempt_and_a_new_one_can_start(self):
        Exam.objects.filter(pk=self.exam_obj.pk).update(attempts_allowed=2)
        first = self.start(self.exam_obj).json()["id"]
        ExamAttempt.objects.filter(pk=first).update(expires_at=timezone.now() - timedelta(hours=1))
        second = self.start(self.exam_obj)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(second.json()["id"], first)
        self.assertEqual(ExamAttempt.objects.get(pk=first).status, "expired")
        self.assertEqual(self.submit(self.exam_obj, second.json()["id"], []).status_code, 200)
        self.assertEqual(self.start(self.exam_obj).status_code, 403)  # both attempts used


class ValidationTests(ExamBase):
    def test_bad_numbers_are_refused(self):
        for overrides in ({"time_limit": "abc"}, {"time_limit": 0}, {"time_limit": 100000}, {"attempts_allowed": -1}, {"attempts_allowed": 2.5}):
            self.assertEqual(self.create_exam(**overrides).status_code, 400, overrides)
        self.assertEqual(Exam.objects.count(), 0)

    def test_bad_questions_are_refused_and_nothing_is_created(self):
        bad = [
            [question("", 1)],
            [question("Q", 0)],
            [question("Q", -2)],
            [{"question_text": "Q", "points": 1, "choices": [{"choice_text": "A", "is_correct": True}]}],
            [question("Q", 1, correct=0, choices=("A", "B")) | {"choices": [{"choice_text": "A"}, {"choice_text": "B"}]}],
            [question("Q", 1) | {"choices": [{"choice_text": "A", "is_correct": True}, {"choice_text": "B", "is_correct": True}]}],
        ]
        for questions in bad:
            self.assertEqual(self.create_exam(questions=questions).status_code, 400, questions)
        self.assertEqual(Exam.objects.count(), 0)

    def test_an_unknown_status_is_refused(self):
        self.assertEqual(self.create_exam(status="live").status_code, 400)

    def test_an_exam_without_questions_cannot_be_published_but_can_be_a_draft(self):
        self.assertEqual(self.create_exam(questions=[]).status_code, 400)
        self.assertEqual(self.create_exam(questions=[], status="draft").status_code, 201)

    def test_a_student_cannot_start_an_exam_with_no_questions(self):
        draft = self.exam(questions=[], status="draft")
        Exam.objects.filter(pk=draft.pk).update(status="published")
        self.assertEqual(self.start(draft).status_code, 409)


class EditingTests(ExamBase):
    def test_questions_are_locked_once_a_student_has_attempted_the_exam(self):
        exam = self.exam()
        self.start(exam)
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-detail", args=[exam.pk])
        response = self.client.put(url, {"questions": [question("New", 1)]}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(exam.questions.count(), 2)
        # Settings that do not change the questions can still be edited.
        self.assertEqual(self.client.put(url, {"title": "Renamed"}, format="json").status_code, 200)

    def test_questions_can_be_replaced_before_any_attempt(self):
        exam = self.exam()
        self.client.force_authenticate(self.teacher)
        response = self.client.put(reverse("exam-detail", args=[exam.pk]), {"questions": [question("Only", 2)]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([q.question_text for q in exam.questions.all()], ["Only"])

    def test_publishing_with_patch_leaves_the_questions_alone_even_after_attempts(self):
        exam = self.exam(status="draft")
        Exam.objects.filter(pk=exam.pk).update(status="published")
        self.start(exam)
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-detail", args=[exam.pk])
        self.assertEqual(self.client.patch(url, {"status": "closed"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "nonsense"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"title": "x"}, format="json").status_code, 400)
        exam.refresh_from_db()
        self.assertEqual((exam.status, exam.questions.count()), ("closed", 2))

    def test_students_cannot_patch(self):
        exam = self.exam()
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.patch(reverse("exam-detail", args=[exam.pk]), {"status": "draft"}, format="json").status_code, 403)


class ReviewTests(ExamBase):
    def setUp(self):
        super().setUp()
        self.exam_obj = self.exam(randomize_questions=True)
        self.attempt_id = self.start(self.exam_obj).json()["id"]
        self.url = reverse("exam-attempt-detail", args=[self.exam_obj.pk, self.attempt_id])

    def test_no_answer_key_while_the_student_is_still_sitting_the_exam(self):
        self.client.force_authenticate(self.student)
        body = self.client.get(self.url).json()
        self.assertIsNone(body["exam"])

    def test_after_submitting_the_student_can_review_with_the_answer_key(self):
        q = self.exam_obj.questions.first()
        self.submit(self.exam_obj, self.attempt_id, [{"question_id": q.pk, "selected_choice_id": q.choices.first().pk}])
        self.client.force_authenticate(self.student)
        body = self.client.get(self.url).json()
        self.assertEqual(len(body["exam"]["questions"]), 2)
        self.assertTrue(any(c["is_correct"] for c in body["exam"]["questions"][0]["choices"]))
        self.assertEqual(body["student_name"], "Sam Stu")

    def test_another_student_cannot_read_it_and_the_teacher_can(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(self.teacher)
        body = self.client.get(self.url).json()
        self.assertEqual(len(body["exam"]["questions"]), 2)

    def test_the_teachers_attempt_list_names_the_students(self):
        self.client.force_authenticate(self.teacher)
        rows = self.client.get(reverse("exam-attempts-list", args=[self.exam_obj.pk])).json()
        self.assertEqual((rows[0]["student_name"], rows[0]["student_email"]), ("Sam Stu", "s@x.com"))

    def test_randomised_order_is_stable_for_the_same_student_and_hides_the_key(self):
        self.client.force_authenticate(self.student)
        url = reverse("exam-detail", args=[self.exam_obj.pk])
        first, second = self.client.get(url).json(), self.client.get(url).json()
        self.assertEqual([q["id"] for q in first["questions"]], [q["id"] for q in second["questions"]])
        self.assertNotIn("is_correct", first["questions"][0]["choices"][0])
