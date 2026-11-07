import jwt
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import default_section
from apps.classrooms.models import Classroom, Enrollment
from config.asgi import application


def token(user):
    return jwt.encode({"sub": str(user.pk), "type": "access"}, settings.JWT_SECRET_KEY, algorithm="HS256")


class RestActionsReachLiveScreens(TransactionTestCase):
    """The teacher's buttons use REST. Players watching over the WebSocket must still see the change."""

    reset_sequences = True

    def setUp(self):
        section = default_section()
        batch = section.batch
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", first_name="T")
        self.ann = User.objects.create_user(email="a@x.com", password="x", role="STUDENT", first_name="Ann")
        self.bob = User.objects.create_user(email="b@x.com", password="x", role="STUDENT", first_name="Bob")
        course = Classroom.objects.create(
            name="C", subject_code="C1", teacher=self.teacher, department=batch.program.department,
            program=batch.program, batch=batch, section=section,
        )
        for s in (self.ann, self.bob):
            Enrollment.objects.create(classroom=course, student=s)
        client = APIClient()
        client.force_authenticate(self.teacher)
        res = client.post("/api/v1/games/chain-answer", {
            "course_id": course.pk, "starting_word": "apple", "time_per_turn": 30, "chain_variation": "standard",
            "players": [{"student_id": self.ann.pk}, {"student_id": self.bob.pk}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.session = res.json()["session_id"]
        self.teacher_api = client

    def test_starting_over_rest_tells_a_waiting_player(self):
        async def run():
            comm = WebsocketCommunicator(application, f"/ws/games/chain-answer/{self.session}?access_token={token(self.ann)}")
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            first = await comm.receive_json_from()
            self.assertEqual(first["event"], "initial")
            from asgiref.sync import sync_to_async

            res = await sync_to_async(self.teacher_api.post)(f"/api/v1/games/chain-answer/{self.session}/start", {}, format="json")
            self.assertEqual(res.status_code, 200)
            update = await comm.receive_json_from(timeout=3)
            self.assertEqual(update["event"], "started")
            self.assertEqual(update["game"]["status"], "active")
            await comm.disconnect()

        async_to_sync(run)()
