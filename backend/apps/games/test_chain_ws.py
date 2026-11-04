from datetime import timedelta

from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.testing import default_section
from apps.accounts.views import _issue_token
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from config.asgi import application
from . import engine
from .models import ChainAnswerGame, GamePlayer

User = get_user_model()


def token_for(user):
    return _issue_token(user, user.role, "access", timedelta(minutes=10))


class ChainSocketBase(TransactionTestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, **kw):
            return User.objects.create_user(email=email, role=role, first_name=email.split("@")[0], last_name="X", **kw)

        self.teacher = make("t@x.com", "TEACHER", department=department)
        self.rival = make("r@x.com", "TEACHER", department=department)
        self.alice = make("alice@x.com", "STUDENT", register_no="R1")
        self.bob = make("bob@x.com", "STUDENT", register_no="R2")
        self.zed = make("zed@x.com", "STUDENT", register_no="R9")
        self.course = Classroom.objects.create(name="Eng", subject_code="E1", teacher=self.teacher, department=department, program=program, batch=batch)
        other = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.alice, self.bob):
            Enrollment.objects.create(classroom=self.course, student=student)
        Enrollment.objects.create(classroom=other, student=self.zed)
        self.game = ChainAnswerGame.objects.create(session_id="game_ws1", teacher=self.teacher, name="WS", starting_word="apple", ai_suggestions='["x"]')
        self.sid = self.game.session_id

    def comm(self, user=None, sid=None, token=None):
        query = f"?access_token={token if token is not None else token_for(user)}" if (user or token is not None) else ""
        return WebsocketCommunicator(application, f"/ws/games/chain-answer/{sid or self.sid}{query}")

    async def state(self, communicator, event=None, timeout=3):
        """The next ``state`` message (skipping others), optionally the first one for a given event."""
        while True:
            message = await communicator.receive_json_from(timeout=timeout)
            if message["type"] == "state" and (event is None or message["event"] == event):
                return message


class ConnectTests(ChainSocketBase):
    def test_connections_without_a_valid_login_or_access_are_closed(self):
        async_to_sync(self._connections)()

    async def _connections(self):
        for communicator, code in (
            (self.comm(), 4401),
            (self.comm(token="not-a-token"), 4401),
            (self.comm(self.alice, sid="game_missing"), 4404),
            (self.comm(self.zed), 4403),     # another teacher's student
            (self.comm(self.rival), 4403),   # another teacher
        ):
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, code)

    def test_the_role_comes_from_the_token_not_the_url(self):
        async_to_sync(self._role)()

    async def _role(self):
        student = WebsocketCommunicator(application, f"/ws/games/chain-answer/{self.sid}?user_type=teacher&access_token={token_for(self.alice)}")
        await student.connect()
        await self.state(student, "initial")
        await student.send_json_to({"type": "start_game"})
        error = await student.receive_json_from(timeout=3)
        self.assertEqual((error["type"], error["code"]), ("error", 403))
        await student.disconnect()

    def test_each_viewer_gets_their_own_snapshot(self):
        async_to_sync(self._snapshots)()

    async def _snapshots(self):
        teacher, student = self.comm(self.teacher), self.comm(self.alice)
        await teacher.connect()
        await student.connect()
        self.assertIn("ai_suggestions", (await self.state(teacher, "initial"))["game"])
        self.assertNotIn("ai_suggestions", (await self.state(student, "initial"))["game"])
        await teacher.disconnect()
        await student.disconnect()


class PlayTests(ChainSocketBase):
    def test_a_whole_game_over_the_socket(self):
        async_to_sync(self._play)()

    async def _play(self):
        teacher, alice, bob = self.comm(self.teacher), self.comm(self.alice), self.comm(self.bob)
        for c in (teacher, alice, bob):
            await c.connect()
            await self.state(c, "initial")

        await alice.send_json_to({"type": "join"})
        await bob.send_json_to({"type": "join"})
        for c in (teacher, alice, bob):
            self.assertEqual(len((await self.state(c, "player_joined"))["game"]["players"]) >= 1, True)
        # drain the second join broadcast so later reads start clean
        for c in (teacher, alice, bob):
            await self.state(c, "player_joined")

        await teacher.send_json_to({"type": "start_game"})
        started = await self.state(alice, "started")
        self.assertEqual([w["word"] for w in started["game"]["chain"]], ["apple"])
        self.assertEqual(started["game"]["current_player_index"], 0)
        await self.state(teacher, "started")
        await self.state(bob, "started")

        # Bob is not first, so his word is refused privately and nothing is broadcast.
        await bob.send_json_to({"type": "submit_word", "word": "elephant"})
        error = await bob.receive_json_from(timeout=3)
        self.assertEqual((error["type"], error["code"]), ("error", 409))
        self.assertTrue(await alice.receive_nothing())

        await alice.send_json_to({"type": "submit_word", "word": "elephant"})
        for c in (teacher, alice, bob):
            accepted = await self.state(c, "word_accepted")
        self.assertEqual([w["word"] for w in accepted["game"]["chain"]], ["apple", "elephant"])
        self.assertEqual(accepted["game"]["current_player_index"], 1)

        # A wrong word: the sender learns why, the others only see that a word was rejected.
        await bob.send_json_to({"type": "submit_word", "word": "zzzq"})
        mine = await self.state(bob, "word_rejected")
        theirs = await self.state(alice, "word_rejected")
        self.assertIn("reason", mine["detail"])
        self.assertEqual(theirs["detail"], {})
        self.assertEqual(theirs["game"]["current_player_index"], 1)  # still Bob's turn

        await teacher.send_json_to({"type": "end_game"})
        for c in (teacher, alice, bob):
            ended = await self.state(c, "ended")
        self.assertEqual(ended["game"]["status"], "completed")
        scores = await sync_to_async(lambda: {a.student_id: a.score for a in StudentActivity.objects.filter(activity_type="game")})()
        self.assertEqual(scores, {self.alice.pk: 10.0, self.bob.pk: 0.0})
        for c in (teacher, alice, bob):
            await c.disconnect()

    def test_pause_and_resume_reach_everyone(self):
        async_to_sync(self._pause)()

    async def _pause(self):
        await sync_to_async(self._seed_two_players_and_start)()
        teacher, alice = self.comm(self.teacher), self.comm(self.alice)
        await teacher.connect()
        await alice.connect()
        await self.state(teacher, "initial")
        await self.state(alice, "initial")
        await teacher.send_json_to({"type": "pause_game"})
        self.assertEqual((await self.state(alice, "paused"))["game"]["status"], "paused")
        await alice.send_json_to({"type": "submit_word", "word": "elephant"})
        self.assertEqual((await self.state_or_error(alice))["type"], "error")
        await teacher.send_json_to({"type": "resume_game"})
        self.assertEqual((await self.state(alice, "resumed"))["game"]["status"], "active")
        await teacher.disconnect()
        await alice.disconnect()

    async def state_or_error(self, communicator):
        while True:
            message = await communicator.receive_json_from(timeout=3)
            if message["type"] == "error":
                return message

    def _seed_two_players_and_start(self):
        for student in (self.alice, self.bob):
            engine.join(self.sid, student)
        engine.start(self.sid)

    def test_a_turn_times_out_on_the_server_with_nobody_sending_anything(self):
        async_to_sync(self._timeout)()

    async def _timeout(self):
        await sync_to_async(self._seed_two_players_and_start)()
        original = engine.GRACE_SECONDS
        engine.GRACE_SECONDS = 0
        try:
            await sync_to_async(lambda: ChainAnswerGame.objects.filter(pk=self.game.pk).update(turn_deadline=timezone.now() + timedelta(seconds=0.4)))()
            alice = self.comm(self.alice)
            await alice.connect()
            first = await self.state(alice, "initial")
            self.assertEqual(first["game"]["current_player_index"], 0)
            skipped = await self.state(alice, "turn_skipped", timeout=5)
            self.assertEqual(skipped["game"]["current_player_index"], 1)
            self.assertGreater(skipped["game"]["time_left"], 20)
            await alice.disconnect()
        finally:
            engine.GRACE_SECONDS = original
