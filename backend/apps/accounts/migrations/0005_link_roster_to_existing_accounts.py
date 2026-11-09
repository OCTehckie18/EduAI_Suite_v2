"""Connect roster entries to student accounts that existed before the entry was uploaded."""

from django.db import migrations

PLACEMENT = ("campus", "school", "department", "program", "batch", "section")


def link(apps, schema_editor):
    AdmittedStudent = apps.get_model("accounts", "AdmittedStudent")
    User = apps.get_model("accounts", "User")
    linked = set(AdmittedStudent.objects.exclude(user=None).values_list("user_id", flat=True))
    for entry in AdmittedStudent.objects.filter(user=None).select_related("section__batch__program__department__school"):
        user = User.objects.filter(email__iexact=entry.email, role="STUDENT").first()
        if user is None or user.pk in linked:
            continue
        register = entry.register_no.strip().lower()
        if user.register_no and user.register_no.strip().lower() != register:
            continue
        if User.objects.filter(register_no__iexact=entry.register_no).exclude(pk=user.pk).exists():
            continue
        section = entry.section
        batch = section.batch
        program = batch.program
        department = program.department
        school = department.school
        values = {"campus": school.campus_id, "school": school.pk, "department": department.pk,
                  "program": program.pk, "batch": batch.pk, "section": section.pk}
        for name in PLACEMENT:
            setattr(user, f"{name}_id", values[name])
        user.register_no = entry.register_no
        user.save()
        entry.user_id = user.pk
        entry.save(update_fields=["user"])
        linked.add(user.pk)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_admitted_student_roster"),
    ]

    operations = [
        migrations.RunPython(link, migrations.RunPython.noop),
    ]
