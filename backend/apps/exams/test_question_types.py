import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import Notification, StudentActivity
from apps.institution.models import Batch, Campus, Department, Program, School

from .grading import fill_blank_is_correct
from .models import Exam, ExamAnswer, ExamAttempt, ExamQuestion

User = get_user_model()


def mcq(text="2+2?", points=1, correct=1):
    return {"question_type": "mcq", "question_text": text, "points": points,
            "choices": [{"choice_text": "3", "is_correct": correct == 0}, {"choice_text": "4", "is_correct": correct == 1}]}


def blank(text="The capital of France is ___.", accepted=None, points=2):
    return {"question_type": "fill_blank", "question_text": text, "points": points, "accepted_answers": accepted or [["Paris"]]}


def long_answer(text="Explain photosynthesis.", points=6, **extra):
    return {"question_type": "long_answer", "question_text": text, "points": points, "answer_guide": "Light and dark reactions.", "word_limit": 100, **extra}


class QuestionTypeBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        campus = Campus.objects.create(name="Central", code="C", city="Bengaluru")
        school = School.objects.create(name="Sci", code="S", campus=campus)
        department = Department.objects.create(name="CS", code="CS", school=school)
        program = Program.objects.create(name="BCA", code="BCA", department=department, degree_level="UG", duration_years=3)
        batch = Batch.objects.create(name="2025", program=program, start_year=2025, end_year=2028, academic_year="2025-26")
        cls.teacher = User.objects.create_user(email="t@example.com", password="x", role=User.Role.TEACHER)
        cls.other_teacher = User.objects.create_user(email="t2@example.com", password="x", role=User.Role.TEACHER)
        cls.student = User.objects.create_user(email="s@example.com", password="x", role=User.Role.STUDENT, register_no="R1")
        cls.classroom = Classroom.objects.create(name="Maths", subject_code="M1", teacher=cls.teacher, department=department, program=program, batch=batch)
        Enrollment.objects.create(classroom=cls.classroom, student=cls.student)

    def make_exam(self, questions, **extra):
        self.client.force_authenticate(self.teacher)
        body = {"course_id": self.classroom.pk, "title": "Mixed", "status": "published", "questions": questions, **extra}
        response = self.client.post(reverse("exam-list-create"), body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return Exam.objects.get(pk=response.json()["id"])

    def sit(self, exam, answers):
        """The student starts and submits; answers maps the question's order to a dict of answer fields."""
        self.client.force_authenticate(self.student)
        attempt = self.client.post(reverse("exam-attempt-start", args=[exam.pk])).json()
        questions = list(exam.questions.order_by("order", "id"))
        payload = [{"question_id": questions[i].pk, **fields} for i, fields in answers.items()]
        response = self.client.post(reverse("exam-attempt-submit", args=[exam.pk, attempt["id"]]), {"answers": payload}, format="json")
        return response, ExamAttempt.objects.get(pk=attempt["id"])

    def right_choice(self, exam, index):
        return list(exam.questions.order_by("order", "id"))[index].choices.get(is_correct=True).pk


class CreatingQuestionsTests(QuestionTypeBase):
    def post(self, questions):
        self.client.force_authenticate(self.teacher)
        return self.client.post(reverse("exam-list-create"), {"course_id": self.classroom.pk, "title": "T", "questions": questions}, format="json")

    def test_all_three_types_are_saved_with_their_fields(self):
        exam = self.make_exam([mcq(), blank(accepted=[["Paris", "paris, france"]]), long_answer()])
        kinds = [(q.question_type, q.accepted_answers, q.word_limit) for q in exam.questions.order_by("order", "id")]
        self.assertEqual(kinds[0][0], "mcq")
        self.assertEqual(kinds[1], ("fill_blank", [["Paris", "paris, france"]], None))
        self.assertEqual(kinds[2][0::2], ("long_answer", 100))

    def test_each_type_is_validated(self):
        self.assertIn("exactly one correct", self.post([{**mcq(), "choices": [{"choice_text": "a"}, {"choice_text": "b"}]}]).json()["detail"])
        self.assertIn("write ___", self.post([blank(text="No gap here")]).json()["detail"])
        self.assertIn("accepted answers", self.post([{**blank(), "accepted_answers": []}]).json()["detail"])
        self.assertIn("2 blanks", self.post([blank(text="___ and ___", accepted=[["a"]])]).json()["detail"])
        self.assertIn("cannot have choices", self.post([{**blank(), "choices": [{"choice_text": "x"}]}]).json()["detail"])
        self.assertIn("cannot have choices", self.post([{**long_answer(), "choices": [{"choice_text": "x"}]}]).json()["detail"])
        self.assertIn("word limit", self.post([long_answer(word_limit=0)]).json()["detail"])
        self.assertIn("question type", self.post([{**mcq(), "question_type": "essay"}]).json()["detail"])

    def test_a_question_without_a_type_is_multiple_choice_as_before(self):
        plain = {"question_text": "2+2?", "points": 1, "choices": mcq()["choices"]}
        self.assertEqual(self.post([plain]).status_code, 201)

    def test_students_never_receive_accepted_answers_or_the_answer_guide(self):
        exam = self.make_exam([blank(), long_answer()])
        self.client.force_authenticate(self.student)
        for response in (self.client.get(reverse("exam-detail", args=[exam.pk])), self.client.get(reverse("exam-list-create"))):
            text = json.dumps(response.json())
            self.assertNotIn("accepted_answers", text)
            self.assertNotIn("answer_guide", text)
            self.assertNotIn("Light and dark", text)
        self.client.force_authenticate(self.teacher)
        self.assertIn("accepted_answers", json.dumps(self.client.get(reverse("exam-detail", args=[exam.pk])).json()))


class FillInTheBlanksTests(QuestionTypeBase):
    def test_matching_ignores_case_spaces_and_a_trailing_full_stop(self):
        self.assertTrue(fill_blank_is_correct([["Paris"]], "  paris. "))
        self.assertTrue(fill_blank_is_correct([["New  York"]], "new york"))
        self.assertFalse(fill_blank_is_correct([["Paris"]], "Lyon"))
        self.assertFalse(fill_blank_is_correct([["Paris"]], ""))

    def test_any_accepted_answer_matches_and_all_blanks_must_be_right(self):
        accepted = [["100", "one hundred"], ["0", "zero"]]
        self.assertTrue(fill_blank_is_correct(accepted, "One Hundred\nZERO"))
        self.assertFalse(fill_blank_is_correct(accepted, "100\n5"))
        self.assertFalse(fill_blank_is_correct(accepted, "100"))

    def test_submitting_scores_blanks_and_mcq_together(self):
        exam = self.make_exam([mcq(points=1), blank(points=2), blank(text="___ boils at ___.", accepted=[["water"], ["100"]], points=3)])
        response, attempt = self.sit(exam, {0: {"selected_choice_id": self.right_choice(exam, 0)}, 1: {"text_answer": " PARIS "}, 2: {"text_answers": ["water", "99"]}})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual((attempt.status, attempt.earned_points, attempt.total_points, attempt.score), ("submitted", 3.0, 6.0, 50.0))
        marks = {a.question.order: a.awarded_points for a in attempt.answers.select_related("question")}
        self.assertEqual(sorted(marks.values()), [0.0, 1.0, 2.0])


class LongAnswerTests(QuestionTypeBase):
    def mark_url(self, exam, attempt, name="exam-attempt-mark"):
        return reverse(name, args=[exam.pk, attempt.pk])

    def pending(self):
        exam = self.make_exam([mcq(points=1), long_answer(points=6)])
        response, attempt = self.sit(exam, {0: {"selected_choice_id": self.right_choice(exam, 0)}, 1: {"text_answer": "Plants turn light into sugar."}})
        self.assertEqual(response.status_code, 200, response.content)
        return exam, attempt

    def long_question(self, exam):
        return exam.questions.get(question_type="long_answer")

    def test_a_written_answer_waits_for_the_teacher_with_no_score(self):
        exam, attempt = self.pending()
        self.assertEqual((attempt.status, attempt.score, attempt.earned_points, attempt.total_points), ("pending_review", None, None, 7.0))
        activity = StudentActivity.objects.get(student_id=self.student.pk, source_id=str(attempt.pk))
        self.assertEqual((activity.status, activity.score), ("pending_review", None))

    def test_a_blank_long_answer_scores_zero_and_needs_no_marking(self):
        exam = self.make_exam([mcq(points=1), long_answer(points=6)])
        response, attempt = self.sit(exam, {0: {"selected_choice_id": self.right_choice(exam, 0)}, 1: {"text_answer": "   "}})
        self.assertEqual((attempt.status, attempt.score), ("submitted", round(1 / 7 * 100, 1)))

    def test_marking_finishes_the_attempt_and_updates_the_student_record(self):
        exam, attempt = self.pending()
        self.client.force_authenticate(self.teacher)
        response = self.client.post(self.mark_url(exam, attempt), {"marks": [{"question_id": self.long_question(exam).pk, "awarded_points": 4.5, "feedback": "Good, mention chlorophyll."}]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        attempt.refresh_from_db()
        self.assertEqual((attempt.status, attempt.earned_points, attempt.score), ("submitted", 5.5, round(5.5 / 7 * 100, 1)))
        activity = StudentActivity.objects.get(student_id=self.student.pk, source_id=str(attempt.pk))
        self.assertEqual((activity.status, activity.score), ("submitted", attempt.score))
        self.assertTrue(Notification.objects.filter(user=self.student, title__contains="marked").exists())
        answer = ExamAnswer.objects.get(attempt=attempt, question=self.long_question(exam))
        self.assertEqual((answer.feedback, answer.marked_by_id), ("Good, mention chlorophyll.", self.teacher.pk))

    def test_out_of_range_and_invalid_marks_are_refused(self):
        exam, attempt = self.pending()
        self.client.force_authenticate(self.teacher)
        question = self.long_question(exam)
        for value in (-1, 7, "lots", None, True, float("nan")):
            body = json.dumps({"marks": [{"question_id": question.pk, "awarded_points": value}]})
            response = self.client.post(self.mark_url(exam, attempt), body, content_type="application/json")
            self.assertEqual(response.status_code, 400, value)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "pending_review")

    def test_a_multiple_choice_question_cannot_be_marked_by_hand(self):
        exam, attempt = self.pending()
        self.client.force_authenticate(self.teacher)
        mcq_question = exam.questions.get(question_type="mcq")
        response = self.client.post(self.mark_url(exam, attempt), [{"question_id": mcq_question.pk, "awarded_points": 0}], format="json")
        self.assertEqual(response.status_code, 400)

    def test_students_and_other_teachers_cannot_mark(self):
        exam, attempt = self.pending()
        body = [{"question_id": self.long_question(exam).pk, "awarded_points": 6}]
        for user in (self.student, self.other_teacher):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(self.mark_url(exam, attempt), body, format="json").status_code, 403)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "pending_review")

    def test_only_handed_in_attempts_can_be_marked(self):
        exam = self.make_exam([long_answer()])
        self.client.force_authenticate(self.student)
        started = self.client.post(reverse("exam-attempt-start", args=[exam.pk])).json()
        self.client.force_authenticate(self.teacher)
        body = [{"question_id": self.long_question(exam).pk, "awarded_points": 1}]
        self.assertEqual(self.client.post(reverse("exam-attempt-mark", args=[exam.pk, started["id"]]), body, format="json").status_code, 409)

    def test_the_student_sees_their_text_marks_and_feedback_but_never_the_guide(self):
        exam, attempt = self.pending()
        self.client.force_authenticate(self.teacher)
        self.client.post(self.mark_url(exam, attempt), [{"question_id": self.long_question(exam).pk, "awarded_points": 5, "feedback": "Nice"}], format="json")
        self.client.force_authenticate(self.student)
        body = self.client.get(reverse("exam-attempt-detail", args=[exam.pk, attempt.pk])).json()
        text = json.dumps(body)
        self.assertNotIn("answer_guide", text)
        self.assertNotIn("Light and dark", text)
        written = next(a for a in body["answers"] if a["text_answer"])
        self.assertEqual((written["awarded_points"], written["feedback"]), (5.0, "Nice"))
        self.client.force_authenticate(self.teacher)
        self.assertIn("answer_guide", json.dumps(self.client.get(reverse("exam-attempt-detail", args=[exam.pk, attempt.pk])).json()))

    def test_suggest_mark_returns_a_clamped_suggestion_and_saves_nothing(self):
        exam, attempt = self.pending()
        self.client.force_authenticate(self.teacher)
        client = mock.Mock()
        client.chat.completions.create.return_value.choices = [mock.Mock(message=mock.Mock(content=json.dumps({"points": 99, "feedback": "Solid."})))]
        url = self.mark_url(exam, attempt, "exam-attempt-suggest-mark")
        with mock.patch("apps.exams.marking.GroqService.get_client", return_value=client):
            response = self.client.post(url, {"question_id": self.long_question(exam).pk}, format="json")
        self.assertEqual((response.status_code, response.json()["points"], response.json()["feedback"]), (200, 6.0, "Solid."))
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "pending_review")
        with mock.patch("apps.exams.marking.GroqService.get_client", return_value=None):
            self.assertEqual(self.client.post(url, {"question_id": self.long_question(exam).pk}, format="json").status_code, 503)
        client.chat.completions.create.side_effect = RuntimeError("boom")
        with mock.patch("apps.exams.marking.GroqService.get_client", return_value=client):
            self.assertEqual(self.client.post(url, {"question_id": self.long_question(exam).pk}, format="json").status_code, 502)

    def test_old_all_multiple_choice_attempts_score_exactly_as_before(self):
        exam = self.make_exam([mcq(points=1), mcq(text="3+3?", points=1, correct=0)])
        response, attempt = self.sit(exam, {0: {"selected_choice_id": self.right_choice(exam, 0)}})
        self.assertEqual((attempt.status, attempt.score, attempt.earned_points), ("submitted", 50.0, 1.0))


class ConsumersOfPendingAttemptsTests(QuestionTypeBase):
    def test_stats_count_a_pending_attempt_as_handed_in(self):
        exam = self.make_exam([long_answer()])
        self.sit(exam, {0: {"text_answer": "An answer"}})
        self.client.force_authenticate(self.teacher)
        body = self.client.get(reverse("exam-stats")).json()
        self.assertEqual((body["total_attempts"], body["avg_completion_rate"]), (1, 100.0))

    def test_the_report_and_calendar_say_awaiting_marking(self):
        from apps.calendar_app import feed

        exam = self.make_exam([long_answer()])
        self.sit(exam, {0: {"text_answer": "An answer"}})
        events = feed.build_feed(self.student)
        text = json.dumps(events, default=str)
        self.assertIn("awaiting marking", text)
