from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
import jwt
from rest_framework.test import APIClient
from datetime import timedelta

from config.asgi import application
from .models import Quiz, QuizOption, QuizPlayer, QuizQuestion, QuizSession


class QuizSocketCase(TransactionTestCase):
    """A quiz with one question (two options) and a game waiting in the lobby."""

    pin = "123456"

    def setUp(self):
        teacher = get_user_model().objects.create(
            email="quiz-teacher@example.com",
            role="TEACHER",
            is_active=True,
        )
        self.teacher_token = jwt.encode(
            {"sub": str(teacher.pk), "type": "access"},
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )
        self.quiz = Quiz.objects.create(title="WebSocket smoke quiz", teacher_id=teacher.pk)
        self.question = self.add_question("Which answer is correct?")
        self.correct_option = self.question.options.get(is_correct=True)
        self.wrong_option = self.question.options.get(is_correct=False)
        self.session = QuizSession.objects.create(quiz=self.quiz, pin=self.pin)

    def add_question(self, text, time_limit=20):
        question = QuizQuestion.objects.create(
            quiz=self.quiz, question_text=text, time_limit=time_limit, points=1000,
            order=self.quiz.questions.count(),
        )
        QuizOption.objects.create(question=question, option_text="Correct", is_correct=True)
        QuizOption.objects.create(question=question, option_text="Wrong", is_correct=False)
        return question

    # ---- helpers ----

    async def teacher_connects(self):
        teacher = WebsocketCommunicator(
            application, f"/ws/quiz/{self.pin}?user_type=teacher&access_token={self.teacher_token}")
        connected, _ = await teacher.connect()
        self.assertTrue(connected)
        return teacher

    async def student_connects(self, nickname, extra=""):
        student = WebsocketCommunicator(
            application, f"/ws/quiz/{self.pin}?user_type=student&nickname={nickname}{extra}")
        connected, _ = await student.connect()
        self.assertTrue(connected)
        return student

    async def until(self, comm, message_type, timeout=5, question=None):
        for _ in range(25):
            message = await comm.receive_json_from(timeout=timeout)
            if message["type"] != message_type:
                continue
            if question is not None and message["question"]["id"] != question.id:
                continue
            return message
        self.fail(f"never received {message_type}")

    async def answer(self, student, option=None, question=None):
        await student.send_json_to({
            "type": "submit_answer",
            "question_id": (question or self.question).id,
            "option_id": (option or self.correct_option).id,
        })

    async def refused(self, comm, code):
        """The page is told why before the socket closes."""
        message = await self.until(comm, "error")
        self.assertEqual(message["code"], code)
        return message


class QuizWebSocketFlowTests(QuizSocketCase):
    def test_kahoot_flow(self):
        async_to_sync(self._assert_kahoot_flow)()

    async def _assert_kahoot_flow(self):
        teacher = await self.teacher_connects()
        self.assertEqual((await teacher.receive_json_from())["type"], "lobby_update")

        ana = await self.student_connects("Ana")
        self.assertEqual((await ana.receive_json_from())["type"], "joined")
        self.assertEqual((await ana.receive_json_from())["type"], "lobby_update")
        ben = await self.student_connects("Ben")
        await self.until(ben, "joined")
        await self.until(teacher, "lobby_update")

        await teacher.send_json_to({"type": "start_game"})
        question = await self.until(teacher, "new_question")
        self.assertEqual(question["question"]["time_left"], 20)
        await self.until(ana, "new_question")

        await ana.send_json_to({
            "type": "submit_answer", "question_id": self.question.id, "option_id": "not-a-number",
        })
        invalid = await self.until(ana, "error")
        self.assertEqual(invalid["message"], "Invalid answer payload.")

        await self.answer(ana)
        submitted = await self.until(ana, "answer_submitted")
        self.assertNotIn("is_correct", submitted)  # nothing is revealed until the question ends
        count = await self.until(teacher, "answer_count_update")
        self.assertEqual((count["count"], count["players_total"]), (1, 2))

        await self.answer(ana)
        duplicate = await self.until(ana, "error")
        self.assertEqual(duplicate["message"], "You have already answered this question.")

        await self.answer(ben, self.wrong_option)
        results = await self.until(teacher, "show_results")
        self.assertEqual(await self.until(ana, "show_results"), results)
        board = {row["nickname"]: row for row in results["scoreboard"]}
        self.assertEqual((board["Ana"]["rank"], board["Ben"]["rank"]), (1, 2))
        self.assertTrue(board["Ana"]["is_correct"])
        self.assertGreater(board["Ana"]["gained"], 900)
        self.assertEqual((board["Ben"]["gained"], board["Ben"]["is_correct"]), (0, False))
        self.assertEqual(results["stats"][str(self.correct_option.id)], 1)
        self.assertEqual(results["correct_option_ids"], [self.correct_option.id])

        await teacher.send_json_to({"type": "next_question"})
        game_over = await self.until(teacher, "game_over")
        self.assertEqual([p["nickname"] for p in game_over["leaderboard"]], ["Ana", "Ben"])
        await self.until(ana, "game_over")

        for comm in (teacher, ana, ben):
            await comm.disconnect()

    def test_signed_in_student_is_saved_with_real_id_and_result_recorded(self):
        async_to_sync(self._assert_real_student_identity)()

    def test_invalid_student_token_is_refused_with_a_reason(self):
        async def run():
            comm = WebsocketCommunicator(
                application, f"/ws/quiz/{self.pin}?user_type=student&nickname=Ana&access_token=bad")
            await comm.connect()
            await self.refused(comm, 4401)
        async_to_sync(run)()

    async def _assert_real_student_identity(self):
        from apps.core.models import StudentActivity

        student_user = await sync_to_async(get_user_model().objects.create)(
            email="real-student@example.com", role="STUDENT", is_active=True,
            register_no="2547237")
        token = jwt.encode(
            {"sub": str(student_user.pk), "type": "access"},
            settings.JWT_SECRET_KEY, algorithm="HS256")
        extra = f"&access_token={token}"

        teacher = await self.teacher_connects()
        student = await self.student_connects("Ana", extra)
        await self.until(student, "joined")

        player = await sync_to_async(QuizPlayer.objects.get)(session__pin=self.pin)
        # Stored under the register number, not a generated id or the typed nickname.
        self.assertEqual(player.student_id, "2547237")

        # Same account reconnecting keeps the same player instead of being rejected.
        await student.disconnect()
        again = await self.student_connects("Ana", extra)
        await self.until(again, "joined")
        self.assertEqual(
            await sync_to_async(QuizPlayer.objects.filter(session__pin=self.pin).count)(), 1)

        await teacher.send_json_to({"type": "start_game"})
        await self.until(again, "new_question")
        await self.answer(again)
        await self.until(teacher, "show_results")  # the only player answered
        await teacher.send_json_to({"type": "next_question"})
        await self.until(teacher, "game_over")

        activity = await sync_to_async(StudentActivity.objects.get)(student_id=student_user.pk)
        self.assertEqual(activity.activity_type, "game")
        self.assertEqual(activity.title, "WebSocket smoke quiz")
        self.assertGreater(activity.score, 0)

        # The student's stats page sees the quiz even though the nickname was "Ana".
        profile = await sync_to_async(
            lambda: self.client.get(
                f"/api/v1/engagement/student/{student_user.pk}/",
                HTTP_AUTHORIZATION=f"Bearer {token}",
            ).json())()
        self.assertEqual(profile["games"]["sessions_played"], 1)
        self.assertEqual(profile["games"]["details"][0]["game_name"], "WebSocket smoke quiz")

        await teacher.disconnect()
        await again.disconnect()

    def test_teacher_requires_access_token(self):
        async def run():
            comm = WebsocketCommunicator(application, f"/ws/quiz/{self.pin}?user_type=teacher&access_token=")
            connected, _ = await comm.connect()
            self.assertFalse(connected)
        async_to_sync(run)()

    def test_student_cannot_answer_non_current_question(self):
        second = self.add_question("Which answer is not active?")
        second_correct = second.options.get(is_correct=True)

        async def run():
            teacher = await self.teacher_connects()
            student = await self.student_connects("Ana")
            await self.until(student, "joined")
            await teacher.send_json_to({"type": "start_game"})
            await self.until(student, "new_question")
            await self.answer(student, second_correct, second)
            error = await self.until(student, "error")
            self.assertEqual(error["message"], "That question is no longer accepting answers.")
            await teacher.disconnect()
            await student.disconnect()
        async_to_sync(run)()

    def test_duplicate_nickname_is_refused_with_a_reason(self):
        async def run():
            first = await self.student_connects("Ana")
            await self.until(first, "joined")
            second = await self.student_connects("Ana")
            message = await self.refused(second, 4409)
            self.assertIn("nickname", message["message"])
            await first.disconnect()
        async_to_sync(run)()

    def test_student_cannot_answer_after_question_timeout(self):
        async def run():
            teacher = await self.teacher_connects()
            student = await self.student_connects("Ana")
            await self.until(student, "joined")
            await teacher.send_json_to({"type": "start_game"})
            await self.until(student, "new_question")
            await sync_to_async(
                lambda: QuizSession.objects.filter(pin=self.pin).update(
                    question_started_at=timezone.now() - timedelta(seconds=21)))()
            await self.answer(student)
            error = await self.until(student, "error")
            self.assertEqual(error["message"], "This question's time has expired.")
            await teacher.disconnect()
            await student.disconnect()
        async_to_sync(run)()


class QuizGameplayTests(QuizSocketCase):
    def run_async(self, coroutine):
        async_to_sync(coroutine)()

    async def start_with(self, *names):
        teacher = await self.teacher_connects()
        students = []
        for name in names:
            student = await self.student_connects(name)
            await self.until(student, "joined")
            students.append(student)
        await teacher.send_json_to({"type": "start_game"})
        await self.until(teacher, "new_question")
        for student in students:
            await self.until(student, "new_question")
        return teacher, students

    async def close_all(self, *comms):
        for comm in comms:
            await comm.disconnect()

    def test_the_server_ends_the_question_when_time_runs_out(self):
        QuizQuestion.objects.filter(pk=self.question.pk).update(time_limit=1)

        async def run():
            teacher, (ana, ben) = await self.start_with("Ana", "Ben")
            await self.answer(ana)  # Ben never answers and the teacher does nothing
            results = await self.until(teacher, "show_results", timeout=5)
            self.assertEqual((results["answered"], results["players_total"]), (1, 2))
            await self.until(ben, "show_results")
            state = await sync_to_async(lambda: QuizSession.objects.get(pin=self.pin).status)()
            self.assertEqual(state, "result")
            await self.close_all(teacher, ana, ben)
        self.run_async(run)

    def test_the_question_ends_early_when_everyone_has_answered(self):
        async def run():
            teacher, (ana, ben) = await self.start_with("Ana", "Ben")
            await self.answer(ana)
            await self.answer(ben, self.wrong_option)
            results = await self.until(teacher, "show_results", timeout=2)
            self.assertEqual(results["answered"], 2)
            await self.close_all(teacher, ana, ben)
        self.run_async(run)

    def test_the_servers_clock_decides_the_speed_bonus(self):
        async def run():
            teacher, (ana, ben) = await self.start_with("Ana", "Ben")
            await sync_to_async(
                lambda: QuizSession.objects.filter(pin=self.pin).update(
                    question_started_at=timezone.now() - timedelta(seconds=10)))()
            # A page claiming an instant answer changes nothing.
            await ana.send_json_to({
                "type": "submit_answer", "question_id": self.question.id,
                "option_id": self.correct_option.id, "response_time": 0,
            })
            await self.answer(ben, self.wrong_option)
            results = await self.until(teacher, "show_results")
            gained = {r["nickname"]: r["gained"] for r in results["scoreboard"]}["Ana"]
            self.assertTrue(740 <= gained <= 750, gained)  # halfway through 20 s: 75% of 1000
            await self.close_all(teacher, ana, ben)
        self.run_async(run)

    def test_streak_bonus_grows_with_each_correct_answer_and_resets_on_a_miss(self):
        second = self.add_question("Second")
        third = self.add_question("Third")
        second_correct = second.options.get(is_correct=True)
        third_wrong = third.options.get(is_correct=False)

        async def run():
            teacher, (ana,) = await self.start_with("Ana")
            await self.answer(ana)
            first = await self.until(teacher, "show_results")
            self.assertLessEqual(first["scoreboard"][0]["gained"], 1000)
            self.assertEqual(first["scoreboard"][0]["streak"], 1)

            await teacher.send_json_to({"type": "next_question"})
            await self.until(ana, "new_question", question=second)
            await self.answer(ana, second_correct, second)
            second_result = (await self.until(teacher, "show_results"))["scoreboard"][0]
            self.assertEqual(second_result["streak"], 2)
            self.assertGreaterEqual(second_result["gained"], 1000 - 30 + 100)  # speed points plus 100

            await teacher.send_json_to({"type": "next_question"})
            await self.until(ana, "new_question", question=third)
            await self.answer(ana, third_wrong, third)
            third_result = (await self.until(teacher, "show_results"))["scoreboard"][0]
            self.assertEqual((third_result["streak"], third_result["gained"]), (0, 0))
            await self.close_all(teacher, ana)
        self.run_async(run)

    def test_the_result_saved_for_a_student_is_a_mark_out_of_100(self):
        from apps.core.models import StudentActivity

        self.add_question("Second")
        student_user = get_user_model().objects.create(
            email="mark@example.com", role="STUDENT", is_active=True, register_no="R77")
        token = jwt.encode({"sub": str(student_user.pk), "type": "access"}, settings.JWT_SECRET_KEY, algorithm="HS256")

        async def run():
            teacher = await self.teacher_connects()
            student = await self.student_connects("Ana", f"&access_token={token}")
            await self.until(student, "joined")
            await teacher.send_json_to({"type": "start_game"})
            await self.until(student, "new_question")
            await self.answer(student)  # question one right, question two never answered
            await self.until(teacher, "show_results")
            await teacher.send_json_to({"type": "next_question"})
            await self.until(student, "new_question")
            await teacher.send_json_to({"type": "next_question"})
            await self.until(teacher, "show_results")
            await teacher.send_json_to({"type": "next_question"})
            over = await self.until(student, "game_over")
            entry = over["leaderboard"][0]
            self.assertEqual((entry["correct"], entry["total"], entry["percent"]), (1, 2, 50.0))
            await self.close_all(teacher, student)
        self.run_async(run)

        activity = StudentActivity.objects.get(student_id=student_user.pk)
        self.assertEqual(activity.score, 50.0)

    def make_question(self, kind, options, text="Kind of question"):
        question = QuizQuestion.objects.create(
            quiz=self.quiz, question_text=text, question_type=kind, time_limit=20, points=1000, order=0)
        for option_text, right in options:
            QuizOption.objects.create(question=question, option_text=option_text, is_correct=right)
        QuizQuestion.objects.exclude(pk=question.pk).delete()  # this game asks only the question under test
        return question

    async def play_one(self, question, send):
        """Join one student, ask the question, have them send `send`, and return the results the room sees."""
        teacher = await self.teacher_connects()
        student = await self.student_connects("Ana")
        await self.until(student, "joined")
        await teacher.send_json_to({"type": "start_game"})
        asked = await self.until(student, "new_question")
        await student.send_json_to({"type": "submit_answer", "question_id": question.id, **send})
        results = await self.until(teacher, "show_results")
        await self.close_all(teacher, student)
        return asked, results

    def test_a_typed_question_hides_its_answers_and_marks_loosely(self):
        question = self.make_question("typed", [("Paris", True), ("City of Light", True)])

        async def run():
            asked, results = await self.play_one(question, {"text": "  pARIS "})
            self.assertEqual(asked["question"]["question_type"], "typed")
            self.assertEqual(asked["question"]["options"], [])  # accepted answers never reach players
            self.assertNotIn("Paris", str(asked))
            self.assertTrue(results["scoreboard"][0]["is_correct"])
            self.assertEqual(results["accepted_answers"], ["Paris", "City of Light"])
            self.assertEqual(results["typed_answers"], [{"text": "pARIS", "count": 1, "is_correct": True}])
        self.run_async(run)

    def test_a_wrong_typed_answer_scores_nothing(self):
        question = self.make_question("typed", [("Paris", True)])

        async def run():
            _, results = await self.play_one(question, {"text": "Lyon"})
            self.assertEqual((results["scoreboard"][0]["is_correct"], results["scoreboard"][0]["gained"]), (False, 0))
        self.run_async(run)

    def test_a_multiple_answer_question_needs_exactly_the_right_set(self):
        question = self.make_question("multi", [("A", True), ("B", True), ("C", False)])
        ids = {o.option_text: o.id for o in question.options.all()}

        async def run():
            _, partial = await self.play_one(question, {"option_ids": [ids["A"]]})
            self.assertFalse(partial["scoreboard"][0]["is_correct"])
        self.run_async(run)

        QuizPlayer.objects.all().delete()
        QuizSession.objects.filter(pin=self.pin).update(status="lobby", current_question_index=0)

        async def run_all():
            _, full = await self.play_one(question, {"option_ids": [ids["B"], ids["A"]]})
            self.assertTrue(full["scoreboard"][0]["is_correct"])
            self.assertEqual(full["correct_option_ids"], sorted([ids["A"], ids["B"]]))
            self.assertEqual((full["stats"][str(ids["A"])], full["stats"][str(ids["B"])], full["stats"][str(ids["C"])]), (1, 1, 0))
        self.run_async(run_all)

    def test_true_false_works_like_a_single_choice(self):
        question = self.make_question("true_false", [("True", False), ("False", True)])
        false_id = question.options.get(option_text="False").id

        async def run():
            asked, results = await self.play_one(question, {"option_id": false_id})
            self.assertEqual([o["text"] for o in asked["question"]["options"]], ["True", "False"])
            self.assertTrue(results["scoreboard"][0]["is_correct"])
        self.run_async(run)

    def test_the_report_shows_what_each_player_actually_answered(self):
        question = self.make_question("typed", [("Paris", True)])

        async def run():
            await self.play_one(question, {"text": "Lyon"})
        self.run_async(run)

        from .report import build_report
        report = build_report(QuizSession.objects.get(pin=self.pin))
        self.assertEqual(report["players"][0]["answers"][0]["option_text"], "Lyon")
        self.assertEqual(report["questions"][0]["typed_answers"], [{"text": "Lyon", "count": 1, "is_correct": False}])

    def test_a_locked_lobby_turns_new_players_away_but_lets_existing_ones_back(self):
        async def run():
            teacher = await self.teacher_connects()
            ana = await self.student_connects("Ana")
            token = (await self.until(ana, "joined"))["token"]
            await teacher.send_json_to({"type": "lock_lobby", "locked": True})
            update = await self.until(teacher, "lobby_update")
            while not update["locked"]:
                update = await self.until(teacher, "lobby_update")

            late = await self.student_connects("Late")
            await self.refused(late, 4412)

            await ana.disconnect()
            back = await self.student_connects("Ana", f"&player_token={token}")
            self.assertEqual((await self.until(back, "joined"))["nickname"], "Ana")

            await teacher.send_json_to({"type": "lock_lobby", "locked": False})
            welcome = await self.student_connects("Late")
            await self.until(welcome, "joined")
            await self.close_all(teacher, back, welcome)
        self.run_async(run)

    def test_the_host_can_remove_a_player(self):
        async def run():
            teacher = await self.teacher_connects()
            ana = await self.student_connects("Ana")
            player_id = (await self.until(ana, "joined"))["player_id"]
            ben = await self.student_connects("Ben")
            await self.until(ben, "joined")
            await teacher.send_json_to({"type": "kick_player", "player_id": player_id})
            kicked = await self.until(ana, "kicked")
            self.assertEqual(kicked["code"], 4410)
            remaining = await sync_to_async(
                lambda: list(QuizPlayer.objects.filter(session__pin=self.pin).values_list("nickname", flat=True)))()
            self.assertEqual(remaining, ["Ben"])
            await self.close_all(teacher, ben)
        self.run_async(run)

    def test_a_player_cannot_remove_another_player(self):
        async def run():
            ana = await self.student_connects("Ana")
            ben = await self.student_connects("Ben")
            ben_id = (await self.until(ben, "joined"))["player_id"]
            await ana.send_json_to({"type": "kick_player", "player_id": ben_id})
            await ana.send_json_to({"type": "lock_lobby", "locked": True})
            await ana.send_json_to({"type": "nonsense"})
            await self.until(ana, "error")  # by now the two messages above have been handled
            count = await sync_to_async(QuizPlayer.objects.filter(session__pin=self.pin).count)()
            locked = await sync_to_async(lambda: QuizSession.objects.get(pin=self.pin).lobby_locked)()
            self.assertEqual((count, locked), (2, False))
            await self.close_all(ana, ben)
        self.run_async(run)

    def test_a_refreshed_page_takes_the_same_seat_back_with_its_score(self):
        async def run():
            teacher, (ana,) = await self.start_with("Ana")
            await self.answer(ana)
            await self.until(teacher, "show_results")
            await ana.disconnect()
            token = (await sync_to_async(lambda: QuizPlayer.objects.get(session__pin=self.pin).token)())

            back = await self.student_connects("Whatever", f"&player_token={token}")
            joined = await self.until(back, "joined")
            self.assertEqual(joined["nickname"], "Ana")
            # A page that comes back mid-game is shown where the game is.
            results = await self.until(back, "show_results")
            self.assertGreater(results["scoreboard"][0]["score"], 0)
            self.assertEqual(await sync_to_async(QuizPlayer.objects.filter(session__pin=self.pin).count)(), 1)
            await self.close_all(teacher, back)
        self.run_async(run)

    def test_a_page_that_joins_mid_question_gets_the_time_that_is_left(self):
        async def run():
            teacher, _ = await self.start_with("Ana")
            await sync_to_async(
                lambda: QuizSession.objects.filter(pin=self.pin).update(
                    question_started_at=timezone.now() - timedelta(seconds=12)))()
            late = await self.student_connects("Ben")
            question = await self.until(late, "new_question")
            self.assertTrue(6 <= question["question"]["time_left"] <= 8, question["question"]["time_left"])
            await self.close_all(teacher, late)
        self.run_async(run)

    def test_nobody_can_join_a_finished_game(self):
        QuizSession.objects.filter(pin=self.pin).update(status="completed")

        async def run():
            late = await self.student_connects("Late")
            await self.refused(late, 4411)
        self.run_async(run)

    def test_a_wrong_pin_says_so(self):
        async def run():
            comm = WebsocketCommunicator(application, "/ws/quiz/999999?user_type=student&nickname=Ana")
            await comm.connect()
            message = await self.refused(comm, 4404)
            self.assertIn("PIN", message["message"])
        self.run_async(run)

    def test_only_the_host_can_start_or_end_questions(self):
        async def run():
            ana = await self.student_connects("Ana")
            await self.until(ana, "joined")
            await ana.send_json_to({"type": "start_game"})
            await ana.send_json_to({"type": "next_question"})
            await ana.send_json_to({"type": "time_up"})
            await ana.send_json_to({"type": "nonsense"})
            error = await self.until(ana, "error")
            self.assertEqual(error["message"], "Unknown quiz action.")
            status = await sync_to_async(lambda: QuizSession.objects.get(pin=self.pin).status)()
            self.assertEqual(status, "lobby")
            await ana.disconnect()
        self.run_async(run)


class QuizLibraryTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(
            email="owner@example.com", password="x", role=User.Role.TEACHER)
        self.other = User.objects.create_user(
            email="other@example.com", password="x", role=User.Role.TEACHER)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def _create(self, **extra):
        payload = {
            "title": "Shared quiz",
            "questions": [{
                "question_text": "2+2?",
                "options": [
                    {"option_text": "4", "is_correct": True},
                    {"option_text": "5", "is_correct": False},
                ],
            }],
            **extra,
        }
        res = self.client.post("/api/v1/quizzes/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        return res.json()

    def test_quizzes_are_private_by_default(self):
        quiz = self._create()
        self.assertFalse(quiz["is_public"])
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.get("/api/v1/quizzes/?scope=library").json(), [])
        self.assertEqual(self.client.get(f"/api/v1/quizzes/{quiz['id']}").status_code, 404)

    def test_public_quiz_is_listed_and_cloneable_by_other_teacher(self):
        quiz = self._create(is_public=True)
        self.client.force_authenticate(user=self.other)

        library = self.client.get("/api/v1/quizzes/?scope=library").json()
        self.assertEqual([q["id"] for q in library], [quiz["id"]])
        self.assertEqual(self.client.get("/api/v1/quizzes/").json(), [])
        self.assertEqual(self.client.get(f"/api/v1/quizzes/{quiz['id']}").status_code, 200)
        # Library quizzes are read-only for non-owners.
        self.assertEqual(
            self.client.put(f"/api/v1/quizzes/{quiz['id']}", {"title": "Hacked"}, format="json").status_code, 404)

        copy = self.client.post(f"/api/v1/quizzes/{quiz['id']}/clone").json()
        self.assertNotEqual(copy["id"], quiz["id"])
        self.assertFalse(copy["is_public"])
        self.assertEqual(copy["teacher_id"], self.other.pk)
        self.assertEqual(len(copy["questions"][0]["options"]), 2)

    def test_owner_can_toggle_visibility(self):
        quiz = self._create(is_public=True)
        res = self.client.put(f"/api/v1/quizzes/{quiz['id']}", {"is_public": False}, format="json")
        self.assertFalse(res.json()["is_public"])


class QuizRestJoinIdentityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        quiz = Quiz.objects.create(title="Q", teacher_id=1)
        self.session = QuizSession.objects.create(quiz=quiz, pin="123456")
        self.student = get_user_model().objects.create_user(
            email="joiner@example.com", password="x", role="STUDENT", register_no="REG42"
        )
        self.url = "/api/v1/quizzes/session/123456/join"

    def test_client_supplied_student_id_is_ignored_for_anonymous_join(self):
        res = self.client.post(self.url, {"nickname": "Ann", "student_id": "REG42"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(self.session.players.get(nickname="Ann").student_id)

    def test_authenticated_student_identity_comes_from_token(self):
        self.client.force_authenticate(self.student)
        res = self.client.post(self.url, {"nickname": "Bob", "student_id": "SOMEONE-ELSE"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.session.players.get(nickname="Bob").student_id, "REG42")

    def test_duplicate_nickname_returns_conflict(self):
        self.client.post(self.url, {"nickname": "Cat"}, format="json")
        res = self.client.post(self.url, {"nickname": "Cat"}, format="json")
        self.assertEqual(res.status_code, 409)


class QuizSessionVisibilityTests(TestCase):
    def test_a_teacher_only_lists_games_hosted_from_their_own_quizzes(self):
        User = get_user_model()
        owner = User.objects.create_user(email="o@example.com", password="x", role=User.Role.TEACHER)
        other = User.objects.create_user(email="p@example.com", password="x", role=User.Role.TEACHER)
        quiz = Quiz.objects.create(title="Mine", teacher_id=owner.pk)
        QuizSession.objects.create(quiz=quiz, pin="111111", is_test_run=True)
        QuizSession.objects.create(quiz=quiz, pin="222222")
        client = APIClient()
        client.force_authenticate(owner)
        self.assertEqual(len(client.get("/api/v1/quizzes/sessions").json()), 2)
        client.force_authenticate(other)
        self.assertEqual(client.get("/api/v1/quizzes/sessions").json(), [])
        self.assertEqual(client.get("/api/v1/quizzes/sessions/111111").status_code, 404)

    def test_a_finished_or_locked_game_refuses_the_rest_join(self):
        quiz = Quiz.objects.create(title="Q", teacher_id=1)
        session = QuizSession.objects.create(quiz=quiz, pin="333333", status="completed")
        client = APIClient()
        self.assertEqual(client.post("/api/v1/quizzes/session/333333/join", {"nickname": "A"}, format="json").status_code, 409)
        QuizSession.objects.filter(pk=session.pk).update(status="lobby", lobby_locked=True)
        self.assertEqual(client.post("/api/v1/quizzes/session/333333/join", {"nickname": "A"}, format="json").status_code, 409)
