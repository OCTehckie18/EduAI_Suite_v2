"""Live Chain Answer games over a WebSocket.

Connect to ``/ws/games/chain-answer/<session_id>?access_token=<JWT>``. Who you are, and whether you
are the teacher or a student, comes from the verified token: ``user_type`` or any name in the URL is
ignored. Everything goes through ``apps.games.engine`` (the same rules as the REST API).

Client -> server (JSON): ``join``, ``submit_word`` (``word``), ``start_game``, ``pause_game``,
``resume_game``, ``skip_turn``, ``end_game``, ``ping``. The last five besides ``ping`` are teacher-only.

Server -> client: ``state`` (the full game as this viewer may see it, with ``event`` saying what
changed), ``error`` (``message``) and ``pong``. A rejected action only produces ``error`` for the sender.
"""

import asyncio
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from ..accounts.authentication import authenticate_access_token
from . import engine
from .models import ChainAnswerGame
from .views import _can_view, _game_payload, _get_game, _is_owner

CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404

TEACHER_ACTIONS = {
    "start_game": ("start", "started"),
    "pause_game": ("pause", "paused"),
    "resume_game": ("resume", "resumed"),
    "skip_turn": ("skip_turn", "turn_skipped"),
    "end_game": ("end", "ended"),
}


class ChainAnswerConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = f"chain_{self.session_id}"
        self.timer_task = None
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = query.get("access_token", [""])[0]
        if not token:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        try:
            self.user, _ = await sync_to_async(authenticate_access_token)(token)
        except Exception:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        game = await self.load_game()
        if game is None:
            await self.close(code=CLOSE_NOT_FOUND)
            return
        if not await database_sync_to_async(_can_view)(self.user, game):
            await self.close(code=CLOSE_FORBIDDEN)
            return

        self.is_teacher = await database_sync_to_async(_is_owner)(self.user, game)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_state("initial")
        await self.arm_timer()

    async def disconnect(self, close_code):
        if getattr(self, "timer_task", None):
            self.timer_task.cancel()
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ------------------------------------------------------------ incoming
    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "ping":
            await self.send_json({"type": "pong"})
            return
        try:
            if kind == "join":
                if self.is_teacher:
                    raise engine.GameError("The teacher does not join as a player.", 403)
                await database_sync_to_async(engine.join)(self.session_id, self.user)
                await self.broadcast("player_joined")
            elif kind == "submit_word":
                game, entry, result = await database_sync_to_async(engine.submit_word)(
                    self.session_id, self.user, content.get("word")
                )
                await self.broadcast(
                    "word_accepted" if result["is_valid"] else "word_rejected",
                    detail={"word": entry.word, "by": entry.submitted_by, "reason": result["message"], "is_valid": result["is_valid"]},
                    only_sender_detail=not result["is_valid"],
                )
            elif kind in TEACHER_ACTIONS:
                if not self.is_teacher:
                    raise engine.GameError("Only the teacher can do that.", 403)
                function, event = TEACHER_ACTIONS[kind]
                await database_sync_to_async(getattr(engine, function))(self.session_id)
                await self.broadcast(event)
            else:
                raise engine.GameError("Unknown message type.", 400)
        except engine.GameError as exc:
            await self.send_json({"type": "error", "message": exc.message, "code": exc.status})
            if exc.message.startswith("Time ran out"):
                await self.broadcast("turn_skipped")  # the turn change was saved, so everyone needs to see it

    # ------------------------------------------------------------ outgoing
    async def broadcast(self, event, detail=None, only_sender_detail=False):
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "game.changed",
                "event": event,
                "detail": detail or {},
                "sender": self.channel_name if only_sender_detail else None,
            },
        )

    async def game_changed(self, message):
        """Every connection builds its own snapshot, so each viewer only gets what they may see."""
        detail = message.get("detail") or {}
        if message.get("sender") and message["sender"] != self.channel_name:
            detail = {}  # a wrong word is private feedback for whoever sent it
        await self.send_state(message["event"], detail)
        await self.arm_timer()

    async def send_state(self, event, detail=None):
        game = await self.load_game()
        if game is None:
            await self.close(code=CLOSE_NOT_FOUND)
            return
        payload = await database_sync_to_async(_game_payload)(game, self.user)
        await self.send_json({"type": "state", "event": event, "detail": detail or {}, "game": payload})

    @database_sync_to_async
    def load_game(self):
        try:
            return _get_game(self.session_id)
        except Exception:
            return None

    # ------------------------------------------------------------ the turn timer
    async def arm_timer(self):
        """Wake up when the current turn runs out and move the game on, even if nobody sends a message."""
        if self.timer_task:
            self.timer_task.cancel()
        game = await self.load_game()
        if game is None or game.status != "active" or game.turn_deadline is None:
            self.timer_task = None
            return
        left = await database_sync_to_async(lambda: engine.time_left(ChainAnswerGame.objects.get(pk=game.pk)))()
        self.timer_task = asyncio.ensure_future(self.expire_after((left or 0) + engine.GRACE_SECONDS + 0.2))

    async def expire_after(self, seconds):
        try:
            await asyncio.sleep(seconds)
            _, skipped = await database_sync_to_async(engine.refresh)(self.session_id)
            if skipped:
                await self.broadcast("turn_skipped")
        except asyncio.CancelledError:
            raise
        except Exception:
            pass  # the next state change or poll applies the timeout instead
