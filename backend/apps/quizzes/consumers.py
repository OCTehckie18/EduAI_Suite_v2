from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .models import QuizAnswer, QuizOption, QuizPlayer, QuizQuestion, QuizSession


OPTION_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"]


class QuizConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.pin = self.scope["url_route"]["kwargs"]["pin"]
        query = parse_qs(self.scope.get("query_string", b"").decode())
        self.user_type = query.get("user_type", ["student"])[0]
        self.nickname = query.get("nickname", [""])[0].strip() or "Player"
        self.group_name = f"quiz_{self.pin}"

        if not await self.session_exists():
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        if self.user_type == "student":
            self.player_id = await self.join_player()

        await self.broadcast_lobby()
        session = await self.get_session_state()
        if session["status"] == "active":
            question = await self.get_current_question(session["current_question_index"])
            if question:
                await self.send_json(await self.new_question_message(question, session["current_question_index"]))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")

        if message_type == "start_game":
            await self.start_game()
        elif message_type == "submit_answer":
            await self.submit_answer(content)
        elif message_type in {"time_up", "show_results"}:
            await self.show_results()
        elif message_type == "next_question":
            await self.next_question()
        else:
            await self.send_json({"type": "error", "message": "Unknown quiz action."})

    async def quiz_broadcast(self, event):
        await self.send_json(event["message"])

    async def start_game(self):
        if self.user_type != "teacher":
            return

        session = await self.get_session_state()
        if not session["question_count"]:
            await self.send_json({"type": "error", "message": "Add at least one question before starting."})
            return

        await self.update_session(status="active", current_question_index=0, started_at=timezone.now())
        question = await self.get_current_question(0)
        await self.broadcast_json(await self.new_question_message(question, 0))

    async def submit_answer(self, content):
        if self.user_type != "student":
            return

        session = await self.get_session_state()
        if session["status"] != "active" or not getattr(self, "player_id", None):
            await self.send_json({"type": "error", "message": "This question is not accepting answers."})
            return

        result = await self.save_answer(
            player_id=self.player_id,
            question_id=content.get("question_id"),
            option_id=content.get("option_id"),
            response_time_ms=max(0, int(content.get("response_time", 0))),
        )
        if result["error"]:
            await self.send_json({"type": "error", "message": result["error"]})
            return

        await self.send_json({
            "type": "answer_submitted",
            "is_correct": result["is_correct"],
            "points": result["points"],
        })
        await self.broadcast_json({
            "type": "answer_count_update",
            "count": result["answer_count"],
        })

    async def show_results(self):
        if self.user_type != "teacher":
            return

        session = await self.get_session_state()
        if session["status"] != "active":
            return

        result = await self.get_results(session["current_question_index"])
        await self.update_session(status="result")
        await self.broadcast_json({
            "type": "show_results",
            "stats": result["stats"],
            "correct_option_ids": result["correct_option_ids"],
        })

    async def next_question(self):
        if self.user_type != "teacher":
            return

        session = await self.get_session_state()
        if session["status"] == "active":
            await self.show_results()
            return
        if session["status"] != "result":
            return

        next_index = session["current_question_index"] + 1
        if next_index >= session["question_count"]:
            await self.update_session(status="completed")
            await self.broadcast_json({
                "type": "game_over",
                "leaderboard": await self.get_leaderboard(),
            })
            return

        await self.update_session(status="active", current_question_index=next_index)
        question = await self.get_current_question(next_index)
        await self.broadcast_json(await self.new_question_message(question, next_index))

    async def broadcast_lobby(self):
        await self.broadcast_json({
            "type": "lobby_update",
            "players": await self.get_players(),
        })

    async def broadcast_json(self, message):
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "quiz_broadcast", "message": message},
        )

    @database_sync_to_async
    def session_exists(self):
        return QuizSession.objects.filter(pin=self.pin).exists()

    @database_sync_to_async
    def join_player(self):
        session = QuizSession.objects.get(pin=self.pin)
        player = session.players.filter(nickname=self.nickname).first()
        if player:
            return player.id

        player = QuizPlayer.objects.create(
            session=session,
            nickname=self.nickname,
            avatar=OPTION_COLORS[session.players.count() % len(OPTION_COLORS)],
        )
        return player.id

    @database_sync_to_async
    def get_session_state(self):
        session = QuizSession.objects.get(pin=self.pin)
        return {
            "status": session.status,
            "current_question_index": session.current_question_index,
            "question_count": session.quiz.questions.count(),
        }

    @database_sync_to_async
    def update_session(self, **fields):
        QuizSession.objects.filter(pin=self.pin).update(**fields)

    @database_sync_to_async
    def get_players(self):
        return list(
            QuizPlayer.objects.filter(session__pin=self.pin).values(
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
    def save_answer(self, player_id, question_id, option_id, response_time_ms):
        player = QuizPlayer.objects.filter(
            id=player_id, session__pin=self.pin).first()
        question = QuizQuestion.objects.filter(
            id=question_id, quiz__sessions__pin=self.pin).first()
        option = QuizOption.objects.filter(
            id=option_id, question=question).first() if question else None
        if not player or not question or not option:
            return {"error": "That answer is no longer available."}

        if QuizAnswer.objects.filter(player=player, question=question).exists():
            return {"error": "You have already answered this question."}

        time_limit_ms = max(question.time_limit * 1000, 1)
        speed_multiplier = max(0.5, 1 - response_time_ms / time_limit_ms)
        points = round(question.points *
                       speed_multiplier) if option.is_correct else 0
        QuizAnswer.objects.create(
            player=player,
            question=question,
            option_id=option.id,
            is_correct=option.is_correct,
            points_earned=points,
            response_time_ms=response_time_ms,
        )
        player.score += points
        player.streak = player.streak + 1 if option.is_correct else 0
        player.save(update_fields=["score", "streak"])
        answer_count = QuizAnswer.objects.filter(
            player__session=player.session, question=question
        ).count()
        return {
            "error": None,
            "is_correct": option.is_correct,
            "points": points,
            "answer_count": answer_count,
        }

    @database_sync_to_async
    def get_results(self, index):
        question = QuizQuestion.objects.filter(quiz__sessions__pin=self.pin).order_by(
            "order", "id")[index:index + 1].first()
        if not question:
            return {"stats": {}, "correct_option_ids": []}
        stats = {}
        for option_id in question.options.values_list("id", flat=True):
            stats[str(option_id)] = QuizAnswer.objects.filter(
                question=question, option_id=option_id
            ).count()
        return {
            "stats": stats,
            "correct_option_ids": list(question.options.filter(is_correct=True).values_list("id", flat=True)),
        }

    @database_sync_to_async
    def get_leaderboard(self):
        players = list(QuizPlayer.objects.filter(
            session__pin=self.pin).order_by("-score", "id"))
        return [
            {
                "id": player.id,
                "nickname": player.nickname,
                "avatar": player.avatar,
                "score": player.score,
                "rank": rank,
            }
            for rank, player in enumerate(players, start=1)
        ]
