from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import StudentActivity

from .models import Quiz, QuizAnswer, QuizOption, QuizPlayer, QuizQuestion, QuizSession

User = get_user_model()


class ResultsBase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="o@x.com", password="x", role="TEACHER")
        self.other = User.objects.create_user(email="p@x.com", password="x", role="TEACHER")
        self.student = User.objects.create_user(
            email="s@x.com", password="x", role="STUDENT", register_no="R1", first_name="Sam", last_name="Student")
        self.quiz = Quiz.objects.create(title="Fractions", teacher_id=self.owner.pk)
        self.q1, self.q1_right, self.q1_wrong = self.question("One")
        self.q2, self.q2_right, self.q2_wrong = self.question("Two")
        self.session = QuizSession.objects.create(quiz=self.quiz, pin="424242", status="completed")
        self.ana = QuizPlayer.objects.create(session=self.session, nickname="Ana", student_id="R1", score=1800)
        self.ben = QuizPlayer.objects.create(session=self.session, nickname="=Ben", score=400)
        self.answer(self.ana, self.q1, self.q1_right, True, 900, 2000)
        self.answer(self.ana, self.q2, self.q2_right, True, 900, 4000)
        self.answer(self.ben, self.q1, self.q1_wrong, False, 0, 6000)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def question(self, text):
        q = QuizQuestion.objects.create(quiz=self.quiz, question_text=text, order=self.quiz.questions.count())
        return q, QuizOption.objects.create(question=q, option_text="Right", is_correct=True), \
            QuizOption.objects.create(question=q, option_text="Wrong")

    def answer(self, player, question, option, correct, points, ms):
        return QuizAnswer.objects.create(player=player, question=question, option_id=option.id,
                                         is_correct=correct, points_earned=points, response_time_ms=ms)


class ReportTests(ResultsBase):
    URL = "/quizzes/sessions/424242/report"

    def test_report_has_a_mark_per_player_and_a_difficulty_per_question(self):
        body = self.client.get(self.URL).json()
        players = {p["nickname"]: p for p in body["players"]}
        self.assertEqual((players["Ana"]["correct"], players["Ana"]["percent"]), (2, 100.0))
        # Ben skipped question two: that counts as wrong, so one of two.
        self.assertEqual((players["=Ben"]["correct"], players["=Ben"]["answered"], players["=Ben"]["percent"]), (0, 1, 0.0))
        self.assertEqual(players["Ana"]["student"], {"name": "Sam Student", "register_no": "R1"})
        self.assertIsNone(players["=Ben"]["student"])
        self.assertFalse(players["=Ben"]["answers"][1]["answered"])
        first, second = body["questions"]
        self.assertEqual((first["correct"], first["percent_correct"]), (1, 50.0))
        self.assertEqual((second["answered"], second["percent_correct"]), (1, 50.0))
        self.assertEqual({o["text"]: o["count"] for o in first["options"]}, {"Right": 1, "Wrong": 1})
        self.assertEqual(body["summary"], {"average_percent": 50.0, "highest_percent": 100.0, "lowest_percent": 0.0})

    def test_csv_download_is_safe_to_open_in_a_spreadsheet(self):
        response = self.client.get(self.URL + "?export=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        text = response.content.decode()
        self.assertIn("Rank,Nickname,Student name,Register no,Points,Correct,Questions,Percent,Q1,Q2", text)
        self.assertIn("1,Ana,Sam Student,R1,1800,2,2,100.0,Correct,Correct", text)
        self.assertIn("'=Ben", text)  # a nickname starting with = must not run as a formula
        self.assertIn("Not answered", text)

    def test_only_the_owner_can_read_it(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.URL).status_code, 404)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.URL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.URL).status_code, (401, 403))

    def test_a_game_nobody_played_reports_no_marks(self):
        empty = QuizSession.objects.create(quiz=self.quiz, pin="535353")
        body = self.client.get("/quizzes/sessions/535353/report").json()
        self.assertEqual((body["players"], body["summary"]["average_percent"]), ([], None))


class DeleteSessionTests(ResultsBase):
    def test_deleting_a_game_removes_it_and_the_marks_it_gave(self):
        StudentActivity.objects.create(student_id=self.student.pk, source_id=f"quiz:{self.session.pk}",
                                       activity_type="game", title="Fractions", score=100.0, status="completed",
                                       occurred_at=self.session.created_at)
        keep = StudentActivity.objects.create(student_id=self.student.pk, source_id="quiz:999", activity_type="game",
                                              title="Other", score=10.0, status="completed", occurred_at=self.session.created_at)
        self.assertEqual(self.client.delete("/quizzes/sessions/424242").status_code, 204)
        self.assertFalse(QuizSession.objects.filter(pin="424242").exists())
        self.assertFalse(QuizAnswer.objects.exists())
        self.assertEqual(list(StudentActivity.objects.values_list("pk", flat=True)), [keep.pk])
        self.assertTrue(Quiz.objects.filter(pk=self.quiz.pk).exists())  # the quiz itself stays

    def test_another_teacher_cannot_delete_it(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete("/quizzes/sessions/424242").status_code, 404)
        self.assertTrue(QuizSession.objects.filter(pin="424242").exists())


class EditKeepsHistoryTests(ResultsBase):
    def payload(self, *, drop=(), extra=()):
        body = self.client.get(f"/quizzes/{self.quiz.pk}").json()
        questions = [q for q in body["questions"] if q["id"] not in drop]
        return {"questions": questions + list(extra)}

    def edit(self, data):
        return self.client.put(f"/quizzes/{self.quiz.pk}", data, format="json")

    def test_fixing_a_typo_keeps_every_past_answer(self):
        data = self.payload()
        data["questions"][0]["question_text"] = "One, corrected"
        data["questions"][0]["options"][0]["option_text"] = "Right!"
        self.assertEqual(self.edit(data).status_code, 200)
        self.assertEqual(QuizAnswer.objects.count(), 3)
        self.assertEqual(QuizQuestion.objects.get(pk=self.q1.pk).question_text, "One, corrected")
        self.assertEqual(QuizOption.objects.get(pk=self.q1_right.pk).option_text, "Right!")
        self.assertEqual(self.client.get("/quizzes/sessions/424242/report").json()["players"][0]["percent"], 100.0)

    def test_a_question_with_past_answers_cannot_be_removed(self):
        response = self.edit(self.payload(drop=[self.q2.pk]))
        self.assertEqual(response.status_code, 409)
        self.assertIn("Question 2", response.json()["detail"])
        self.assertEqual(self.quiz.questions.count(), 2)  # nothing changed
        self.assertEqual(QuizAnswer.objects.count(), 3)

    def test_unanswered_questions_can_be_removed_and_new_ones_added(self):
        QuizAnswer.objects.all().delete()
        new = {"question_text": "Three", "options": [{"option_text": "A", "is_correct": True}, {"option_text": "B"}]}
        self.assertEqual(self.edit(self.payload(drop=[self.q2.pk], extra=[new])).status_code, 200)
        self.assertEqual(list(self.quiz.questions.values_list("question_text", flat=True)), ["One", "Three"])

    def test_removing_an_option_keeps_the_question_and_its_answers(self):
        data = self.payload()
        data["questions"][0]["options"] = [o for o in data["questions"][0]["options"] if o["id"] != self.q1_wrong.pk]
        self.assertEqual(self.edit(data).status_code, 200)
        self.assertEqual(self.q1.options.count(), 1)
        self.assertEqual(QuizAnswer.objects.filter(question=self.q1).count(), 2)

    def test_questions_cannot_be_changed_while_a_game_is_running(self):
        QuizSession.objects.filter(pk=self.session.pk).update(status="active")
        self.assertEqual(self.edit(self.payload()).status_code, 409)

    def test_a_title_only_edit_never_touches_the_questions(self):
        self.assertEqual(self.client.put(f"/quizzes/{self.quiz.pk}", {"title": "Renamed"}, format="json").status_code, 200)
        self.assertEqual((self.quiz.questions.count(), QuizAnswer.objects.count()), (2, 3))
