from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("quizzes", "0007_lobby_lock_and_player_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizanswer",
            name="selected_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
