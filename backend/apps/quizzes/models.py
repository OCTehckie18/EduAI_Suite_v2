from django.db import models


class Quiz(models.Model):
    teacher_id = models.IntegerField(null=True, blank=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    cover_image = models.CharField(max_length=500, blank=True, null=True)
    is_draft = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"Quiz {self.id}"


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    question_text = models.TextField(blank=True, null=True)
    question_type = models.CharField(max_length=50, default="mcq")
    image_url = models.CharField(max_length=500, blank=True, null=True)
    time_limit = models.IntegerField(default=20)
    points = models.IntegerField(default=1000)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Q{self.order}: {self.question_text[:50]}"


class QuizOption(models.Model):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="options")
    option_text = models.CharField(max_length=500, blank=True, null=True)
    is_correct = models.BooleanField(default=False)
    color = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"Option: {self.option_text}"


class QuizSession(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="sessions")
    pin = models.CharField(max_length=10, unique=True, db_index=True)
    status = models.CharField(max_length=50, default="lobby")
    current_question_index = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Session {self.pin} for Quiz {self.quiz_id}"


class QuizPlayer(models.Model):
    session = models.ForeignKey(QuizSession, on_delete=models.CASCADE, related_name="players")
    student_id = models.CharField(max_length=100, blank=True, null=True)
    nickname = models.CharField(max_length=100, blank=True, null=True)
    avatar = models.CharField(max_length=255, blank=True, null=True)
    score = models.IntegerField(default=0)
    streak = models.IntegerField(default=0)
    last_response_time = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-score"]

    def __str__(self):
        return f"{self.nickname} ({self.score} pts)"


class QuizAnswer(models.Model):
    player = models.ForeignKey(QuizPlayer, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="answers")
    option_id = models.IntegerField(null=True, blank=True)
    text_answer = models.CharField(max_length=500, blank=True, null=True)
    is_correct = models.BooleanField(default=False)
    points_earned = models.IntegerField(default=0)
    response_time_ms = models.IntegerField(default=0)

    def __str__(self):
        return f"Answer by {self.player_id} for Q{self.question_id}"
