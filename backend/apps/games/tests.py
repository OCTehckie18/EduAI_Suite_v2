from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.test import TestCase, TransactionTestCase

from config.asgi import application
from .models import WordCloudSession


class WordCloudApiTests(TestCase):
    def test_create_and_read_session(self):
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.post(
            "/api/v1/wordcloud/create",
            {"prompt": "Name one renewable energy source"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        pin = response.json()["pin"]
        detail = client.get(f"/api/v1/wordcloud/{pin}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["prompt"], "Name one renewable energy source")


class WordCloudWebSocketTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        WordCloudSession.objects.create(pin="123456", prompt="Describe learning")

    def test_student_submission_reaches_teacher(self):
        async_to_sync(self._assert_word_cloud_flow)()

    async def _assert_word_cloud_flow(self):
        teacher = WebsocketCommunicator(
            application, "/ws/wordcloud/123456?role=teacher"
        )
        student = WebsocketCommunicator(
            application, "/ws/wordcloud/123456?role=student&student_name=Ana"
        )

        teacher_connected, _ = await teacher.connect()
        student_connected, _ = await student.connect()
        self.assertTrue(teacher_connected)
        self.assertTrue(student_connected)
        self.assertEqual(
            (await teacher.receive_json_from())["words"], []
        )

        await student.send_json_to({"type": "submit_word", "word": "Collaboration"})
        student_messages = {
            (await student.receive_json_from())["type"],
            (await student.receive_json_from())["type"],
        }
        self.assertEqual(student_messages, {"cloud_update", "word_submitted"})
        self.assertEqual(
            (await teacher.receive_json_from())["words"],
            [{"text": "collaboration", "value": 1}],
        )

        await teacher.send_json_to({"type": "end_session"})
        self.assertEqual(
            (await teacher.receive_json_from())["type"], "session_ended"
        )
        self.assertEqual(
            (await student.receive_json_from())["type"], "session_ended"
        )

        await teacher.disconnect()
        await student.disconnect()
