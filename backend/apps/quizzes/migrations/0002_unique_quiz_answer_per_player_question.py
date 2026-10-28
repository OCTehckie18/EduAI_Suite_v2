from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="quizanswer",
            constraint=models.UniqueConstraint(
                fields=("player", "question"),
                name="unique_quiz_answer_per_player_question",
            ),
        ),
    ]
