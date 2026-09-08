from django.db import models


class PresentationAssignment(models.Model):
    teacher_id = models.IntegerField(default=0)
    course_id = models.IntegerField(blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    deadline = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=50, default="active")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"Assignment {self.id}"


class PresentationSubmission(models.Model):
    assignment = models.ForeignKey(PresentationAssignment, on_delete=models.CASCADE, related_name="submissions")
    student_id = models.IntegerField(default=0)
    file_url = models.CharField(max_length=500, blank=True, null=True)
    file_name = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, default="draft")
    submitted_at = models.DateTimeField(auto_now_add=True)
    is_late = models.BooleanField(default=False)
    grade = models.FloatField(null=True, blank=True)
    teacher_feedback = models.TextField(blank=True, null=True)
    graded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Submission by student {self.student_id} ({self.status})"


class SubmissionInteraction(models.Model):
    submission = models.ForeignKey(PresentationSubmission, on_delete=models.CASCADE, related_name="interactions")
    slide_number = models.IntegerField(default=1)
    interaction_type = models.CharField(max_length=50, blank=True, null=True)
    config = models.JSONField(blank=True, null=True)
    order_index = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slide_number", "order_index"]


class SlidoSession(models.Model):
    teacher_id = models.IntegerField(default=0)
    assignment = models.ForeignKey(PresentationAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    submission = models.ForeignKey(PresentationSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    pin = models.CharField(max_length=10, unique=True, db_index=True)
    status = models.CharField(max_length=50, default="active")
    active_view = models.CharField(max_length=50, default="presentation")
    current_slide = models.IntegerField(default=1)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Slido Session {self.pin} ({self.status})"


class SlidoPoll(models.Model):
    session = models.ForeignKey(SlidoSession, on_delete=models.CASCADE, related_name="polls")
    teacher_id = models.IntegerField(default=0)
    question = models.TextField(blank=True, null=True)
    poll_type = models.CharField(max_length=50, default="multiple_choice")
    is_active = models.BooleanField(default=True)
    total_responses = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class PollResponse(models.Model):
    poll = models.ForeignKey(SlidoPoll, on_delete=models.CASCADE, related_name="responses")
    student_id = models.IntegerField(default=0)
    option_text = models.CharField(max_length=255, blank=True, null=True)
    response_text = models.TextField(blank=True, null=True)
    response_value = models.IntegerField(null=True, blank=True)
    responded_at = models.DateTimeField(auto_now_add=True)


class SlidoQnA(models.Model):
    session = models.ForeignKey(SlidoSession, on_delete=models.CASCADE, related_name="questions")
    student_id = models.IntegerField(default=0)
    question_text = models.TextField(blank=True, null=True)
    is_anonymous = models.BooleanField(default=False)
    upvotes = models.IntegerField(default=0)
    is_answered = models.BooleanField(default=False)
    teacher_answer = models.TextField(blank=True, null=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-upvotes", "-created_at"]


class QnAUpvote(models.Model):
    question = models.ForeignKey(SlidoQnA, on_delete=models.CASCADE, related_name="upvote_records")
    student_id = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["question", "student_id"], name="unique_qna_upvote")
        ]
