from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0006_quiz_is_public"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizsession",
            name="lobby_locked",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="quizplayer",
            name="token",
            field=models.CharField(blank=True, default="", editable=False, max_length=64),
        ),
    ]
