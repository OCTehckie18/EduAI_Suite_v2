from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.classrooms.models import Enrollment

from .models import AttemptQuestion, Exam, ExamAnswer, ExamAttempt, ExamQuestion
from .test_question_types import QuestionTypeBase, long_answer, mcq

User = get_user_model()


def pool_of_mcqs(count=8, marks=1):
    return [mcq(text=f"Question {i}?", points=marks) for i in range(count)]


class PaperBase(QuestionTypeBase):
    def student_number(self, n):
        user = User.objects.create_user(email=f"s{n}@example.com", password="x", role=User.Role.STUDENT, register_no=f"RR{n}")
        Enrollment.objects.create(classroom=self.classroom, student=user)
        return user

    def start(self, user, exam):
        self.client.force_authenticate(user)
        return self.client.post(reverse("exam-attempt-start", args=[exam.pk]))

    def paper_ids(self, response):
        return [q["id"] for q in response.json()["paper"]]

    def pattern_exam(self, pattern, questions, **extra):
        return self.make_exam(questions, pattern=pattern, **extra)


class DrawTests(PaperBase):
    def test_the_paper_matches_the_pattern_and_has_the_same_total_for_everyone(self):
        exam = self.pattern_exam(
            [{"type": "mcq", "marks": 1, "count": 4}, {"type": "long_answer", "marks": 6, "count": 1}],
            [*pool_of_mcqs(8), long_answer(points=6), long_answer(text="Describe osmosis.", points=6), long_answer(text="Short one", points=3)],
        )
        totals = set()
        for n in range(1, 5):
            response = self.start(self.student_number(n), exam)
            self.assertEqual(response.status_code, 201, response.content)
            paper = response.json()["paper"]
            kinds = sorted((q["question_type"], q["points"]) for q in paper)
            self.assertEqual(kinds, [("long_answer", 6.0), ("mcq", 1.0), ("mcq", 1.0), ("mcq", 1.0), ("mcq", 1.0)])
            totals.add(sum(q["points"] for q in paper))
        self.assertEqual(totals, {10.0})

    def test_students_get_different_questions_where_the_pool_allows(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(12))
        papers = [tuple(self.paper_ids(self.start(self.student_number(n), exam))) for n in range(1, 6)]
        self.assertGreater(len(set(papers)), 1)
        self.assertGreater(len({q for paper in papers for q in paper}), 3)

    def test_the_same_student_sees_the_same_paper_on_reload(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(9))
        student = self.student_number(1)
        first = self.start(student, exam)
        again = self.start(student, exam)
        self.assertEqual((first.status_code, again.status_code), (201, 200))
        self.assertEqual(self.paper_ids(first), self.paper_ids(again))
        self.assertEqual(AttemptQuestion.objects.filter(attempt_id=first.json()["id"]).count(), 3)

    def test_without_a_pattern_the_paper_is_the_whole_pool(self):
        exam = self.make_exam(pool_of_mcqs(4), randomize_questions=False)
        response = self.start(self.student_number(1), exam)
        self.assertEqual([q["question_text"] for q in response.json()["paper"]], [f"Question {i}?" for i in range(4)])

    def test_shuffling_changes_order_between_students_but_not_the_set(self):
        exam = self.make_exam(pool_of_mcqs(10))
        orders = {tuple(self.paper_ids(self.start(self.student_number(n), exam))) for n in range(1, 5)}
        self.assertGreater(len(orders), 1)
        self.assertEqual(len({frozenset(o) for o in orders}), 1)

    def test_students_cannot_see_the_pool_before_starting(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(6))
        self.client.force_authenticate(self.student)
        for body in (self.client.get(reverse("exam-detail", args=[exam.pk])).json(), self.client.get(reverse("exam-list-create")).json()[0]):
            self.assertEqual((body["questions"], body["question_count"], body["pattern"], body["pool_groups"]), ([], 2, None, None))
        self.client.force_authenticate(self.teacher)
        teacher_view = self.client.get(reverse("exam-detail", args=[exam.pk])).json()
        self.assertEqual((len(teacher_view["questions"]), teacher_view["paper_total"]), (6, 2.0))
        self.assertEqual(teacher_view["pool_groups"], [{"type": "mcq", "marks": 1.0, "in_pool": 6}])

    def test_a_later_attempt_prefers_questions_the_student_has_not_seen(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(6), attempts_allowed=2)
        student = self.student_number(1)
        first = self.start(student, exam)
        self.client.force_authenticate(student)
        self.client.post(reverse("exam-attempt-submit", args=[exam.pk, first.json()["id"]]), {"answers": []}, format="json")
        second = self.start(student, exam)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertFalse(set(self.paper_ids(first)) & set(self.paper_ids(second)))

    def test_the_least_used_questions_are_drawn_first(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(4))
        seen = []
        for n in range(1, 3):
            seen += self.paper_ids(self.start(self.student_number(n), exam))
        self.assertEqual(len(set(seen)), 4)  # two students together used all four questions once


class GradingPaperTests(PaperBase):
    def test_submit_grades_only_the_drawn_questions_with_drawn_marks(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 2, "count": 2}], pool_of_mcqs(5, marks=2))
        student = self.student_number(1)
        response = self.start(student, exam)
        attempt_id = response.json()["id"]
        paper = response.json()["paper"]
        right = {q["id"]: ExamQuestion.objects.get(pk=q["id"]).choices.get(is_correct=True).pk for q in paper}
        answers = [{"question_id": qid, "selected_choice_id": cid} for qid, cid in right.items()]
        self.client.force_authenticate(student)
        done = self.client.post(reverse("exam-attempt-submit", args=[exam.pk, attempt_id]), {"answers": answers}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        attempt = ExamAttempt.objects.get(pk=attempt_id)
        self.assertEqual((attempt.total_points, attempt.earned_points, attempt.score), (4.0, 4.0, 100.0))
        self.assertEqual(ExamAnswer.objects.filter(attempt=attempt).count(), 2)

    def test_an_answer_to_a_question_outside_the_draw_is_refused(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 1}], pool_of_mcqs(5))
        student = self.student_number(1)
        response = self.start(student, exam)
        drawn = self.paper_ids(response)[0]
        outside = exam.questions.exclude(pk=drawn).first()
        self.client.force_authenticate(student)
        bad = self.client.post(reverse("exam-attempt-submit", args=[exam.pk, response.json()["id"]]), {"answers": [{"question_id": outside.pk, "selected_choice_id": outside.choices.first().pk}]}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_the_violation_path_records_the_papers_own_total(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 3, "count": 2}], pool_of_mcqs(5, marks=3))
        student = self.student_number(1)
        response = self.start(student, exam)
        self.client.post(reverse("exam-attempt-violation", args=[exam.pk, response.json()["id"]]), {"type": "tab_hidden"}, format="json")
        self.assertEqual(ExamAttempt.objects.get(pk=response.json()["id"]).total_points, 6.0)

    def test_marking_uses_the_drawn_marks_for_the_ceiling_and_total(self):
        exam = self.pattern_exam([{"type": "long_answer", "marks": 6, "count": 1}], [long_answer(points=6), long_answer(text="Other", points=6), long_answer(text="Short", points=3)])
        student = self.student_number(1)
        response = self.start(student, exam)
        qid = self.paper_ids(response)[0]
        self.client.force_authenticate(student)
        self.client.post(reverse("exam-attempt-submit", args=[exam.pk, response.json()["id"]]), {"answers": [{"question_id": qid, "text_answer": "My answer"}]}, format="json")
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-attempt-mark", args=[exam.pk, response.json()["id"]])
        self.assertEqual(self.client.post(url, [{"question_id": qid, "awarded_points": 7}], format="json").status_code, 400)
        done = self.client.post(url, [{"question_id": qid, "awarded_points": 3}], format="json")
        self.assertEqual((done.status_code, done.json()["score"], done.json()["total_points"]), (200, 50.0, 6.0))

    def test_the_review_shows_the_attempts_own_questions_in_its_order(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(8))
        student = self.student_number(1)
        response = self.start(student, exam)
        self.client.force_authenticate(student)
        self.client.post(reverse("exam-attempt-submit", args=[exam.pk, response.json()["id"]]), {"answers": []}, format="json")
        review = self.client.get(reverse("exam-attempt-detail", args=[exam.pk, response.json()["id"]])).json()
        self.assertEqual([q["id"] for q in review["exam"]["questions"]], self.paper_ids(response))

    def test_an_attempt_made_before_papers_existed_still_reviews_and_grades_every_question(self):
        exam = self.make_exam(pool_of_mcqs(3))
        self.client.force_authenticate(self.student)
        attempt = ExamAttempt.objects.create(exam=exam, student_id=self.student.pk, status="in_progress")
        right = {q.pk: q.choices.get(is_correct=True).pk for q in exam.questions.all()}
        answers = [{"question_id": q, "selected_choice_id": c} for q, c in right.items()]
        done = self.client.post(reverse("exam-attempt-submit", args=[exam.pk, attempt.pk]), {"answers": answers}, format="json")
        self.assertEqual((done.status_code, done.json()["total_points"], done.json()["score"]), (200, 3.0, 100.0))
        review = self.client.get(reverse("exam-attempt-detail", args=[exam.pk, attempt.pk])).json()
        self.assertEqual(len(review["exam"]["questions"]), 3)


class PatternRulesTests(PaperBase):
    def post(self, pattern, questions, status_value="published"):
        self.client.force_authenticate(self.teacher)
        return self.client.post(reverse("exam-list-create"), {"course_id": self.classroom.pk, "title": "T", "status": status_value, "pattern": pattern, "questions": questions}, format="json")

    def test_pattern_rows_are_validated(self):
        questions = pool_of_mcqs(5)
        for pattern, expected in (
            ([{"type": "essay", "marks": 1, "count": 1}], "type must be one of"),
            ([{"type": "mcq", "marks": 0, "count": 1}], "marks must be more than 0"),
            ([{"type": "mcq", "marks": 1, "count": 0}], "whole number of at least 1"),
            ([{"type": "mcq", "marks": 1, "count": 1}, {"type": "mcq", "marks": 1, "count": 2}], "repeats"),
            ([{"type": "mcq", "marks": 500, "count": 3}], "at most 1000"),
            ("nope", "must be a list"),
        ):
            response = self.post(pattern, questions, "draft")
            self.assertEqual(response.status_code, 400, pattern)
            self.assertIn(expected, response.json()["detail"])

    def test_publishing_fails_when_the_pool_is_too_small_but_a_draft_can_be_saved(self):
        pattern = [{"type": "mcq", "marks": 1, "count": 6}, {"type": "long_answer", "marks": 6, "count": 1}]
        questions = pool_of_mcqs(4)
        refused = self.post(pattern, questions)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(len(refused.json()["problems"]), 2)
        draft = self.post(pattern, questions, "draft")
        self.assertEqual(draft.status_code, 201)
        exam_id = draft.json()["id"]
        patch = self.client.patch(reverse("exam-detail", args=[exam_id]), {"status": "published"}, format="json")
        self.assertEqual(patch.status_code, 400)

    def test_the_group_must_match_marks_not_just_type(self):
        response = self.post([{"type": "mcq", "marks": 2, "count": 2}], pool_of_mcqs(5, marks=1))
        self.assertEqual(response.status_code, 400)

    def test_a_starting_student_is_told_if_the_pool_shrank_below_the_pattern(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 3}], pool_of_mcqs(3))
        exam.questions.first().delete()
        response = self.start(self.student_number(1), exam)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(ExamAttempt.objects.filter(exam=exam).exists())


class EditingThePoolTests(PaperBase):
    def put(self, exam, questions, **extra):
        self.client.force_authenticate(self.teacher)
        return self.client.put(reverse("exam-detail", args=[exam.pk]), {"questions": questions, **extra}, format="json")

    def as_payload(self, exam):
        self.client.force_authenticate(self.teacher)
        return [{**q, "choices": q["choices"]} for q in self.client.get(reverse("exam-detail", args=[exam.pk])).json()["questions"]]

    def sit_one(self, exam, n=1):
        response = self.start(self.student_number(n), exam)
        return response

    def test_adding_questions_to_the_pool_after_attempts_is_allowed(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(3))
        self.sit_one(exam)
        payload = self.as_payload(exam) + [mcq(text="A brand new question?")]
        response = self.put(exam, payload)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(exam.questions.count(), 4)

    def test_editing_or_removing_a_question_that_was_drawn_is_refused_naming_it(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(4))
        drawn = set(self.paper_ids(self.sit_one(exam)))
        payload = self.as_payload(exam)
        target = next(q for q in payload if q["id"] in drawn)
        edited = [{**q, "question_text": "Changed text"} if q["id"] == target["id"] else q for q in payload]
        edit = self.put(exam, edited)
        self.assertEqual(edit.status_code, 409)
        self.assertIn(target["question_text"], edit.json()["detail"])
        removal = self.put(exam, [q for q in payload if q["id"] != target["id"]])
        self.assertEqual(removal.status_code, 409)
        self.assertEqual(exam.questions.count(), 4)

    def test_a_question_that_was_never_drawn_can_still_change_or_go(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(5))
        response = self.sit_one(exam)
        drawn = set(self.paper_ids(response))
        payload = self.as_payload(exam)
        spare = next(q for q in payload if q["id"] not in drawn)
        keep = [q for q in payload if q["id"] in drawn or q["id"] != spare["id"]]
        keep = [q if q["id"] != keep[-1]["id"] or q["id"] in drawn else {**q, "question_text": "Edited spare"} for q in keep]
        self.assertEqual(self.put(exam, keep).status_code, 200)
        self.assertTrue(drawn <= set(exam.questions.values_list("pk", flat=True)))

    def test_changing_the_pattern_after_the_first_attempt_is_refused(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(5))
        self.sit_one(exam)
        self.client.force_authenticate(self.teacher)
        response = self.client.put(reverse("exam-detail", args=[exam.pk]), {"pattern": [{"type": "mcq", "marks": 1, "count": 3}]}, format="json")
        self.assertEqual(response.status_code, 409)
        same = self.client.put(reverse("exam-detail", args=[exam.pk]), {"pattern": [{"type": "mcq", "marks": 1, "count": 2}]}, format="json")
        self.assertEqual(same.status_code, 200)

    def test_before_any_attempt_the_pool_and_pattern_change_freely(self):
        exam = self.pattern_exam([{"type": "mcq", "marks": 1, "count": 2}], pool_of_mcqs(5))
        response = self.put(exam, pool_of_mcqs(3), pattern=[{"type": "mcq", "marks": 1, "count": 3}])
        self.assertEqual(response.status_code, 200, response.content)
        exam.refresh_from_db()
        self.assertEqual((exam.questions.count(), exam.pattern[0]["count"]), (3, 3))

    def test_new_exams_shuffle_by_default_and_existing_ones_keep_their_setting(self):
        exam = self.make_exam(pool_of_mcqs(2))
        self.assertTrue(exam.randomize_questions)
        off = self.make_exam(pool_of_mcqs(2), randomize_questions=False)
        self.assertFalse(off.randomize_questions)
