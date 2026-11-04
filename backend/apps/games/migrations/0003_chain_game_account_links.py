import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def link_accounts(apps, schema_editor):
    """Point the old free-text teacher and student values at real accounts where they match one."""
    User = apps.get_model("accounts", "User")
    Game = apps.get_model("games", "ChainAnswerGame")
    Player = apps.get_model("games", "GamePlayer")

    existing = set(User.objects.values_list("pk", flat=True))
    for game in Game.objects.exclude(legacy_teacher_id__isnull=True):
        if game.legacy_teacher_id in existing:
            game.teacher_id = game.legacy_teacher_id
            game.save(update_fields=["teacher"])

    taken = set()
    for player in Player.objects.order_by("id"):
        key = (player.legacy_student_key or "").strip()
        if not key:
            continue
        user = User.objects.filter(register_no__iexact=key).first()
        if user is None and key.isdigit():
            user = User.objects.filter(pk=int(key)).first()
        # One account per game: a later duplicate stays unlinked (its name is kept for display).
        if user is not None and (player.game_id, user.pk) not in taken:
            taken.add((player.game_id, user.pk))
            player.student_id = user.pk
            player.save(update_fields=["student"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("games", "0002_wordcloudsession_wordcloudsubmission"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # The old columns are renamed first so the new links can take the ``teacher_id`` / ``student_id`` names.
        migrations.RenameField("chainanswergame", "teacher_id", "legacy_teacher_id"),
        migrations.RenameField("gameplayer", "student_id", "legacy_student_key"),
        migrations.AddField(
            model_name="chainanswergame",
            name="teacher",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="chain_games", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="gameplayer",
            name="student",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="chain_game_players", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(link_accounts, migrations.RunPython.noop),
        migrations.RemoveField("chainanswergame", "legacy_teacher_id"),
        migrations.RemoveField("gameplayer", "legacy_student_key"),
        migrations.AlterModelOptions("gameplayer", options={"ordering": ["join_order", "id"]}),
        migrations.AddConstraint(
            model_name="gameplayer",
            constraint=models.UniqueConstraint(
                condition=models.Q(("student__isnull", False)), fields=("game", "student"), name="unique_student_per_chain_game"
            ),
        ),
    ]
