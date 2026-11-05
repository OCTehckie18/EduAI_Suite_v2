import datetime

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.trello_app.models


def copy_old_boards(apps, schema_editor):
    """Carry boards over when their owner is a real account.

    Old rows named people by free-text email. A board whose creator has no
    account cannot be given an owner, so it is left behind rather than guessed.
    """
    User = apps.get_model(settings.AUTH_USER_MODEL.split(".")[0], settings.AUTH_USER_MODEL.split(".")[1])
    OldBoard = apps.get_model("trello_app", "TrelloBoard")
    OldColumn = apps.get_model("trello_app", "TrelloColumn")
    OldCard = apps.get_model("trello_app", "TrelloCard")
    Board = apps.get_model("trello_app", "Board")
    BoardMember = apps.get_model("trello_app", "BoardMember")
    BoardColumn = apps.get_model("trello_app", "BoardColumn")
    BoardCard = apps.get_model("trello_app", "BoardCard")

    def user_for(email):
        return User.objects.filter(email__iexact=(email or "").strip()).first() if email else None

    for old in OldBoard.objects.all():
        owner = user_for(old.creator_email)
        if owner is None:
            continue
        board = Board.objects.create(
            name=old.name or "Untitled board",
            background=old.background or "linear-gradient(135deg, #264796 0%, #3460c4 100%)",
            owner=owner,
        )
        BoardMember.objects.create(board=board, user=owner, role="OWNER", status="ACTIVE", starred=bool(old.starred))
        for email in old.members or []:
            member = user_for(email)
            if member and member.pk != owner.pk:
                BoardMember.objects.get_or_create(board=board, user=member, defaults={"status": "ACTIVE"})
        for email in old.join_requests or []:
            requester = user_for(email)
            if requester and requester.pk != owner.pk:
                BoardMember.objects.get_or_create(board=board, user=requester, defaults={"status": "PENDING"})

        column_map = {}
        for col in OldColumn.objects.filter(board_id=old.id).order_by("sequence", "id"):
            column_map[col.id] = BoardColumn.objects.create(board=board, title=col.title or "Untitled", sequence=col.sequence)
        for card in OldCard.objects.filter(board_id=old.id).order_by("sequence", "id"):
            column = column_map.get(card.column_id)
            if column is None:
                continue
            due = None
            if card.due_date:
                try:
                    due = datetime.date.fromisoformat(card.due_date[:10])
                except ValueError:
                    due = None
            BoardCard.objects.create(
                column=column,
                title=card.title or "Untitled",
                description=card.description or "",
                due_date=due,
                sequence=card.sequence,
                labels=card.labels or [],
                checklist=card.checklist or [],
                created_by=owner,
            )


class Migration(migrations.Migration):

    dependencies = [
        ("trello_app", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Board",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("background", models.CharField(default="linear-gradient(135deg, #264796 0%, #3460c4 100%)", max_length=255)),
                ("join_code", models.CharField(default=apps.trello_app.models.generate_join_code, max_length=12, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_boards", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.CreateModel(
            name="BoardMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("OWNER", "Owner"), ("MEMBER", "Member")], default="MEMBER", max_length=10)),
                ("status", models.CharField(choices=[("ACTIVE", "Active"), ("PENDING", "Pending")], default="ACTIVE", max_length=10)),
                ("starred", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("board", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="trello_app.board")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="board_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["created_at", "id"]},
        ),
        migrations.AddConstraint(
            model_name="boardmember",
            constraint=models.UniqueConstraint(fields=("board", "user"), name="one_membership_per_board_user"),
        ),
        migrations.CreateModel(
            name="BoardColumn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("sequence", models.PositiveIntegerField(default=0)),
                ("board", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="columns", to="trello_app.board")),
            ],
            options={"ordering": ["sequence", "id"]},
        ),
        migrations.CreateModel(
            name="BoardCard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                ("due_date", models.DateField(blank=True, null=True)),
                ("sequence", models.PositiveIntegerField(default=0)),
                ("labels", models.JSONField(blank=True, default=list)),
                ("checklist", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("column", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="cards", to="trello_app.boardcolumn")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["sequence", "id"]},
        ),
        migrations.RunPython(copy_old_boards, migrations.RunPython.noop),
        migrations.DeleteModel(name="TrelloCard"),
        migrations.DeleteModel(name="TrelloColumn"),
        migrations.DeleteModel(name="TrelloBoard"),
    ]
