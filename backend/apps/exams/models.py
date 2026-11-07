from django.db import models
from apps.classrooms.models import Classroom


class Exam(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"

    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="exams")
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    time_limit = models.IntegerField(default=60)
    attempts_allowed = models.IntegerField(default=1)
    randomize_questions = models.BooleanField(default=False)
    opens_at = models.DateTimeField(null=True, blank=True)  # students cannot start before this
    closes_at = models.DateTimeField(null=True, blank=True)  # nor after this
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.course})"


class ExamQuestion(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="questions")
    question_text = models.TextField(blank=True, null=True)
    question_type = models.CharField(max_length=50, default="mcq")
    points = models.FloatField(default=1.0)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Q: {self.question_text[:50]}"


class ExamChoice(models.Model):
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE, related_name="choices")
    choice_text = models.CharField(max_length=500, blank=True, null=True)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return f"Choice: {self.choice_text[:50]}"


class ExamAttempt(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="attempts")
    student_id = models.IntegerField(default=0)
    score = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=50, default="in_progress")
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    # The server enforces the time limit: after this moment (plus a short grace period) the attempt is closed.
    expires_at = models.DateTimeField(null=True, blank=True)
    earned_points = models.FloatField(null=True, blank=True)
    # Set when the attempt was ended for leaving the exam (status "flagged").
    flag_reason = models.CharField(max_length=200, blank=True, default="")
    total_points = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-start_time"]

    def __str__(self):
        return f"Attempt by student {self.student_id} on {self.exam}"


class ExamAnswer(models.Model):
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE, related_name="answers")
    selected_choice_id = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"Answer for Q{self.question_id}: {self.selected_choice_id}"


def exam_availability(exam, now=None):
    """"upcoming" before the window opens, "ended" after it closes, otherwise "open"."""
    from django.utils import timezone

    now = now or timezone.now()
    if exam.opens_at and now < exam.opens_at:
        return "upcoming"
    if exam.closes_at and now > exam.closes_at:
        return "ended"
    return "open"
