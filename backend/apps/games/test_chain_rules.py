from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from apps.core.models import StudentActivity
from .models import ChainAnswerGame, GamePlayer, GameWord
from .test_chain_security import BASE, ChainBase


class RulesBase(ChainBase):
    def setUp(self):
        super().setUp()
        self.g = self.game(players=[self.alice.pk, self.bob.pk], time_per_turn=30)
        self.url = f"{BASE}/{self.g.session_id}"
        self.alice_p = GamePlayer.objects.get(student=self.alice)
        self.bob_p = GamePlayer.objects.get(student=self.bob)

    def post(self, user, suffix, **body):
        self.client.force_authenticate(user)
        return self.client.post(f"{self.url}{suffix}", body, format="json")

    def start(self):
        response = self.post(self.teacher, "/start")
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def say(self, user, word):
        return self.post(user, "/words", word=word)

    def reload(self):
        self.g.refresh_from_db()
        return self.g


class StartTests(RulesBase):
    def test_starting_sets_the_chain_and_gives_the_first_player_the_turn(self):
        body = self.start().json()
        self.assertEqual([w["word"] for w in body["chain"]], ["apple"])
        self.assertEqual((body["current_player_id"], body["current_player_index"]), (self.alice_p.id, 0))
        self.assertTrue(28 <= body["time_left"] <= 30)

    def test_a_game_needs_a_player_to_start_and_cannot_restart_after_ending(self):
        empty = self.game()
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(f"{BASE}/{empty.session_id}/start").status_code, 409)
        self.start()
        self.post(self.teacher, "/end")
        self.assertEqual(self.post(self.teacher, "/start").status_code, 409)


class WordRuleTests(RulesBase):
    def setUp(self):
        super().setUp()
        self.start()

    def test_turns_pass_in_order_and_out_of_turn_words_are_refused(self):
        self.assertEqual(self.say(self.bob, "elephant").status_code, 409)
        self.assertEqual(GameWord.objects.exclude(submitted_by="system").count(), 0)
        ok = self.say(self.alice, "elephant")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(self.reload().current_player_id, self.bob_p.id)
        self.assertEqual(self.say(self.alice, "tiger").status_code, 409)
        self.assertEqual(self.say(self.bob, "tiger").status_code, 201)
        self.assertEqual(self.reload().current_player_id, self.alice_p.id)  # round the table

    def test_a_rejected_word_never_joins_the_chain_and_the_player_may_retry(self):
        bad = self.say(self.alice, "zzzq").json()
        self.assertFalse(bad["validation"]["is_valid"])
        self.assertEqual(self.reload().current_player_id, self.alice_p.id)
        self.assertEqual([w["word"] for w in bad["game"]["chain"]], ["apple"])
        # The next accepted word still chains from the last accepted word, not from the rejected one.
        self.assertEqual(self.say(self.alice, "elephant").status_code, 201)
        self.assertEqual(GameWord.objects.get(word="elephant").position, 1)
        self.assertIsNone(GameWord.objects.get(word="zzzq").position)

    def test_chain_rule_and_repeats_are_enforced_on_the_server(self):
        self.assertFalse(self.say(self.alice, "tiger").json()["validation"]["is_valid"])  # must start with e
        self.say(self.alice, "elephant")
        self.say(self.bob, "tiger")
        self.say(self.alice, "rabbit")
        repeat = self.say(self.bob, "tiger").json()
        self.assertFalse(repeat["validation"]["is_valid"])

    def test_scoring_counters_and_penalty(self):
        ChainAnswerGame.objects.filter(pk=self.g.pk).update(penalty_on_invalid=True)
        self.say(self.alice, "zzzq")      # 0 minus 5 stays at 0
        self.say(self.alice, "elephant")  # plus 10
        self.say(self.bob, "qqqq")        # penalty floored at 0
        self.say(self.bob, "tiger")       # plus 10
        self.say(self.alice, "qqqq")      # 10 minus 5
        alice, bob = GamePlayer.objects.get(pk=self.alice_p.pk), GamePlayer.objects.get(pk=self.bob_p.pk)
        self.assertEqual((alice.score, alice.words_submitted, alice.words_valid), (5.0, 3, 1))
        self.assertEqual((bob.score, bob.words_submitted, bob.words_valid), (10.0, 2, 1))

    def test_the_database_refuses_two_words_in_the_same_place(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            GameWord.objects.create(game=self.g, word="egg", position=0, is_valid=True)

    def test_words_are_refused_before_start_after_end_and_while_paused(self):
        fresh = self.game(players=[self.alice.pk])
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.post(f"{BASE}/{fresh.session_id}/words", {"word": "elephant"}, format="json").status_code, 409)
        self.assertEqual(self.post(self.teacher, "/pause").status_code, 200)
        self.assertEqual(self.say(self.alice, "elephant").status_code, 409)
        self.post(self.teacher, "/resume")
        self.post(self.teacher, "/end")
        self.assertEqual(self.say(self.alice, "elephant").status_code, 409)
        self.assertEqual(GameWord.objects.exclude(submitted_by="system").filter(is_valid=True).count(), 0)


class CategoryTests(RulesBase):
    def test_category_games_accept_only_words_from_the_topic(self):
        game = self.game(players=[self.alice.pk], chain_variation="category", category="animals")
        self.client.force_authenticate(self.teacher)
        self.client.post(f"{BASE}/{game.session_id}/start")
        self.client.force_authenticate(self.alice)
        words = f"{BASE}/{game.session_id}/words"
        self.assertFalse(self.client.post(words, {"word": "table"}, format="json").json()["validation"]["is_valid"])
        self.assertTrue(self.client.post(words, {"word": "tiger"}, format="json").json()["validation"]["is_valid"])


class TimerTests(RulesBase):
    def setUp(self):
        super().setUp()
        self.start()

    def expire(self, seconds_ago):
        ChainAnswerGame.objects.filter(pk=self.g.pk).update(turn_deadline=timezone.now() - timedelta(seconds=seconds_ago))

    def test_a_late_word_is_refused_and_the_turn_moves_on(self):
        self.expire(10)
        response = self.say(self.alice, "elephant")
        self.assertEqual(response.status_code, 409)
        self.assertIn("Time ran out", response.json()["detail"])
        game = self.reload()
        self.assertEqual(game.current_player_id, self.bob_p.id)
        self.assertGreater(game.turn_deadline, timezone.now())
        self.assertEqual(GameWord.objects.exclude(submitted_by="system").count(), 0)

    def test_a_word_a_moment_after_the_deadline_still_counts(self):
        self.expire(1)
        self.assertEqual(self.say(self.alice, "elephant").status_code, 201)

    def test_reading_the_game_applies_a_due_timeout_without_any_websocket(self):
        self.expire(10)
        self.client.force_authenticate(self.alice)
        body = self.client.get(self.url).json()
        self.assertEqual(body["current_player_id"], self.bob_p.id)
        self.assertEqual(body["current_player_index"], 1)

    def test_pause_freezes_the_clock_and_resume_continues_from_it(self):
        ChainAnswerGame.objects.filter(pk=self.g.pk).update(turn_deadline=timezone.now() + timedelta(seconds=12))
        paused = self.post(self.teacher, "/pause").json()
        self.assertEqual(paused["status"], "paused")
        self.assertTrue(11 <= paused["time_left"] <= 12)
        self.assertIsNone(self.reload().turn_deadline)
        resumed = self.post(self.teacher, "/resume").json()
        self.assertEqual(resumed["status"], "active")
        self.assertTrue(10 <= resumed["time_left"] <= 12)

    def test_only_the_teacher_can_pause_resume_or_skip(self):
        for suffix in ("/pause", "/resume", "/skip"):
            self.assertEqual(self.post(self.alice, suffix).status_code, 403, suffix)
        self.assertEqual(self.post(self.teacher, "/skip").json()["current_player_id"], self.bob_p.id)


class EndingTests(RulesBase):
    def test_the_game_ends_by_itself_at_the_word_limit_and_saves_every_players_result(self):
        game = self.game(players=[self.alice.pk, self.bob.pk], max_words=2)
        self.client.force_authenticate(self.teacher)
        self.client.post(f"{BASE}/{game.session_id}/start")
        words = f"{BASE}/{game.session_id}/words"
        self.client.force_authenticate(self.alice)
        self.client.post(words, {"word": "elephant"}, format="json")
        self.client.force_authenticate(self.bob)
        self.client.post(words, {"word": "tiger"}, format="json")
        game.refresh_from_db()
        self.assertEqual(game.status, "completed")
        self.assertIsNone(game.current_player_id)
        self.assertIsNotNone(game.ended_at)
        activity = {a.student_id: (a.score, a.status) for a in StudentActivity.objects.filter(activity_type="game", source_id=str(game.id))}
        self.assertEqual(activity, {self.alice.pk: (10.0, "completed"), self.bob.pk: (10.0, "completed")})

    def test_ending_twice_is_harmless_and_unlinked_players_get_no_record(self):
        self.start()
        GamePlayer.objects.create(game=self.g, student=None, name="Guest", join_order=9)
        self.post(self.teacher, "/end")
        self.assertEqual(self.post(self.teacher, "/end").status_code, 200)
        self.assertEqual(StudentActivity.objects.filter(activity_type="game").count(), 2)


class RenumberMigrationTests(TransactionTestCase):
    before = [("games", "0003_chain_game_account_links"), ("accounts", "0004_admitted_student_roster")]
    after = [("games", "0004_chain_turn_state_and_word_positions"), ("accounts", "0004_admitted_student_roster")]

    def tearDown(self):
        # Put every app back at its latest migration, so later tests see the full schema (for example new User columns).
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_old_games_keep_their_chain_order_and_rejected_words_leave_the_chain(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        old = executor.loader.project_state(self.before).apps
        Game, Word = old.get_model("games", "ChainAnswerGame"), old.get_model("games", "GameWord")
        game = Game.objects.create(session_id="g_old", name="Old")
        for position, (word, valid) in enumerate([("apple", True), ("zzzq", False), ("elephant", True), ("tiger", True)]):
            Word.objects.create(game=game, word=word, is_valid=valid, position=position)

        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        new = executor.loader.project_state(self.after).apps.get_model("games", "GameWord")
        self.assertEqual(
            list(new.objects.order_by("id").values_list("word", "position")),
            [("apple", 0), ("zzzq", None), ("elephant", 1), ("tiger", 2)],
        )
