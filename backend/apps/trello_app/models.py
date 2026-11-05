import secrets

from django.conf import settings
from django.db import models

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_join_code():
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))


class Board(models.Model):
    name = models.CharField(max_length=255)
    background = models.CharField(max_length=255, default="linear-gradient(135deg, #264796 0%, #3460c4 100%)")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_boards")
    join_code = models.CharField(max_length=12, unique=True, default=generate_join_code)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return f"{self.name} ({self.pk})"


class BoardMember(models.Model):
    """Who is on a board. A PENDING row is a join request waiting for the owner."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        MEMBER = "MEMBER", "Member"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        PENDING = "PENDING", "Pending"

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="board_memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    starred = models.BooleanField(default=False)  # a star belongs to one person, not to the board
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["board", "user"], name="one_membership_per_board_user")]
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.user_id} on {self.board_id} ({self.status})"


class BoardColumn(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="columns")
    title = models.CharField(max_length=255)
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sequence", "id"]

    def __str__(self):
        return f"{self.title} in {self.board_id}"


class BoardCard(models.Model):
    column = models.ForeignKey(BoardColumn, on_delete=models.CASCADE, related_name="cards")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    due_date = models.DateField(null=True, blank=True)
    sequence = models.PositiveIntegerField(default=0)
    labels = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sequence", "id"]

    def __str__(self):
        return f"{self.title} ({self.pk})"
