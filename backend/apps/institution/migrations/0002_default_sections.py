from django.db import migrations


def add_missing_default_sections(apps, schema_editor):
    """Every class must have at least one section; give existing section-less classes a Section A."""
    Batch = apps.get_model("institution", "Batch")
    Section = apps.get_model("institution", "Section")
    for batch in Batch.objects.filter(is_active=True):
        if Section.objects.filter(batch=batch, is_active=True).exists():
            continue
        dormant = Section.objects.filter(batch=batch).order_by("name").first()
        if dormant:
            dormant.is_active = True
            dormant.deleted_at = None
            dormant.save(update_fields=["is_active", "deleted_at"])
        else:
            Section.objects.create(batch=batch, name="A", max_capacity=60)


class Migration(migrations.Migration):

    dependencies = [
        ("institution", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_missing_default_sections, migrations.RunPython.noop),
    ]
