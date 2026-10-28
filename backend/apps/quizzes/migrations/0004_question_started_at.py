from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0003_unique_quiz_player_nickname_per_session"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizsession",
            name="question_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
