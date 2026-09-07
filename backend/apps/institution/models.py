from django.db import models

from apps.core.models import SoftDeleteModel


class Campus(SoftDeleteModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, default="Karnataka")
    address = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def delete(self, using=None, keep_parents=False):
        for school in self.schools.all_objects.all():
            school.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class School(SoftDeleteModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30)
    campus = models.ForeignKey(Campus, on_delete=models.CASCADE, related_name="schools")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["campus", "code"], name="unique_school_code_per_campus"),
        ]

    def __str__(self):
        return f"{self.name} ({self.campus.code})"

    def delete(self, using=None, keep_parents=False):
        for department in self.departments.all_objects.all():
            department.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class Department(SoftDeleteModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="departments")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="unique_department_code_per_school"),
        ]

    def __str__(self):
        return f"{self.name} ({self.school.code})"

    def delete(self, using=None, keep_parents=False):
        for program in self.programs.all_objects.all():
            program.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class Program(SoftDeleteModel):
    class DegreeLevel(models.TextChoices):
        UG = "UG", "Undergraduate"
        PG = "PG", "Postgraduate"
        PHD = "PHD", "Doctorate"

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="programs")
    degree_level = models.CharField(max_length=3, choices=DegreeLevel.choices)
    duration_years = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["department", "code"], name="unique_program_code_per_department"),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def delete(self, using=None, keep_parents=False):
        for batch in self.batches.all_objects.all():
            batch.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class Batch(SoftDeleteModel):
    name = models.CharField(max_length=30)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="batches")
    start_year = models.PositiveSmallIntegerField()
    end_year = models.PositiveSmallIntegerField()
    academic_year = models.CharField(max_length=20)

    class Meta:
        ordering = ["-start_year", "name"]
        constraints = [
            models.UniqueConstraint(fields=["program", "name"], name="unique_batch_name_per_program"),
        ]

    def __str__(self):
        return f"{self.program.code} {self.name}"

    def delete(self, using=None, keep_parents=False):
        for section in self.sections.all_objects.all():
            section.delete(using=using)
        super().delete(using=using, keep_parents=keep_parents)


class Section(SoftDeleteModel):
    name = models.CharField(max_length=30)
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="sections")
    max_capacity = models.PositiveIntegerField(default=60)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "name"], name="unique_section_name_per_batch"),
        ]

    def __str__(self):
        return f"{self.batch} - {self.name}"
