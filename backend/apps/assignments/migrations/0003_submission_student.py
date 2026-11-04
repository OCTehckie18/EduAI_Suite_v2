import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def link_submissions_to_students(apps, schema_editor):
    """Match old name-only submissions to accounts by email or register number.

    Rows that cannot be matched unambiguously keep ``student`` empty and stay readable by teachers.
    """
    Submission = apps.get_model("assignments", "Submission")
    User = apps.get_model("accounts", "User")
    by_email = {u.email.lower(): u.pk for u in User.objects.all().only("pk", "email")}
    by_register = {}
    for pk, register_no in User.objects.exclude(register_no__isnull=True).exclude(register_no="").values_list("pk", "register_no"):
        by_register[register_no.strip().lower()] = pk
    for sub in Submission.objects.filter(student__isnull=True).exclude(student_name__isnull=True):
        key = (sub.student_name or "").strip().lower()
        student_pk = by_email.get(key) or by_register.get(key)
        if student_pk:
            sub.student_id = student_pk
            sub.save(update_fields=["student"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("assignments", "0002_feedbacktemplate_rubriccriterion"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="submission",
            name="student",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="submissions", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(link_submissions_to_students, migrations.RunPython.noop),
    ]
