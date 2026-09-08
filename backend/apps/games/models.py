from django.db import models


class ChainAnswerGame(models.Model):
    session_id = models.CharField(max_length=100, unique=True, db_index=True)
    teacher_id = models.IntegerField(null=True, blank=True)
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
    student_id = models.CharField(max_length=100, blank=True, null=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    join_order = models.IntegerField(default=0)
    score = models.FloatField(default=0.0)
    words_submitted = models.IntegerField(default=0)
    words_valid = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default="active")

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
