from datetime import timedelta

from django.db import models

from apps.core.models import SoftDeleteModel, TimeStampedModel


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
        for school in School.all_objects.filter(campus=self):
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
        for department in Department.all_objects.filter(school=self):
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
        for program in Program.all_objects.filter(department=self):
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
        for batch in Batch.all_objects.filter(program=self):
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

    def restore(self):
        """Bring the class back together with the sections that were removed alongside it."""
        removed_at = self.deleted_at
        super().restore()
        if removed_at:
            cascade = Section.all_objects.filter(
                batch=self, is_active=False, deleted_at__gte=removed_at - timedelta(seconds=5)
            )
            for section in cascade:
                section.restore()
        ensure_default_section(self)

    def delete(self, using=None, keep_parents=False):
        for section in Section.all_objects.filter(batch=self):
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


DEFAULT_SECTION_NAME = "A"


def ensure_default_section(batch):
    """Every class keeps at least one section; revive or create one when it has none."""
    if Section.objects.filter(batch=batch).exists():
        return
    dormant = Section.all_objects.filter(batch=batch).order_by("name").first()
    if dormant:
        dormant.restore()
    else:
        Section.objects.create(batch=batch, name=DEFAULT_SECTION_NAME)


class UniversityProfile(TimeStampedModel):
    """The single university this installation belongs to (one row, pk=1)."""

    name = models.CharField(max_length=150, blank=True)
    short_name = models.CharField(max_length=30, blank=True)
    email_domain = models.CharField(max_length=100, blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    logo_data = models.BinaryField(null=True, blank=True, editable=False)
    logo_content_type = models.CharField(max_length=50, blank=True)
    logo_updated_at = models.DateTimeField(null=True, blank=True)
    # Optional second logo for dark mode (light artwork on a transparent background).
    logo_dark_data = models.BinaryField(null=True, blank=True, editable=False)
    logo_dark_content_type = models.CharField(max_length=50, blank=True)
    logo_dark_updated_at = models.DateTimeField(null=True, blank=True)
    # Brand colours used across all three portals (#rrggbb).
    primary_color = models.CharField(max_length=7, default="#264796")
    secondary_color = models.CharField(max_length=7, default="#d0ae61")
    tertiary_color = models.CharField(max_length=7, default="#0f766e")

    def __str__(self):
        return self.name or "University (not configured)"

    @classmethod
    def load(cls):
        """The profile without the logo bytes (cheap); creates the empty row on first use."""
        profile = cls.objects.defer("logo_data", "logo_dark_data").filter(pk=1).first()
        if profile is None:
            profile = cls.objects.create(pk=1)
        return profile
