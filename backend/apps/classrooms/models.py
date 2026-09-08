import secrets
import string

from django.db import models

from apps.accounts.models import User
from apps.core.models import SoftDeleteModel
from apps.institution.models import Batch, Campus, Department, Program, Section, School


def generate_enrollment_code():
    alphabet = string.ascii_uppercase + string.digits
    return "EDU-" + "".join(secrets.choice(alphabet) for _ in range(8))


class Classroom(SoftDeleteModel):
    name = models.CharField(max_length=150)
    subject_code = models.CharField(max_length=50)
    teacher = models.ForeignKey(User, on_delete=models.PROTECT, related_name="classrooms")
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="classrooms")
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="classrooms")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="classrooms")
    section = models.ForeignKey(Section, null=True, blank=True, on_delete=models.PROTECT, related_name="classrooms")
    enrollment_code = models.CharField(max_length=20, unique=True, default=generate_enrollment_code)
    color = models.CharField(max_length=20, default="#264796")
    description = models.TextField(blank=True)
    course_plan_path = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.subject_code})"

    def delete(self, using=None, keep_parents=False):
        for enrollment in Enrollment.all_objects.filter(classroom=self):
            enrollment.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class Enrollment(SoftDeleteModel):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(User, on_delete=models.PROTECT, related_name="enrollments")
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["student__last_name", "student__first_name", "student__email"]
        constraints = [
            models.UniqueConstraint(fields=["classroom", "student"], name="unique_student_per_classroom"),
        ]

    def __str__(self):
        return f"{self.student.email} in {self.classroom}"


class Resource(models.Model):
    course = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="resources")
    name = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(max_length=50, blank=True, null=True)
    size = models.CharField(max_length=50, blank=True, null=True)
    date = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.course})"
