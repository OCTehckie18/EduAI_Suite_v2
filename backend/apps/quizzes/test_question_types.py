from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .models import Quiz, QuizOption, QuizQuestion
from .question_types import mark, normalise, question_problem


def opts(*pairs):
    return [{"option_text": text, "is_correct": right} for text, right in pairs]


def q(kind="mcq", options=None, **extra):
    return {"question_text": "Q?", "question_type": kind, "options": options if options is not None else
            opts(("A", True), ("B", False)), **extra}


class DefinitionChecks(SimpleTestCase):
    def test_a_good_question_of_each_kind_passes(self):
        for question in (
            q(), q("true_false", opts(("True", True), ("False", False))),
            q("multi", opts(("A", True), ("B", True), ("C", False))), q("typed", opts(("Paris", True))),
        ):
            self.assertIsNone(question_problem(question), question)

    def test_each_kind_has_its_own_rules(self):
        cases = [
            (q(options=opts(("A", True), ("B", True))), "exactly one correct"),
            (q(options=opts(("A", False), ("B", False))), "exactly one correct"),
            (q(options=opts(("A", True))), "between 2 and 4"),
            (q(options=opts(("A", True), ("", False))), "empty answer"),
            (q(options=opts(("A", True), (" a ", False))), "the same"),
            (q("true_false", opts(("True", True), ("False", True))), "exactly one correct"),
            (q("true_false", opts(("True", True))), "two answers"),
            (q("multi", opts(("A", False), ("B", False))), "at least one correct"),
            (q("typed", opts(("", True))), "accepted answer"),
            (q("typed", []), "accepted answer"),
            (q("essay"), "unknown question type"),
            ({**q(), "question_text": "  "}, "no question text"),
            (q(time_limit=1), "time limit"),
            (q(time_limit="soon"), "time limit"),
            (q(points=-5), "points"),
        ]
        for question, expected in cases:
            self.assertIn(expected, question_problem(question) or "", question)


class Opt:
    def __init__(self, id, text, right):
        self.id, self.option_text, self.is_correct = id, text, right


class Marking(SimpleTestCase):
    def test_single_answer_kinds(self):
        options = [Opt(1, "A", True), Opt(2, "B", False)]
        for kind in ("mcq", "true_false"):
            self.assertEqual(mark(kind, options, {"option_id": 1})[0]["is_correct"], True)
            self.assertEqual(mark(kind, options, {"option_id": "2"})[0]["is_correct"], False)
            self.assertEqual(mark(kind, options, {"option_id": 9})[1], "That answer is no longer available.")
            self.assertEqual(mark(kind, options, {"option_id": "x"})[1], "Invalid answer payload.")

    def test_multiple_answers_are_all_or_nothing(self):
        options = [Opt(1, "A", True), Opt(2, "B", True), Opt(3, "C", False)]
        right = lambda ids: mark("multi", options, {"option_ids": ids})[0]["is_correct"]
        self.assertTrue(right([1, 2]))
        self.assertTrue(right([2, 1, 2]))  # order and repeats do not matter
        self.assertFalse(right([1]))
        self.assertFalse(right([1, 2, 3]))
        self.assertFalse(right([3]))
        for bad in ([], "1", [1, "x"], None):
            self.assertEqual(mark("multi", options, {"option_ids": bad})[1], "Invalid answer payload.")
        self.assertEqual(mark("multi", options, {"option_ids": [1, 99]})[1], "That answer is no longer available.")

    def test_typed_answers_ignore_case_and_spacing_but_nothing_else(self):
        options = [Opt(1, "Paris", True), Opt(2, "City of  Light", True)]
        ok = lambda text: mark("typed", options, {"text": text})[0]["is_correct"]
        self.assertTrue(ok("paris"))
        self.assertTrue(ok("  PARIS  "))
        self.assertTrue(ok("city of light"))
        self.assertFalse(ok("pariss"))
        self.assertFalse(ok("London"))
        for bad in ("", "   ", None, 5, "x" * 201):
            self.assertEqual(mark("typed", options, {"text": bad})[1], "Invalid answer payload.")
        self.assertEqual(normalise("  A   b "), "a b")


class QuizSaveValidation(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="x", role=User.Role.TEACHER))

    def create(self, questions, **extra):
        return self.client.post("/quizzes/", {"title": "T", "questions": questions, **extra}, format="json")

    def test_a_broken_question_is_refused_with_its_number(self):
        res = self.create([q(), q(options=opts(("A", True), ("B", True)))])
        self.assertEqual(res.status_code, 400)
        self.assertIn("Question 2 needs exactly one correct", res.json()["detail"])
        self.assertEqual(Quiz.objects.count(), 0)

    def test_a_draft_may_be_saved_unfinished(self):
        self.assertEqual(self.create([q(options=opts(("A", False), ("B", False)))], is_draft=True).status_code, 201)

    def test_all_four_kinds_round_trip_and_typed_answers_are_all_accepted(self):
        res = self.create([
            q("true_false", opts(("True", False), ("False", True))),
            q("multi", opts(("A", True), ("B", True), ("C", False))),
            q("typed", [{"option_text": "Paris", "is_correct": False}, {"option_text": "City of Light"}]),
        ])
        self.assertEqual(res.status_code, 201, res.content)
        kinds = [x["question_type"] for x in res.json()["questions"]]
        self.assertEqual(kinds, ["true_false", "multi", "typed"])
        typed = QuizQuestion.objects.get(question_type="typed")
        self.assertTrue(all(o.is_correct for o in typed.options.all()))

    def test_editing_into_a_broken_quiz_changes_nothing(self):
        quiz = self.create([q()]).json()
        broken = quiz["questions"]
        broken[0]["options"] = opts(("A", False), ("B", False))
        res = self.client.put(f"/quizzes/{quiz['id']}", {"title": "Renamed", "questions": broken}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Quiz.objects.get(pk=quiz["id"]).title, "T")
        self.assertEqual(QuizOption.objects.filter(is_correct=True).count(), 1)
