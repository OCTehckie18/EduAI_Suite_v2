from django.db import models


class DemoRequest(models.Model):
    """Someone from a college asking us for a demo, sent from the product website."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        DEMO_BOOKED = "demo_booked", "Demo booked"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    name = models.CharField(max_length=120)
    role = models.CharField(max_length=120, help_text="Their job, e.g. Registrar or Head of IT.")
    institution = models.CharField(max_length=200)
    city = models.CharField(max_length=120, blank=True)
    approx_students = models.PositiveIntegerField(null=True, blank=True)
    work_email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    message = models.TextField(blank=True, max_length=2000)
    consent = models.BooleanField(default=False, help_text="Agreed to be contacted about EduAI Suite.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    notes = models.TextField(blank=True, help_text="Internal notes from the sales team.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.institution} ({self.name})"


class Campus(models.Model):
    """A college that runs its own EduAI Suite installation. Used by Phase 5 (provisioning)."""

    class Plan(models.TextChoices):
        PILOT = "pilot", "Pilot"
        STANDARD = "standard", "Standard"
        ENTERPRISE = "enterprise", "Enterprise"

    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    slug = models.SlugField(max_length=60, unique=True, help_text="Short name used in its web addresses.")
    college_name = models.CharField(max_length=200)
    landing_url = models.URLField(blank=True)
    admin_url = models.URLField(blank=True)
    teacherbuddy_url = models.URLField(blank=True)
    edugames_url = models.URLField(blank=True)
    api_url = models.URLField(blank=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.PILOT)
    seat_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Student seats in the contract.")
    start_date = models.DateField(null=True, blank=True)
    renewal_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    contact_name = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    demo_request = models.ForeignKey(DemoRequest, null=True, blank=True, on_delete=models.SET_NULL, related_name="campuses")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["college_name"]
        verbose_name_plural = "campuses"

    def __str__(self) -> str:
        return self.college_name
