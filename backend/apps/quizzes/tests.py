from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
import jwt

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
        question = QuizQuestion.objects.create(
            quiz=quiz,
            question_text="Which answer is correct?",
            time_limit=20,
            points=1000,
        )
        QuizOption.objects.create(
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
            "question_id": 1,
            "option_id": 1,
            "response_time": 250,
        })
        self.assertEqual((await student.receive_json_from())["type"], "answer_submitted")
        self.assertEqual((await teacher.receive_json_from())["type"], "answer_count_update")
        self.assertEqual((await student.receive_json_from())["type"], "answer_count_update")

        await teacher.send_json_to({"type": "time_up", "question_id": 1})
        self.assertEqual((await teacher.receive_json_from())["type"], "show_results")
        self.assertEqual((await student.receive_json_from())["type"], "show_results")

        await teacher.send_json_to({"type": "next_question"})
        game_over = await teacher.receive_json_from()
        self.assertEqual(game_over["type"], "game_over")
        self.assertEqual((await student.receive_json_from())["type"], "game_over")

        await teacher.disconnect()
        await student.disconnect()

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
