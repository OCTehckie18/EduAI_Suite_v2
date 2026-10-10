from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import WordCloudSession, WordCloudSubmission


class WordCloudConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.pin = self.scope["url_route"]["kwargs"]["pin"]
        query = parse_qs(self.scope.get("query_string", b"").decode())
        self.role = query.get("role", ["student"])[0]
        self.student_name = query.get("student_name", [""])[0].strip() or None
        self.group_name = f"wordcloud_{self.pin}"

        if not await self.session_exists():
            await self.send_json({"type": "error", "message": "Session not found"})
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        if self.role == "teacher":
            await self.send_json({
                "type": "cloud_update",
                "words": await self.get_words(),
            })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")
        if message_type == "submit_word" and self.role == "student":
            word = str(content.get("word", "")).strip().lower()
            if word:
                await self.save_submission(word)
                await self.broadcast({
                    "type": "cloud_update",
                    "words": await self.get_words(),
                })
                await self.send_json({"type": "word_submitted", "word": word})
        elif message_type == "end_session" and self.role == "teacher":
            await self.end_session()
            await self.broadcast({"type": "session_ended"})

    async def wordcloud_broadcast(self, event):
        await self.send_json(event["message"])

    async def broadcast(self, message):
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "wordcloud_broadcast", "message": message},
        )

    @database_sync_to_async
    def session_exists(self):
        return WordCloudSession.objects.filter(pin=self.pin).exists()

    @database_sync_to_async
    def get_words(self):
        submissions = WordCloudSubmission.objects.filter(
            session__pin=self.pin
        ).values_list("word", flat=True)
        counts = {}
        for word in submissions:
            counts[word] = counts.get(word, 0) + 1
        return [{"text": word, "value": value} for word, value in counts.items()]

    @database_sync_to_async
    def save_submission(self, word):
        session = WordCloudSession.objects.get(pin=self.pin)
        if session.status == "active":
            WordCloudSubmission.objects.create(
                session=session, word=word, submitted_by=self.student_name
            )

    @database_sync_to_async
    def end_session(self):
        WordCloudSession.objects.filter(pin=self.pin).update(status="completed")
