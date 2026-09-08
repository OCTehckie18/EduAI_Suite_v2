from django.db import models


class OMRJob(models.Model):
    title = models.CharField(max_length=255, blank=True, null=True)
    answer_key = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"OMR Job {self.id}"


class OMRSubmission(models.Model):
    job = models.ForeignKey(OMRJob, on_delete=models.CASCADE, related_name="submissions")
    student_id = models.CharField(max_length=100, blank=True, null=True)
    image_url = models.CharField(max_length=500, blank=True, null=True)
    detected_answers = models.JSONField(blank=True, null=True)
    score = models.FloatField(default=0.0)
    status = models.CharField(max_length=50, default="pending")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"OMR Submission: {self.student_id} ({self.score} pts)"
