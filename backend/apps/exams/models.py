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
    # How a paper is drawn from the pool: [{"type": "mcq", "marks": 1, "count": 4}, ...]. Empty: every question.
    pattern = models.JSONField(default=list, blank=True)
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
    class Type(models.TextChoices):
        MCQ = "mcq", "Multiple choice"
        FILL_BLANK = "fill_blank", "Fill in the blanks"
        LONG_ANSWER = "long_answer", "Long answer"

    question_type = models.CharField(max_length=50, choices=Type.choices, default=Type.MCQ)
    points = models.FloatField(default=1.0)
    order = models.IntegerField(default=0)
    # Fill in the blanks: one list of accepted answers per blank, e.g. [["Paris"], ["1789", "seventeen eighty-nine"]].
    accepted_answers = models.JSONField(default=list, blank=True)
    # Long answers: the marking notes or model answer. Never sent to students.
    answer_guide = models.TextField(blank=True, default="")
    word_limit = models.PositiveIntegerField(null=True, blank=True)

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
    # Times the student left the exam when the university's rules only warn for it.
    warnings = models.PositiveSmallIntegerField(default=0)
    total_points = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-start_time"]
        indexes = [
            models.Index(fields=["exam", "student_id"], name="attempt_exam_student_idx"),
            models.Index(fields=["student_id", "status"], name="attempt_student_status_idx"),
        ]

    def __str__(self):
        return f"Attempt by student {self.student_id} on {self.exam}"


class ExamReset(models.Model):
    """A teacher cleared a student's attempt (a power cut, a crash, a wrongly flagged exam).

    The attempt itself is deleted so that the flag, the zero and the used attempt all disappear
    together; this record keeps the evidence: who reset it, why, and what the attempt held.
    """

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="resets")
    student_id = models.IntegerField(db_index=True)
    reset_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reason = models.CharField(max_length=500)
    # A personal deadline for the student, for when the exam window has already closed.
    allowed_until = models.DateTimeField(null=True, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Reset of student {self.student_id} on {self.exam}"


class AttemptQuestion(models.Model):
    """One question on one student's paper, in the order they see it.

    ``points`` is copied from the question when the paper is drawn, so editing a question later never
    changes a finished paper. ``choice_order`` is the order of its choice ids for this student.
    """

    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="paper")
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE, related_name="drawn_in")
    position = models.IntegerField(default=0)
    points = models.FloatField(default=1.0)
    choice_order = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="unique_question_per_attempt")]


class ExamAnswer(models.Model):
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE, related_name="answers")
    selected_choice_id = models.IntegerField(null=True, blank=True)
    # Fill in the blanks (one line per blank) and long answers.
    text_answer = models.TextField(blank=True, default="")
    # Marks given for this answer. Null until it has been marked (long answers wait for the teacher).
    awarded_points = models.FloatField(null=True, blank=True)
    feedback = models.TextField(blank=True, default="")
    marked_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    marked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Answer for Q{self.question_id}: {self.selected_choice_id or self.text_answer[:30]}"


def personal_deadline(exam, student_id, now=None):
    """The student's own deadline from their latest reset, while it is still in the future."""
    from django.utils import timezone

    now = now or timezone.now()
    latest = ExamReset.objects.filter(exam=exam, student_id=student_id).exclude(allowed_until=None).order_by("-created_at").first()
    return latest.allowed_until if latest and latest.allowed_until > now else None


def exam_availability(exam, now=None):
    """"upcoming" before the window opens, "ended" after it closes, otherwise "open"."""
    from django.utils import timezone

    now = now or timezone.now()
    if exam.opens_at and now < exam.opens_at:
        return "upcoming"
    if exam.closes_at and now > exam.closes_at:
        return "ended"
    return "open"
