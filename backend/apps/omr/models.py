from django.conf import settings
from django.db import models


class OMRJob(models.Model):
    """One paper: its answer key, and the sheets scanned for it."""

    # Null only for jobs made before ownership existed; those are visible to nobody but a master admin.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="omr_jobs"
    )
    classroom = models.ForeignKey(
        "classrooms.Classroom", null=True, blank=True, on_delete=models.SET_NULL, related_name="omr_jobs"
    )
    title = models.CharField(max_length=255, blank=True, null=True)
    num_questions = models.PositiveIntegerField(default=0)
    answer_key = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"OMR Job {self.id}"


class OMRSubmission(models.Model):
    class Status(models.TextChoices):
        NEEDS_REVIEW = "needs_review", "Needs review"
        VERIFIED = "verified", "Verified"

    job = models.ForeignKey(OMRJob, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="omr_submissions"
    )
    register_read = models.CharField(max_length=20, blank=True, default="")  # digits read from the sheet
    image_url = models.CharField(max_length=500, blank=True, null=True)
    detected_answers = models.JSONField(blank=True, null=True)  # {"1": "A", "2": null}
    issues = models.JSONField(default=dict, blank=True)  # {"questions": {"3": "blank"}, "notes": [...]}
    score = models.FloatField(default=0.0)  # percent of the key answered correctly
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEEDS_REVIEW)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"OMR sheet {self.pk} ({self.score}%)"
