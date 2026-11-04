from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.classrooms.models import Classroom, Enrollment
from apps.core.models import StudentActivity
from .models import ChainAnswerGame, GamePlayer, GameWord

User = get_user_model()
BASE = "/api/v1/games/chain-answer"


class ChainBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, **kw):
            return User.objects.create_user(email=email, role=role, first_name=email.split("@")[0], last_name="X", **kw)

        self.teacher = make("t@x.com", "TEACHER", department=department)
        self.rival = make("r@x.com", "TEACHER", department=department)
        self.admin = make("m@x.com", "MASTER_ADMIN")
        self.alice = make("alice@x.com", "STUDENT", register_no="R1")
        self.bob = make("bob@x.com", "STUDENT", register_no="R2")
        self.zed = make("zed@x.com", "STUDENT", register_no="R9")  # the rival's student
        self.course = Classroom.objects.create(name="Eng", subject_code="E1", teacher=self.teacher, department=department, program=program, batch=batch)
        self.other = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.alice, self.bob):
            Enrollment.objects.create(classroom=self.course, student=student)
        Enrollment.objects.create(classroom=self.other, student=self.zed)

    def create(self, user=None, **extra):
        self.client.force_authenticate(user or self.teacher)
        body = {"name": "Chain", "starting_word": "apple"}
        body.update(extra)
        return self.client.post(BASE, body, format="json")

    def game(self, **extra):
        response = self.create(**extra)
        self.assertEqual(response.status_code, 201, response.content)
        return ChainAnswerGame.objects.get(session_id=response.json()["session_id"])


class CreateTests(ChainBase):
    def test_the_teacher_comes_from_the_login_not_the_request(self):
        game = self.game(teacher_id=self.rival.pk)
        self.assertEqual(game.teacher_id, self.teacher.pk)

    def test_students_and_anonymous_users_cannot_create_games(self):
        self.assertEqual(self.create(user=self.alice).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(BASE, {"name": "x"}, format="json").status_code, (401, 403))
        self.assertEqual(ChainAnswerGame.objects.count(), 0)

    def test_players_are_the_teachers_own_students_found_by_account(self):
        game = self.game(players=[{"student_id": self.alice.pk}, self.bob.pk, {"student_id": "R1"}])
        self.assertEqual(list(game.players.values_list("student_id", "name")), [(self.alice.pk, "alice X"), (self.bob.pk, "bob X")])

    def test_another_teachers_student_or_a_made_up_one_is_refused(self):
        self.assertEqual(self.create(players=[self.zed.pk]).status_code, 400)
        self.assertEqual(self.create(players=[999999]).status_code, 400)
        self.assertEqual(ChainAnswerGame.objects.count(), 0)

    def test_bad_settings_are_a_400_not_a_crash(self):
        for extra in ({"time_per_turn": "abc"}, {"time_per_turn": 1}, {"max_words": 0}, {"max_words": "x"},
                      {"chain_variation": "geography"}, {"starting_word": "a1"}, {"name": "x" * 300}):
            self.assertEqual(self.create(**extra).status_code, 400, extra)
        self.assertEqual(ChainAnswerGame.objects.count(), 0)


class AccessTests(ChainBase):
    def setUp(self):
        super().setUp()
        self.g = self.game(players=[self.alice.pk])
        self.url = f"{BASE}/{self.g.session_id}"

    def call(self, user, method, suffix="", **body):
        self.client.force_authenticate(user)
        return getattr(self.client, method)(self.url + suffix, body or None, format="json")

    def test_only_the_owner_or_an_admin_can_start_end_edit_or_delete(self):
        for user in (self.alice, self.rival, self.zed):
            self.assertEqual(self.call(user, "post", "/start").status_code, 403, user.email)
            self.assertEqual(self.call(user, "post", "/end").status_code, 403, user.email)
            self.assertEqual(self.call(user, "put", name="hacked").status_code, 403, user.email)
            self.assertEqual(self.call(user, "delete").status_code, 403, user.email)
        self.g.refresh_from_db()
        self.assertEqual((self.g.status, self.g.name), ("setup", "Chain"))
        self.assertEqual(self.call(self.admin, "post", "/start").status_code, 200)

    def test_the_owner_can_edit_while_in_setup_but_not_set_a_status(self):
        self.assertEqual(self.call(self.teacher, "put", name="Renamed", status="hacked").status_code, 200)
        self.g.refresh_from_db()
        self.assertEqual((self.g.name, self.g.status), ("Renamed", "setup"))
        self.call(self.teacher, "post", "/start")
        self.assertEqual(self.call(self.teacher, "put", name="Late").status_code, 409)

    def test_the_owner_can_delete_the_game(self):
        self.assertEqual(self.call(self.teacher, "delete").status_code, 204)
        self.assertFalse(ChainAnswerGame.objects.exists())

    def test_who_can_read_a_game(self):
        self.assertEqual(self.call(self.teacher, "get").status_code, 200)
        self.assertEqual(self.call(self.alice, "get").status_code, 200)   # a listed player
        self.assertEqual(self.call(self.bob, "get").status_code, 200)     # the teacher's student, may open the join page
        self.assertEqual(self.call(self.zed, "get").status_code, 403)     # another teacher's student
        self.assertEqual(self.call(self.rival, "get").status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_players_do_not_see_the_teachers_ai_suggestions_or_register_numbers(self):
        ChainAnswerGame.objects.filter(pk=self.g.pk).update(ai_suggestions='["x"]')
        self.assertIn("ai_suggestions", self.call(self.teacher, "get").json())
        player_view = self.call(self.alice, "get").json()
        self.assertNotIn("ai_suggestions", player_view)
        self.assertNotIn("R1", str(player_view))

    def test_the_list_shows_only_your_own_games(self):
        self.client.force_authenticate(self.rival)
        self.client.post(BASE, {"name": "Rival game", "starting_word": "pear"}, format="json")
        self.client.force_authenticate(self.teacher)
        self.assertEqual([g["name"] for g in self.client.get(BASE).json()], ["Chain"])
        self.client.force_authenticate(self.alice)
        self.assertEqual([g["name"] for g in self.client.get(BASE).json()], ["Chain"])  # only games she is in
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get(BASE).json(), [])


class JoinTests(ChainBase):
    def setUp(self):
        super().setUp()
        self.g = self.game()
        self.url = f"{BASE}/{self.g.session_id}/join"

    def join(self, user, **body):
        self.client.force_authenticate(user)
        return self.client.post(self.url, body, format="json")

    def test_a_student_joins_as_themselves_whatever_the_body_says(self):
        response = self.join(self.alice, name="Somebody Else", student_id=self.bob.pk)
        self.assertEqual(response.status_code, 201)
        player = GamePlayer.objects.get()
        self.assertEqual((player.student_id, player.name), (self.alice.pk, "alice X"))

    def test_joining_twice_does_not_create_or_take_over_a_player(self):
        self.join(self.alice)
        again = self.join(self.alice)
        self.assertEqual((again.status_code, GamePlayer.objects.count()), (200, 1))
        # A different student with the same display name gets a separate row.
        User.objects.filter(pk=self.bob.pk).update(first_name="alice", last_name="X")
        self.join(self.bob)
        self.assertEqual(GamePlayer.objects.count(), 2)

    def test_only_the_teachers_students_can_join_and_finished_games_are_closed(self):
        self.assertEqual(self.join(self.zed).status_code, 403)
        self.assertEqual(self.join(self.teacher).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(self.url, {}, format="json").status_code, (401, 403))
        ChainAnswerGame.objects.filter(pk=self.g.pk).update(status="completed")
        self.assertEqual(self.join(self.alice).status_code, 409)


class SubmitIdentityTests(ChainBase):
    def setUp(self):
        super().setUp()
        self.g = self.game(players=[self.alice.pk, self.bob.pk])
        self.client.force_authenticate(self.teacher)
        self.client.post(f"{BASE}/{self.g.session_id}/start")
        self.url = f"{BASE}/{self.g.session_id}/words"

    def submit(self, user, word="elephant", **body):
        self.client.force_authenticate(user)
        return self.client.post(self.url, {"word": word, **body}, format="json")

    def test_the_player_is_the_logged_in_student_not_a_name_in_the_body(self):
        response = self.submit(self.alice, submitted_by="bob X", student_id=self.bob.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(GameWord.objects.exclude(submitted_by="system").get().submitted_by, "alice X")
        self.assertEqual(GamePlayer.objects.get(student=self.alice).words_submitted, 1)
        self.assertEqual(GamePlayer.objects.get(student=self.bob).words_submitted, 0)

    def test_marks_are_written_only_to_the_submitting_account(self):
        self.submit(self.alice)
        self.assertEqual(list(StudentActivity.objects.filter(activity_type="game").values_list("student_id", flat=True)), [self.alice.pk])

    def test_non_players_anonymous_users_and_teachers_cannot_submit(self):
        self.assertEqual(self.submit(self.zed).status_code, 403)
        self.assertEqual(self.submit(self.teacher).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(self.url, {"word": "elephant"}, format="json").status_code, (401, 403))
        self.assertEqual(GameWord.objects.exclude(submitted_by="system").count(), 0)
        self.assertEqual(StudentActivity.objects.count(), 0)


class HelperEndpointTests(ChainBase):
    def test_helpers_need_login_and_survive_bad_input(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.post("/api/v1/games/validate-word", {"word": "apple"}, format="json").status_code, (401, 403))
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.post("/api/v1/games/word-suggestions", {"count": "abc"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/games/validate-word", {"word": "apple", "used_words": "x"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/games/validate-word", {"word": "apple"}, format="json").status_code, 200)
