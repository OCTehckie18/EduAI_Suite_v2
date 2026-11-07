import jwt
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from config.asgi import application
from .models import WordCloudSession

User = get_user_model()


def token_for(user):
    return jwt.encode({"sub": str(user.pk), "type": "access"}, settings.JWT_SECRET_KEY, algorithm="HS256")


def person(email, role):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0], is_active=True)


class WordCloudApiTests(TestCase):
    def setUp(self):
        self.teacher = person("wc-teacher@example.com", "TEACHER")
        self.other = person("wc-other@example.com", "TEACHER")
        self.student = person("wc-student@example.com", "STUDENT")

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_create_and_read_session(self):
        client = self.api(self.teacher)
        response = client.post("/api/v1/wordcloud/create", {"prompt": "Name one renewable energy source"}, format="json")
        self.assertEqual(response.status_code, 201)
        pin = response.json()["pin"]
        detail = client.get(f"/api/v1/wordcloud/{pin}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["prompt"], "Name one renewable energy source")
        # students can open it to join
        self.assertEqual(self.api(self.student).get(f"/api/v1/wordcloud/{pin}").status_code, 200)

    def test_the_host_is_the_signed_in_teacher_whatever_the_request_says(self):
        res = self.api(self.teacher).post("/api/v1/wordcloud/create", {"prompt": "x", "teacher_id": self.other.pk}, format="json")
        self.assertEqual(WordCloudSession.objects.get(pin=res.json()["pin"]).teacher_id, self.teacher.pk)

    def test_students_cannot_start_or_list_clouds(self):
        self.assertEqual(self.api(self.student).post("/api/v1/wordcloud/create", {"prompt": "x"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.student).get("/api/v1/wordcloud/create").status_code, 403)
        self.assertEqual(WordCloudSession.objects.count(), 0)

    def test_a_teacher_lists_and_deletes_only_their_own(self):
        pin = self.api(self.teacher).post("/api/v1/wordcloud/create", {"prompt": "x"}, format="json").json()["pin"]
        self.assertEqual(self.api(self.other).get("/api/v1/wordcloud/create").json(), [])
        self.assertEqual(self.api(self.other).delete(f"/api/v1/wordcloud/{pin}").status_code, 403)
        self.assertEqual(self.api(self.student).delete(f"/api/v1/wordcloud/{pin}").status_code, 403)
        self.assertTrue(WordCloudSession.objects.filter(pin=pin).exists())
        self.assertEqual(self.api(self.teacher).delete(f"/api/v1/wordcloud/{pin}").status_code, 200)


class WordCloudWebSocketTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.teacher = person("wc-teacher@example.com", "TEACHER")
        self.other = person("wc-other@example.com", "TEACHER")
        self.student = person("wc-student@example.com", "STUDENT")
        WordCloudSession.objects.create(pin="123456", prompt="Describe learning", teacher_id=self.teacher.pk)

    def url(self, role, user=None, extra=""):
        token = f"&access_token={token_for(user)}" if user else ""
        return f"/ws/wordcloud/123456?role={role}{token}{extra}"

    def test_student_submission_reaches_teacher(self):
        async_to_sync(self._assert_word_cloud_flow)()

    async def _assert_word_cloud_flow(self):
        teacher = WebsocketCommunicator(application, self.url("teacher", self.teacher))
        student = WebsocketCommunicator(application, self.url("student", self.student, "&student_name=Impostor"))

        teacher_connected, _ = await teacher.connect()
        student_connected, _ = await student.connect()
        self.assertTrue(teacher_connected)
        self.assertTrue(student_connected)
        self.assertEqual((await teacher.receive_json_from())["words"], [])

        await student.send_json_to({"type": "submit_word", "word": "Collaboration"})
        student_messages = {(await student.receive_json_from())["type"], (await student.receive_json_from())["type"]}
        self.assertEqual(student_messages, {"cloud_update", "word_submitted"})
        self.assertEqual((await teacher.receive_json_from())["words"], [{"text": "collaboration", "value": 1}])

        await teacher.send_json_to({"type": "end_session"})
        self.assertEqual((await teacher.receive_json_from())["type"], "session_ended")
        self.assertEqual((await student.receive_json_from())["type"], "session_ended")

        await teacher.disconnect()
        await student.disconnect()

    def test_the_submitter_is_the_signed_in_student_not_a_query_name(self):
        async def run():
            student = WebsocketCommunicator(application, self.url("student", self.student, "&student_name=Impostor"))
            await student.connect()
            await student.send_json_to({"type": "submit_word", "word": "hello"})
            await student.receive_json_from()
            await student.receive_json_from()
            await student.disconnect()
        async_to_sync(run)()
        from .models import WordCloudSubmission
        self.assertEqual(WordCloudSubmission.objects.get().submitted_by, "wc-student")

    def test_nobody_connects_without_a_valid_token(self):
        async def run():
            for url in ("/ws/wordcloud/123456?role=teacher", "/ws/wordcloud/123456?role=student&access_token=bad"):
                comm = WebsocketCommunicator(application, url)
                connected, code = await comm.connect()
                self.assertFalse(connected, url)
                self.assertEqual(code, 4401)
        async_to_sync(run)()

    def test_only_the_host_may_connect_as_teacher(self):
        async def run():
            for user in (self.other, self.student):
                comm = WebsocketCommunicator(application, self.url("teacher", user))
                connected, code = await comm.connect()
                self.assertFalse(connected)
                self.assertEqual(code, 4403)
            teachers_as_student = WebsocketCommunicator(application, self.url("student", self.teacher))
            connected, code = await teachers_as_student.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4403)
        async_to_sync(run)()
