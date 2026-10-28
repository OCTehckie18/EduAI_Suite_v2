from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0004_question_started_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizsession",
            name="is_test_run",
            field=models.BooleanField(default=False),
        ),
    ]
