from django.db import migrations, models


def demote_campus_admins(apps, schema_editor):
    """The Campus Admin role no longer exists; fall back to the least privileged role."""
    User = apps.get_model("accounts", "User")
    User._base_manager.filter(role="CAMPUS_ADMIN").update(role="STUDENT")


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(demote_campus_admins, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(choices=[('MASTER_ADMIN', 'Master Admin'), ('TEACHER', 'Teacher'), ('STUDENT', 'Student')], default='STUDENT', max_length=20),
        ),
    ]
