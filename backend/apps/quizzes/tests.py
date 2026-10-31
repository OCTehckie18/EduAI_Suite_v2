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
from .models import Quiz, QuizOption, QuizQuestion, QuizSession


class QuizWebSocketFlowTests(TransactionTestCase):
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
        quiz = Quiz.objects.create(title="WebSocket smoke quiz")
        question = self.question = QuizQuestion.objects.create(
            quiz=quiz,
            question_text="Which answer is correct?",
            time_limit=20,
            points=1000,
        )
        self.correct_option = QuizOption.objects.create(
            question=question, option_text="Correct", is_correct=True)
        QuizOption.objects.create(
            question=question, option_text="Wrong", is_correct=False)
        QuizSession.objects.create(quiz=quiz, pin="123456")

    def test_kahoot_flow(self):
        async_to_sync(self._assert_kahoot_flow)()

    async def _assert_kahoot_flow(self):
        teacher = WebsocketCommunicator(
            application,
            f"/ws/quiz/123456?user_type=teacher&access_token={self.teacher_token}",
        )
        student = WebsocketCommunicator(
            application,
            "/ws/quiz/123456?user_type=student&nickname=Ana",
        )

        teacher_connected, _ = await teacher.connect()
        self.assertTrue(teacher_connected)
        self.assertEqual((await teacher.receive_json_from())["type"], "lobby_update")

        student_connected, _ = await student.connect()
        self.assertTrue(student_connected)
        self.assertEqual((await student.receive_json_from())["type"], "lobby_update")
        self.assertEqual((await teacher.receive_json_from())["type"], "lobby_update")

        await teacher.send_json_to({"type": "start_game"})
        self.assertEqual((await teacher.receive_json_from())["type"], "new_question")
        self.assertEqual((await student.receive_json_from())["type"], "new_question")

        await student.send_json_to({
            "type": "submit_answer",
            "question_id": self.question.id,
            "option_id": self.correct_option.id,
            "response_time": "not-a-number",
        })
        invalid_payload = await student.receive_json_from()
        self.assertEqual(invalid_payload["type"], "error")
        self.assertEqual(invalid_payload["message"], "Invalid answer payload.")

        await student.send_json_to({
            "type": "submit_answer",
            "question_id": self.question.id,
            "option_id": self.correct_option.id,
            "response_time": 250,
        })
        self.assertEqual((await student.receive_json_from())["type"], "answer_submitted")
        self.assertEqual((await teacher.receive_json_from())["type"], "answer_count_update")
        self.assertEqual((await student.receive_json_from())["type"], "answer_count_update")

        await student.send_json_to({
            "type": "submit_answer",
            "question_id": self.question.id,
            "option_id": self.correct_option.id,
            "response_time": 250,
        })
        duplicate = await student.receive_json_from()
        self.assertEqual(duplicate["type"], "error")
        self.assertEqual(
            duplicate["message"], "You have already answered this question."
        )

        await teacher.send_json_to({"type": "time_up", "question_id": self.question.id})
        self.assertEqual((await teacher.receive_json_from())["type"], "show_results")
        self.assertEqual((await student.receive_json_from())["type"], "show_results")

        await teacher.send_json_to({"type": "next_question"})
        game_over = await teacher.receive_json_from()
        self.assertEqual(game_over["type"], "game_over")
        self.assertEqual((await student.receive_json_from())["type"], "game_over")

        await teacher.disconnect()
        await student.disconnect()

    def test_signed_in_student_is_saved_with_real_id_and_result_recorded(self):
        async_to_sync(self._assert_real_student_identity)()

    def test_invalid_student_token_is_rejected(self):
        async def run():
            comm = WebsocketCommunicator(
                application, "/ws/quiz/123456?user_type=student&nickname=Ana&access_token=bad")
            connected, _ = await comm.connect()
            self.assertFalse(connected)
        async_to_sync(run)()

    async def _assert_real_student_identity(self):
        from apps.core.models import StudentActivity
        from .models import QuizPlayer

        student_user = await sync_to_async(get_user_model().objects.create)(
            email="real-student@example.com", role="STUDENT", is_active=True,
            register_no="2547237")
        token = jwt.encode(
            {"sub": str(student_user.pk), "type": "access"},
            settings.JWT_SECRET_KEY, algorithm="HS256")
        url = f"/ws/quiz/123456?user_type=student&nickname=Ana&access_token={token}"

        teacher = WebsocketCommunicator(
            application,
            f"/ws/quiz/123456?user_type=teacher&access_token={self.teacher_token}",
        )
        student = WebsocketCommunicator(application, url)
        await teacher.connect()
        await teacher.receive_json_from()
        connected, _ = await student.connect()
        self.assertTrue(connected)
        await student.receive_json_from()
        await teacher.receive_json_from()

        player = await sync_to_async(QuizPlayer.objects.get)(session__pin="123456")
        # Stored under the register number, not a generated id or the typed nickname.
        self.assertEqual(player.student_id, "2547237")

        # Same account reconnecting keeps the same player instead of being rejected.
        await student.disconnect()
        again = WebsocketCommunicator(application, url)
        connected, _ = await again.connect()
        self.assertTrue(connected)
        await again.receive_json_from()
        self.assertEqual(
            await sync_to_async(QuizPlayer.objects.filter(session__pin="123456").count)(), 1)

        async def until(comm, message_type):
            for _ in range(10):
                message = await comm.receive_json_from()
                if message["type"] == message_type:
                    return message
            self.fail(f"never received {message_type}")

        await teacher.send_json_to({"type": "start_game"})
        await until(teacher, "new_question")
        await until(again, "new_question")
        await again.send_json_to({
            "type": "submit_answer", "question_id": self.question.id,
            "option_id": self.correct_option.id, "response_time": 250,
        })
        await until(again, "answer_submitted")
        await teacher.send_json_to({"type": "time_up", "question_id": self.question.id})
        await until(teacher, "show_results")
        await teacher.send_json_to({"type": "next_question"})
        await until(teacher, "game_over")

        activity = await sync_to_async(StudentActivity.objects.get)(student_id=student_user.pk)
        self.assertEqual(activity.activity_type, "game")
        self.assertEqual(activity.title, "WebSocket smoke quiz")
        self.assertGreater(activity.score, 0)

        # The student's stats page sees the quiz even though the nickname was "Ana".
        profile = await sync_to_async(
            lambda: self.client.get(f"/engagement/student/{student_user.pk}/").json())()
        self.assertEqual(profile["games"]["sessions_played"], 1)
        self.assertEqual(profile["games"]["details"][0]["game_name"], "WebSocket smoke quiz")

        await teacher.disconnect()
        await again.disconnect()

    async def _connect_teacher(self, token):
        return await WebsocketCommunicator(
            application,
            f"/ws/quiz/123456?user_type=teacher&access_token={token}",
        ).connect()

    def test_teacher_requires_access_token(self):
        connected, _ = async_to_sync(self._connect_teacher)("")
        self.assertFalse(connected)

    def test_student_cannot_answer_non_current_question(self):
        second_question = QuizQuestion.objects.create(
            quiz=Quiz.objects.get(title="WebSocket smoke quiz"),
            question_text="Which answer is not active?",
            time_limit=20,
            points=1000,
        )
        second_option = QuizOption.objects.create(
            question=second_question,
            option_text="Correct but not current",
            is_correct=True,
        )
        async_to_sync(self._assert_rejects_non_current_answer)(
            second_question.id,
            second_option.id,
        )

    def test_duplicate_student_nickname_is_rejected(self):
        async_to_sync(self._assert_rejects_duplicate_nickname)()

    def test_student_cannot_answer_after_question_timeout(self):
        async_to_sync(self._assert_rejects_expired_answer)()

    async def _assert_rejects_expired_answer(self):
        teacher = WebsocketCommunicator(
            application,
            f"/ws/quiz/123456?user_type=teacher&access_token={self.teacher_token}",
        )
        student = WebsocketCommunicator(
            application,
            "/ws/quiz/123456?user_type=student&nickname=Ana",
        )

        await teacher.connect()
        await teacher.receive_json_from()
        await student.connect()
        await student.receive_json_from()
        await teacher.receive_json_from()

        await teacher.send_json_to({"type": "start_game"})
        await teacher.receive_json_from()
        await student.receive_json_from()
        await sync_to_async(
            lambda: QuizSession.objects.filter(pin="123456").update(
                question_started_at=timezone.now() - timedelta(seconds=21)
            )
        )()

        await student.send_json_to({
            "type": "submit_answer",
            "question_id": self.question.id,
            "option_id": self.correct_option.id,
            "response_time": 1,
        })
        error = await student.receive_json_from()
        self.assertEqual(error["type"], "error")
        self.assertEqual(error["message"], "This question's time has expired.")

        await teacher.disconnect()
        await student.disconnect()

    async def _assert_rejects_duplicate_nickname(self):
        first_student = WebsocketCommunicator(
            application,
            "/ws/quiz/123456?user_type=student&nickname=Ana",
        )
        second_student = WebsocketCommunicator(
            application,
            "/ws/quiz/123456?user_type=student&nickname=Ana",
        )

        first_connected, _ = await first_student.connect()
        self.assertTrue(first_connected)
        await first_student.receive_json_from()

        second_connected, _ = await second_student.connect()
        self.assertFalse(second_connected)

        await first_student.disconnect()

    async def _assert_rejects_non_current_answer(self, question_id, option_id):
        teacher = WebsocketCommunicator(
            application,
            f"/ws/quiz/123456?user_type=teacher&access_token={self.teacher_token}",
        )
        student = WebsocketCommunicator(
            application,
            "/ws/quiz/123456?user_type=student&nickname=Ana",
        )

        await teacher.connect()
        await teacher.receive_json_from()
        await student.connect()
        await student.receive_json_from()
        await teacher.receive_json_from()

        await teacher.send_json_to({"type": "start_game"})
        await teacher.receive_json_from()
        await student.receive_json_from()

        await student.send_json_to({
            "type": "submit_answer",
            "question_id": question_id,
            "option_id": option_id,
            "response_time": 250,
        })
        error = await student.receive_json_from()
        self.assertEqual(error["type"], "error")
        self.assertEqual(
            error["message"], "That question is no longer accepting answers."
        )

        await teacher.disconnect()
        await student.disconnect()


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
        res = self.client.post("/quizzes/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        return res.json()

    def test_quizzes_are_private_by_default(self):
        quiz = self._create()
        self.assertFalse(quiz["is_public"])
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.get("/quizzes/?scope=library").json(), [])
        self.assertEqual(self.client.get(f"/quizzes/{quiz['id']}").status_code, 404)

    def test_public_quiz_is_listed_and_cloneable_by_other_teacher(self):
        quiz = self._create(is_public=True)
        self.client.force_authenticate(user=self.other)

        library = self.client.get("/quizzes/?scope=library").json()
        self.assertEqual([q["id"] for q in library], [quiz["id"]])
        self.assertEqual(self.client.get("/quizzes/").json(), [])
        self.assertEqual(self.client.get(f"/quizzes/{quiz['id']}").status_code, 200)
        # Library quizzes are read-only for non-owners.
        self.assertEqual(
            self.client.put(f"/quizzes/{quiz['id']}", {"title": "Hacked"}, format="json").status_code, 404)

        copy = self.client.post(f"/quizzes/{quiz['id']}/clone").json()
        self.assertNotEqual(copy["id"], quiz["id"])
        self.assertFalse(copy["is_public"])
        self.assertEqual(copy["teacher_id"], self.other.pk)
        self.assertEqual(len(copy["questions"][0]["options"]), 2)

    def test_owner_can_toggle_visibility(self):
        quiz = self._create(is_public=True)
        res = self.client.put(f"/quizzes/{quiz['id']}", {"is_public": False}, format="json")
        self.assertFalse(res.json()["is_public"])
