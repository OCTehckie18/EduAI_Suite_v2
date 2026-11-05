from django.conf import settings
from django.db import models
from apps.classrooms.models import Classroom


class Assignment(models.Model):
    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    due_date = models.CharField(max_length=100, blank=True, null=True)
    max_points = models.IntegerField(default=100)
    media_path = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.course})"


class Submission(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    # The real owner of the work. ``student_name`` stays as a display snapshot (and for rows that
    # could not be matched to an account when this link was introduced).
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="submissions"
    )
    student_name = models.CharField(max_length=255, blank=True, null=True)
    file_path = models.TextField(blank=True, null=True)
    submitted_at = models.CharField(max_length=100, blank=True, null=True)
    grade = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Submission by {self.student_name} for {self.assignment}"


class RubricCriterion(models.Model):
    key = models.SlugField(max_length=50, unique=True)
    label = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    weight = models.PositiveIntegerField(default=0)
    max_score = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.label


class FeedbackTemplate(models.Model):
    mark = models.CharField(max_length=10)
    text = models.CharField(max_length=500)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.mark}: {self.text[:40]}"


class AssignmentCriterion(models.Model):
    """One line of an assignment's marking rubric. The lines add up to the assignment's total marks."""

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="criteria")
    label = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    max_score = models.PositiveIntegerField()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.label} ({self.max_score})"


class SubmissionEvaluation(models.Model):
    """The teacher's rubric marking of one submission."""

    submission = models.OneToOneField(Submission, on_delete=models.CASCADE, related_name="evaluation")
    evaluator = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    feedback = models.TextField(blank=True)
    total = models.FloatField(default=0)
    updated_at = models.DateTimeField(auto_now=True)


class CriterionScore(models.Model):
    evaluation = models.ForeignKey(SubmissionEvaluation, on_delete=models.CASCADE, related_name="scores")
    criterion = models.ForeignKey(AssignmentCriterion, on_delete=models.CASCADE, related_name="scores")
    score = models.FloatField()
    comment = models.CharField(max_length=500, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["evaluation", "criterion"], name="one_score_per_criterion")]
