import asyncio
import logging
import secrets
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from ..accounts.authentication import authenticate_access_token
from ..core.services import record_student_activity, resolve_student, student_key
from .report import percent_correct
from .models import QuizAnswer, QuizOption, QuizPlayer, QuizQuestion, QuizSession

logger = logging.getLogger(__name__)

OPTION_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"]

# Close codes the player pages turn into plain-language messages.
CLOSE_UNAUTHORISED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404
CLOSE_NICKNAME_TAKEN = 4409
CLOSE_KICKED = 4410
CLOSE_FINISHED = 4411
CLOSE_LOCKED = 4412

# Answers that land just after the limit (network delay) still count; the timer waits this long.
TIMER_GRACE_SECONDS = 0.3
STREAK_BONUS_STEP = 100
STREAK_BONUS_CAP = 500

# Timers that are already running, so a reconnecting teacher does not start a second one.
_armed_timers = set()
_timer_tasks = set()


class QuizConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.pin = self.scope["url_route"]["kwargs"]["pin"]
        query = parse_qs(self.scope.get("query_string", b"").decode())
        self.user_type = query.get("user_type", ["student"])[0]
        self.nickname = query.get("nickname", [""])[0].strip()[:100] or "Player"
        self.player_token = query.get("player_token", [""])[0]
        self.group_name = f"quiz_{self.pin}"
        self.student_id = None
        self.player_id = None

        # Signed-in students send their access token so results are saved against
        # the real account. The id comes from the verified token, never the client.
        if self.user_type == "student":
            access_token = query.get("access_token", [""])[0]
            if access_token:
                try:
                    student, _ = await sync_to_async(authenticate_access_token)(access_token)
                except Exception:
                    await self.refuse(CLOSE_UNAUTHORISED, "Your sign-in has expired. Please sign in again.")
                    return
                if getattr(student, "role", "") == "STUDENT":
                    self.student_id = student_key(student)

        if self.user_type in {"teacher", "teacher_player"}:
            access_token = query.get("access_token", [""])[0]
            if not access_token:
                await self.close(code=CLOSE_UNAUTHORISED)
                return
            try:
                self.user, _ = await sync_to_async(authenticate_access_token)(access_token)
            except Exception:
                await self.close(code=CLOSE_UNAUTHORISED)
                return
            if getattr(self.user, "role", "") not in {"TEACHER", "MASTER_ADMIN"}:
                await self.close(code=CLOSE_FORBIDDEN)
                return

        if not await self.session_exists():
            await self.refuse(CLOSE_NOT_FOUND, "No game found with that PIN. Check it and try again.")
            return

        if self.user_type == "teacher_player" and not await self.test_run_exists():
            await self.close(code=CLOSE_FORBIDDEN)
            return
        if self.user_type == "student" and await self.test_run_exists():
            await self.refuse(CLOSE_FORBIDDEN, "That game is a teacher test run and cannot be joined.")
            return

        if self.user_type in {"student", "teacher_player"}:
            joined = await self.join_player()
            if joined["error"]:
                await self.refuse(joined["code"], joined["error"])
                return
            self.player_id = joined["player_id"]

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        if self.player_id:
            await self.send_json({
                "type": "joined",
                "player_id": self.player_id,
                "token": joined["token"],
                "nickname": joined["nickname"],
            })
        await self.broadcast_lobby()
        await self.send_current_state()

    async def refuse(self, code, message):
        """Accept the socket just long enough to say why it is being closed, so the page can show it."""
        await self.accept()
        await self.send_json({"type": "error", "code": code, "message": message})
        await self.close(code=code)

    async def send_current_state(self):
        """Bring a late or returning connection up to date with where the game is."""
        session = await self.get_session_state()
        if session["status"] == "active":
            question = await self.get_current_question(session["current_question_index"])
            if question:
                message = await self.new_question_message(question, session["current_question_index"])
                message["question"]["time_left"] = session["time_left"]
                await self.send_json(message)
                await self.arm_timer(session)
        elif session["status"] == "result":
            await self.send_json(await self.results_message(session["current_question_index"]))
        elif session["status"] == "completed":
            await self.send_json({"type": "game_over", "leaderboard": await self.get_leaderboard()})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            await self.send_json({"type": "error", "message": "Invalid quiz message."})
            return

        message_type = content.get("type")

        if message_type == "start_game":
            await self.start_game()
        elif message_type == "submit_answer":
            await self.submit_answer(content)
        elif message_type in {"time_up", "show_results"}:
            await self.show_results()
        elif message_type == "next_question":
            await self.next_question()
        elif message_type == "kick_player":
            await self.kick_player(content)
        elif message_type == "lock_lobby":
            await self.lock_lobby(content)
        else:
            await self.send_json({"type": "error", "message": "Unknown quiz action."})

    async def quiz_broadcast(self, event):
        message = event["message"]
        if message.get("type") == "player_kicked":
            if self.player_id and message["player_id"] == self.player_id:
                await self.send_json({
                    "type": "kicked",
                    "code": CLOSE_KICKED,
                    "message": "The host removed you from the game.",
                })
                await self.close(code=CLOSE_KICKED)
            return
        await self.send_json(message)

    # ---- teacher actions -------------------------------------------------

    async def start_game(self):
        if self.user_type != "teacher":
            return

        session = await self.get_session_state()
        if not session["question_count"]:
            await self.send_json({"type": "error", "message": "Add at least one question before starting."})
            return

        started = await self.transition_session(
            expected_status="lobby",
            status="active",
            current_question_index=0,
            started_at=timezone.now(),
            question_started_at=timezone.now(),
        )
        if not started:
            return
        await self.announce_question(0)

    async def show_results(self):
        if self.user_type != "teacher":
            return
        session = await self.get_session_state()
        if session["status"] == "active":
            await self.finish_question(session["current_question_index"])

    async def next_question(self):
        if self.user_type != "teacher":
            return

        session = await self.get_session_state()
        if session["status"] == "active":
            await self.finish_question(session["current_question_index"])
            return
        if session["status"] != "result":
            return

        next_index = session["current_question_index"] + 1
        if next_index >= session["question_count"]:
            transitioned = await self.transition_session(
                expected_status="result",
                status="completed",
            )
            if not transitioned:
                return
            await self.record_results()
            await self.broadcast_json({
                "type": "game_over",
                "leaderboard": await self.get_leaderboard(),
            })
            return

        transitioned = await self.transition_session(
            expected_status="result",
            status="active",
            current_question_index=next_index,
            question_started_at=timezone.now(),
        )
        if not transitioned:
            return
        await self.announce_question(next_index)

    async def kick_player(self, content):
        if self.user_type != "teacher":
            return
        try:
            player_id = int(content["player_id"])
        except (KeyError, TypeError, ValueError):
            await self.send_json({"type": "error", "message": "Choose a player to remove."})
            return
        if not await self.remove_player(player_id):
            return
        await self.broadcast_json({"type": "player_kicked", "player_id": player_id})
        await self.broadcast_lobby()

    async def lock_lobby(self, content):
        if self.user_type != "teacher":
            return
        await self.update_session(lobby_locked=bool(content.get("locked", True)))
        await self.broadcast_lobby()

    # ---- game flow -------------------------------------------------------

    async def announce_question(self, index):
        question = await self.get_current_question(index)
        await self.broadcast_json(await self.new_question_message(question, index))
        await self.arm_timer(await self.get_session_state())

    async def arm_timer(self, session):
        """End the question on the server when its time runs out; nobody has to click anything."""
        if session["status"] != "active" or not session["question_started_at"]:
            return
        key = (self.pin, session["session_pk"], session["current_question_index"], session["question_started_at"])
        if key in _armed_timers:
            return
        _armed_timers.add(key)
        task = asyncio.get_running_loop().create_task(
            self.run_timer(key, session["current_question_index"], max(session["time_left"], 0) + TIMER_GRACE_SECONDS)
        )
        _timer_tasks.add(task)
        task.add_done_callback(_timer_tasks.discard)

    async def run_timer(self, key, index, delay):
        try:
            await asyncio.sleep(delay)
            await self.finish_question(index)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Quiz timer failed for game %s", self.pin)
        finally:
            _armed_timers.discard(key)

    async def finish_question(self, index):
        """Close the question and show the results. Safe to call twice: only the first call acts."""
        closed = await self.transition_session(
            expected_status="active",
            where={"current_question_index": index},
            status="result",
        )
        if closed:
            await self.broadcast_json(await self.results_message(index))

    async def submit_answer(self, content):
        if self.user_type not in {"student", "teacher_player"}:
            return

        session = await self.get_session_state()
        if session["status"] != "active" or not getattr(self, "player_id", None):
            await self.send_json({"type": "error", "message": "This question is not accepting answers."})
            return

        try:
            question_id = int(content["question_id"])
            option_id = int(content["option_id"])
        except (KeyError, TypeError, ValueError):
            await self.send_json({"type": "error", "message": "Invalid answer payload."})
            return

        result = await self.save_answer(
            player_id=self.player_id,
            question_id=question_id,
            option_id=option_id,
        )
        if result["error"]:
            await self.send_json({"type": "error", "message": result["error"]})
            return

        # Whether the answer was right is only revealed with everyone else's, when the question ends.
        await self.send_json({"type": "answer_submitted"})
        await self.broadcast_json({
            "type": "answer_count_update",
            "count": result["answer_count"],
            "players_total": result["players_total"],
        })
        if result["answer_count"] >= result["players_total"]:
            await self.finish_question(session["current_question_index"])

    async def results_message(self, index):
        result = await self.get_results(index)
        return {
            "type": "show_results",
            "stats": result["stats"],
            "correct_option_ids": result["correct_option_ids"],
            "scoreboard": result["scoreboard"],
            "answered": result["answered"],
            "players_total": len(result["scoreboard"]),
        }

    async def broadcast_lobby(self):
        session = await self.get_session_state()
        await self.broadcast_json({
            "type": "lobby_update",
            "players": await self.get_players(),
            "locked": session["lobby_locked"],
        })

    async def broadcast_json(self, message):
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "quiz_broadcast", "message": message},
        )

    # ---- database --------------------------------------------------------

    @database_sync_to_async
    def session_exists(self):
        return QuizSession.objects.filter(pin=self.pin).exists()

    @database_sync_to_async
    def test_run_exists(self):
        return QuizSession.objects.filter(pin=self.pin, is_test_run=True).exists()

    @database_sync_to_async
    def join_player(self):
        def seat(player):
            return {"error": None, "player_id": player.id, "token": player.token, "nickname": player.nickname}

        def refusal(code, message):
            return {"error": message, "code": code}

        try:
            with transaction.atomic():
                session = QuizSession.objects.select_for_update().get(pin=self.pin)
                players = session.players

                # Coming back after a refresh or a dropped connection: keep the same seat and score.
                if self.player_token:
                    returning = players.filter(token=self.player_token).first()
                    if returning:
                        return seat(returning)
                if self.student_id:
                    returning = players.filter(student_id=self.student_id).first()
                    if returning:
                        return seat(returning)

                if session.status == "completed":
                    return refusal(CLOSE_FINISHED, "This game has already finished.")
                if session.lobby_locked:
                    return refusal(CLOSE_LOCKED, "The host has locked this game. Ask them to unlock it.")
                if players.filter(nickname=self.nickname).exists():
                    return refusal(CLOSE_NICKNAME_TAKEN, "That nickname is already taken. Pick another one.")

                player = QuizPlayer.objects.create(
                    session=session,
                    student_id=self.student_id,
                    nickname=self.nickname,
                    avatar=OPTION_COLORS[players.count() % len(OPTION_COLORS)],
                    token=secrets.token_urlsafe(24),
                )
                return seat(player)
        except IntegrityError:
            return refusal(CLOSE_NICKNAME_TAKEN, "That nickname is already taken. Pick another one.")

    @database_sync_to_async
    def remove_player(self, player_id):
        deleted, _ = QuizPlayer.objects.filter(id=player_id, session__pin=self.pin).delete()
        return bool(deleted)

    @database_sync_to_async
    def get_session_state(self):
        session = QuizSession.objects.get(pin=self.pin)
        question = session.quiz.questions.order_by("order", "id")[
            session.current_question_index:session.current_question_index + 1
        ].first()
        time_left = 0.0
        if question and session.question_started_at:
            elapsed = (timezone.now() - session.question_started_at).total_seconds()
            time_left = max(0.0, max(question.time_limit, 1) - elapsed)
        return {
            "session_pk": session.pk,
            "status": session.status,
            "current_question_index": session.current_question_index,
            "question_count": session.quiz.questions.count(),
            "question_started_at": session.question_started_at,
            "lobby_locked": session.lobby_locked,
            "time_left": time_left,
        }

    @database_sync_to_async
    def update_session(self, **fields):
        QuizSession.objects.filter(pin=self.pin).update(**fields)

    @database_sync_to_async
    def record_results(self):
        session = QuizSession.objects.select_related("quiz").get(pin=self.pin)
        if session.is_test_run:
            return
        total = session.quiz.questions.count()
        players = session.players.exclude(student_id__isnull=True).exclude(student_id="").annotate(
            n_correct=Count("answers", filter=Q(answers__is_correct=True)))
        for player in players:
            student = resolve_student(player.student_id)
            if student is None:
                continue
            # Saved as a mark out of 100 (questions answered correctly, unanswered ones count as wrong),
            # not the speed-weighted game points, so it can be compared with other results.
            record_student_activity(
                student_id=student.pk,
                activity_type="game",
                source_id=f"quiz:{session.pk}",
                title=session.quiz.title or "Quiz",
                score=percent_correct(player.n_correct, total),
                status="completed",
            )

    @database_sync_to_async
    def transition_session(self, expected_status, where=None, **fields):
        with transaction.atomic():
            session = QuizSession.objects.select_for_update().filter(
                pin=self.pin,
                status=expected_status,
                **(where or {}),
            ).first()
            if not session:
                return False
            QuizSession.objects.filter(pk=session.pk).update(**fields)
            return True

    @database_sync_to_async
    def get_players(self):
        return list(
            QuizPlayer.objects.filter(session__pin=self.pin).order_by("id").values(
                "id", "nickname", "avatar", "score", "streak"
            )
        )

    @database_sync_to_async
    def get_current_question(self, index):
        return QuizQuestion.objects.filter(quiz__sessions__pin=self.pin).order_by("order", "id")[index:index + 1].first()

    @sync_to_async
    def new_question_message(self, question, index):
        options = list(question.options.all()) if question else []
        return {
            "type": "new_question",
            "index": index,
            "total": question.quiz.questions.count() if question else 0,
            "question": {
                "id": question.id,
                "text": question.question_text,
                "question_text": question.question_text,
                "image_url": question.image_url,
                "time_limit": question.time_limit,
                "time_left": question.time_limit,
                "points": question.points,
                "options": [
                    {
                        "id": option.id,
                        "text": option.option_text,
                        "option_text": option.option_text,
                        "color": option.color or OPTION_COLORS[position % len(OPTION_COLORS)],
                    }
                    for position, option in enumerate(options)
                ],
            },
        }

    @database_sync_to_async
    def save_answer(self, player_id, question_id, option_id):
        session = QuizSession.objects.filter(pin=self.pin).select_related("quiz").first()
        current_question = None
        if session:
            current_question = QuizQuestion.objects.filter(
                quiz=session.quiz
            ).order_by("order", "id")[
                session.current_question_index:session.current_question_index + 1
            ].first()

        if not current_question or str(question_id) != str(current_question.id):
            return {"error": "That question is no longer accepting answers."}

        # How quickly the player answered is measured here, from when the question went out.
        # What the browser claims is never used, so nobody can fake a fast answer.
        limit_ms = max(current_question.time_limit * 1000, 1)
        response_time_ms = 0
        if session.question_started_at:
            response_time_ms = max(0, int((timezone.now() - session.question_started_at).total_seconds() * 1000))
            if response_time_ms > limit_ms:
                return {"error": "This question's time has expired."}

        question = current_question
        option = QuizOption.objects.filter(id=option_id, question=question).first()
        if not option:
            return {"error": "That answer is no longer available."}

        try:
            with transaction.atomic():
                player = QuizPlayer.objects.select_for_update().filter(
                    id=player_id, session__pin=self.pin
                ).first()
                if not player:
                    return {"error": "That answer is no longer available."}

                if QuizAnswer.objects.filter(player=player, question=question).exists():
                    return {"error": "You have already answered this question."}

                points = 0
                if option.is_correct:
                    # Full points for an instant answer, half for one at the buzzer.
                    points = round(question.points * (1 - min(response_time_ms, limit_ms) / limit_ms / 2))
                    player.streak += 1
                    if player.streak >= 2:
                        points += min(STREAK_BONUS_CAP, STREAK_BONUS_STEP * (player.streak - 1))
                else:
                    player.streak = 0

                QuizAnswer.objects.create(
                    player=player,
                    question=question,
                    option_id=option.id,
                    is_correct=option.is_correct,
                    points_earned=points,
                    response_time_ms=response_time_ms,
                )
                player.score += points
                player.save(update_fields=["score", "streak"])
                answer_count = QuizAnswer.objects.filter(
                    player__session=player.session, question=question
                ).count()
                players_total = player.session.players.count()
        except IntegrityError:
            return {"error": "You have already answered this question."}

        return {"error": None, "answer_count": answer_count, "players_total": players_total}

    @database_sync_to_async
    def get_results(self, index):
        question = QuizQuestion.objects.filter(quiz__sessions__pin=self.pin).order_by(
            "order", "id")[index:index + 1].first()
        if not question:
            return {"stats": {}, "correct_option_ids": [], "scoreboard": [], "answered": 0}
        stats = {str(option_id): 0 for option_id in question.options.values_list("id", flat=True)}
        answers = {a.player_id: a for a in QuizAnswer.objects.filter(question=question, player__session__pin=self.pin)}
        for answer in answers.values():
            key = str(answer.option_id)
            stats[key] = stats.get(key, 0) + 1

        players = QuizPlayer.objects.filter(session__pin=self.pin).order_by("-score", "id")
        scoreboard = []
        for rank, player in enumerate(players, start=1):
            answer = answers.get(player.id)
            scoreboard.append({
                "id": player.id,
                "nickname": player.nickname,
                "avatar": player.avatar,
                "score": player.score,
                "rank": rank,
                "streak": player.streak,
                "answered": answer is not None,
                "is_correct": bool(answer and answer.is_correct),
                "gained": answer.points_earned if answer else 0,
            })
        return {
            "stats": stats,
            "correct_option_ids": list(question.options.filter(is_correct=True).values_list("id", flat=True)),
            "scoreboard": scoreboard,
            "answered": len(answers),
        }

    @database_sync_to_async
    def get_leaderboard(self):
        total = QuizQuestion.objects.filter(quiz__sessions__pin=self.pin).count()
        players = list(QuizPlayer.objects.filter(session__pin=self.pin).annotate(
            n_correct=Count("answers", filter=Q(answers__is_correct=True))).order_by("-score", "id"))
        return [
            {
                "id": player.id,
                "nickname": player.nickname,
                "avatar": player.avatar,
                "score": player.score,
                "rank": rank,
                "correct": player.n_correct,
                "total": total,
                "percent": percent_correct(player.n_correct, total),
            }
            for rank, player in enumerate(players, start=1)
        ]
