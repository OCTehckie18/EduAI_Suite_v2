"""Security regression: only the quiz's own teacher (or a Master Admin) may host or preview a live quiz over the websocket."""
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase

from apps.accounts.views import _issue_token

from .models import Quiz, QuizSession
from .routing import websocket_urlpatterns

User = get_user_model()
PIN = "424242"
application = URLRouter(websocket_urlpatterns)


def token(user):
    from datetime import timedelta

    return _issue_token(user, user.role, "access", timedelta(minutes=5))


class QuizHostOwnershipTests(TransactionTestCase):
    def setUp(self):
        approved = dict(password="pw", role="TEACHER", approval_status="APPROVED")
        self.owner = User.objects.create_user(email="owner@example.com", **approved)
        self.other = User.objects.create_user(email="other@example.com", **approved)
        self.admin = User.objects.create_user(email="m@example.com", password="pw", role="MASTER_ADMIN")
        self.quiz = Quiz.objects.create(title="Q", teacher_id=self.owner.pk)
        QuizSession.objects.create(quiz=self.quiz, pin=PIN, status="lobby")

    async def connect(self, user, kind="teacher"):
        communicator = WebsocketCommunicator(application, f"/ws/quiz/{PIN}?user_type={kind}&access_token={token(user)}")
        connected, code = await communicator.connect()
        await communicator.disconnect() if connected else None
        return connected, code

    async def test_another_teacher_is_refused(self):
        connected, code = await self.connect(self.other)
        self.assertFalse(connected)
        self.assertEqual(code, 4403)
        connected, _ = await self.connect(self.other, "teacher_player")
        self.assertFalse(connected)

    async def test_the_owner_and_a_master_admin_can_host(self):
        self.assertTrue((await self.connect(self.owner))[0])
        self.assertTrue((await self.connect(self.admin))[0])
