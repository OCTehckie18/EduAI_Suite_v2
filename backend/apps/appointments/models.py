from django.db import models


class Appointment(models.Model):
    student_name = models.CharField(max_length=255, blank=True, null=True)
    student_email = models.CharField(max_length=255, blank=True, null=True)
    teacher_name = models.CharField(max_length=255, blank=True, null=True)
    teacher_department = models.CharField(max_length=255, blank=True, null=True)
    meeting_mode = models.CharField(max_length=50, blank=True, null=True)
    time_slot = models.CharField(max_length=100, blank=True, null=True)
    agenda = models.CharField(max_length=500, blank=True, null=True)
    details = models.TextField(blank=True, null=True)
    rejection_reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, default="pending")
    requested_at = models.CharField(max_length=100, blank=True, null=True)
    reviewed_at = models.CharField(max_length=100, blank=True, null=True)
    reviewed_by = models.CharField(max_length=255, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"Appointment: {self.student_name} with {self.teacher_name} ({self.status})"
