from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="StudentActivity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("student_id", models.IntegerField(db_index=True)),
                ("source_id", models.CharField(max_length=100)),
                ("activity_type", models.CharField(choices=[("assignment", "Assignment"), ("exam", "Exam"), ("game", "Game"), ("lesson", "Lesson")], max_length=30)),
                ("title", models.CharField(max_length=255)),
                ("score", models.FloatField(blank=True, null=True)),
                ("status", models.CharField(blank=True, max_length=50)),
                ("occurred_at", models.DateTimeField(db_index=True)),
            ],
            options={"ordering": ["-occurred_at"]},
        ),
        migrations.AddIndex(
            model_name="studentactivity",
            index=models.Index(fields=["student_id", "-occurred_at"], name="core_stude_student_4e9f7e_idx"),
        ),
        migrations.AddConstraint(
            model_name="studentactivity",
            constraint=models.UniqueConstraint(fields=("student_id", "activity_type", "source_id"), name="unique_student_activity_source"),
        ),
    ]
