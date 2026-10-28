from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0002_unique_quiz_answer_per_player_question"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="quizplayer",
            constraint=models.UniqueConstraint(
                fields=("session", "nickname"),
                name="unique_quiz_player_nickname_per_session",
            ),
        ),
    ]
