"""The rules of a Chain Answer game, kept in one place.

The REST views and the live WebSocket both call these functions, so a game behaves the same whichever
way it is played. The server owns everything that matters: whose turn it is, when it runs out, which
words are accepted, the scores, and the final results. Browsers only display it and send words.

Every function that changes a game runs in one transaction and locks the game row first, so two players
submitting at the same moment are handled one after the other.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.core.services import record_student_activity
from services.word_service import WordService
from .models import ChainAnswerGame, GamePlayer, GameWord

GRACE_SECONDS = 2  # allowance for network delay when a turn's time has just run out
POINTS_VALID = 10.0
POINTS_PENALTY = 5.0


class GameError(Exception):
    """A rule was broken. ``status`` is the HTTP code to use and ``message`` is safe to show the player."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------- reading
def lock(session_id):
    """The game row, locked for the rest of the surrounding transaction."""
    try:
        return ChainAnswerGame.objects.select_for_update().get(session_id=session_id)
    except ChainAnswerGame.DoesNotExist:
        raise GameError("Game not found.", 404)


def ordered_players(game):
    return list(game.players.exclude(status="left").order_by("join_order", "id"))


def chain(game):
    """The accepted words, in order."""
    return list(game.words.filter(is_valid=True).order_by("position"))


def anchor_word(game):
    words = chain(game)
    return words[-1].word if words else game.starting_word


def time_left(game):
    """Seconds left on the current turn (None when nothing is running)."""
    if game.status == "paused":
        return game.paused_remaining
    if game.status == "active" and game.turn_deadline:
        return max(0.0, (game.turn_deadline - timezone.now()).total_seconds())
    return None


# ---------------------------------------------------------------- turns
def _start_turn(game, player, seconds=None):
    game.current_player = player
    game.turn_deadline = timezone.now() + timedelta(seconds=seconds if seconds is not None else game.time_per_turn)
    game.paused_remaining = None


def _next_player(game, after):
    players = ordered_players(game)
    if not players:
        return None
    if after is None:
        return players[0]
    ids = [p.id for p in players]
    if after.id in ids:
        return players[(ids.index(after.id) + 1) % len(players)]
    # The player whose turn it was has left; carry on with the first player who joined after them.
    later = [p for p in players if (p.join_order, p.id) > (after.join_order, after.id)]
    return later[0] if later else players[0]


def _advance(game):
    _start_turn(game, _next_player(game, game.current_player))


def skip_if_overdue(game):
    """Move on when the current turn's time has run out. Returns True if the turn was skipped."""
    if game.status == "active" and game.turn_deadline and timezone.now() > game.turn_deadline + timedelta(seconds=GRACE_SECONDS):
        _advance(game)
        game.save(update_fields=["current_player", "turn_deadline", "paused_remaining"])
        return True
    return False


def refresh(session_id):
    """Apply a turn timeout if one is due (used when the game is read over plain HTTP, with no live timer)."""
    with transaction.atomic():
        game = lock(session_id)
        skip_if_overdue(game)
        return game


# ---------------------------------------------------------------- actions
def start(session_id):
    with transaction.atomic():
        game = lock(session_id)
        if game.status == "completed":
            raise GameError("This game has already finished.")
        if game.status == "active":
            return game
        if game.status == "paused":
            raise GameError("The game is paused. Resume it instead.")
        players = ordered_players(game)
        if not players:
            raise GameError("Wait for at least one player to join before starting.")
        if not game.words.exists():
            GameWord.objects.create(
                game=game, word=game.starting_word, submitted_by="system", is_valid=True,
                position=0, validation_reason="Starting word",
            )
        game.status = "active"
        game.started_at = game.started_at or timezone.now()
        _start_turn(game, players[0])
        game.save()
        return game


def pause(session_id):
    with transaction.atomic():
        game = lock(session_id)
        if game.status == "paused":
            return game
        if game.status != "active":
            raise GameError("Only a running game can be paused.")
        game.paused_remaining = time_left(game)
        game.status = "paused"
        game.turn_deadline = None
        game.save(update_fields=["status", "paused_remaining", "turn_deadline"])
        return game


def resume(session_id):
    with transaction.atomic():
        game = lock(session_id)
        if game.status == "active":
            return game
        if game.status != "paused":
            raise GameError("Only a paused game can be resumed.")
        game.status = "active"
        game.turn_deadline = timezone.now() + timedelta(seconds=game.paused_remaining or game.time_per_turn)
        game.paused_remaining = None
        game.save(update_fields=["status", "turn_deadline", "paused_remaining"])
        return game


def skip_turn(session_id):
    """The teacher moves to the next player."""
    with transaction.atomic():
        game = lock(session_id)
        if game.status != "active":
            raise GameError("The game is not running.")
        _advance(game)
        game.save(update_fields=["current_player", "turn_deadline", "paused_remaining"])
        return game


def _finish(game):
    """Close the game and write every linked player's final result to their record."""
    game.status = "completed"
    game.ended_at = timezone.now()
    game.turn_deadline = None
    game.paused_remaining = None
    game.current_player = None
    game.save()
    for player in game.players.select_related("student").all():
        if player.student_id:
            record_student_activity(
                student_id=player.student_id,
                activity_type="game",
                source_id=game.id,
                title=game.name or "Game Session",
                score=player.score,
                status="completed",
                occurred_at=game.ended_at,
            )


def end(session_id):
    with transaction.atomic():
        game = lock(session_id)
        if game.status != "completed":
            _finish(game)
        return game


def submit_word(session_id, user, raw_word):
    """A player's turn. Returns ``(game, word, validation)``. Raises ``GameError`` when it is not allowed."""
    outcome = None
    with transaction.atomic():
        game = lock(session_id)
        player = game.players.filter(student=user).first()
        if player is None:
            raise GameError("You are not a player in this game.", 403)
        if game.status == "completed":
            raise GameError("This game has finished.")
        if game.status == "paused":
            raise GameError("The game is paused.")
        if game.status != "active":
            raise GameError("The game has not started yet.")

        if skip_if_overdue(game):
            # The turn change is saved when this transaction commits; the error is raised after it, below.
            outcome = "timed_out"
        elif game.current_player_id != player.id:
            raise GameError("It is not your turn.")
        else:
            word = str(raw_word or "").strip()
            accepted = chain(game)
            used = [w.word for w in accepted]
            previous = accepted[-1].word if accepted else game.starting_word
            topic = game.category or game.subject
            result = WordService.validate_word(
                word=word, previous_word=previous, chain_variation=game.chain_variation, used_words=used, subject=topic,
            )

            GamePlayer.objects.filter(pk=player.pk).update(words_submitted=F("words_submitted") + 1)
            if result["is_valid"]:
                next_position = (accepted[-1].position + 1) if accepted else 1
                entry = GameWord.objects.create(
                    game=game, word=word, player=player, submitted_by=player.name, is_valid=True,
                    position=next_position, validation_reason=result["message"],
                )
                GamePlayer.objects.filter(pk=player.pk).update(words_valid=F("words_valid") + 1, score=F("score") + POINTS_VALID)
                counted = len(accepted)  # the starting word is not a player's word
                if game.max_words and counted >= game.max_words:
                    _finish(game)
                else:
                    _advance(game)
                    game.save(update_fields=["current_player", "turn_deadline", "paused_remaining"])
            else:
                # A wrong word is recorded but never joins the chain; the same player may try again until time is up.
                entry = GameWord.objects.create(
                    game=game, word=word, player=player, submitted_by=player.name, is_valid=False,
                    position=None, validation_reason=result["message"],
                )
                if game.penalty_on_invalid:
                    fresh = GamePlayer.objects.get(pk=player.pk)
                    GamePlayer.objects.filter(pk=player.pk).update(score=max(0.0, fresh.score - POINTS_PENALTY))
            game.refresh_from_db()
            outcome = (game, entry, result)

    if outcome == "timed_out":
        raise GameError("Time ran out, so the turn moved on.")
    return outcome
