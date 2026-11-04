from django.conf import settings
from django.db import models


class ChainAnswerGame(models.Model):
    session_id = models.CharField(max_length=100, unique=True, db_index=True)
    # The teacher who created it, taken from their login (never from the request body).
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="chain_games"
    )
    name = models.CharField(max_length=255, default="New Game")
    chain_variation = models.CharField(max_length=50, default="standard")
    category = models.CharField(max_length=100, blank=True, null=True)
    difficulty_level = models.CharField(max_length=50, default="medium")
    language = models.CharField(max_length=20, default="en")
    subject = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=50, default="setup")
    starting_word = models.CharField(max_length=100, default="Apple")
    time_per_turn = models.IntegerField(default=30)
    max_words = models.IntegerField(null=True, blank=True)
    ai_suggestions = models.TextField(blank=True, null=True)
    penalty_on_invalid = models.BooleanField(default=False)
    penalty_type = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.session_id})"


class GamePlayer(models.Model):
    game = models.ForeignKey(ChainAnswerGame, on_delete=models.CASCADE, related_name="players")
    # The real account behind this player. ``name`` is only a display snapshot.
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="chain_game_players"
    )
    name = models.CharField(max_length=255, blank=True, null=True)
    join_order = models.IntegerField(default=0)
    score = models.FloatField(default=0.0)
    words_submitted = models.IntegerField(default=0)
    words_valid = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default="active")

    class Meta:
        ordering = ["join_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["game", "student"], condition=models.Q(student__isnull=False), name="unique_student_per_chain_game"),
        ]

    def __str__(self):
        return f"{self.name} in {self.game.session_id}"


class GameWord(models.Model):
    game = models.ForeignKey(ChainAnswerGame, on_delete=models.CASCADE, related_name="words")
    word = models.CharField(max_length=100)
    submitted_by = models.CharField(max_length=255, blank=True, null=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    is_valid = models.BooleanField(default=True)
    position = models.IntegerField(default=0)
    validation_reason = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.word} ({'valid' if self.is_valid else 'invalid'})"


class GameQuestion(models.Model):
    game = models.ForeignKey(ChainAnswerGame, on_delete=models.CASCADE, related_name="questions")
    question_text = models.TextField()
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Q{self.order}: {self.question_text[:40]}"


class WordCloudSession(models.Model):
    pin = models.CharField(max_length=6, unique=True, db_index=True)
    teacher_id = models.IntegerField(null=True, blank=True)
    prompt = models.TextField()
    status = models.CharField(max_length=20, default="active")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]


class WordCloudSubmission(models.Model):
    session = models.ForeignKey(
        WordCloudSession, on_delete=models.CASCADE, related_name="submissions"
    )
    word = models.CharField(max_length=100)
    submitted_by = models.CharField(max_length=100, blank=True, null=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
