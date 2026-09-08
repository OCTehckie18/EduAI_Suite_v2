from django.db import models


class TrelloBoard(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    background = models.CharField(max_length=255, blank=True, null=True)
    creator_email = models.CharField(max_length=255, blank=True, null=True)
    starred = models.BooleanField(default=False)
    members = models.JSONField(default=list, blank=True)
    join_requests = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.id})"


class TrelloColumn(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    board_id = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    sequence = models.IntegerField(default=0)

    class Meta:
        ordering = ["sequence", "id"]

    def __str__(self):
        return f"{self.title} in {self.board_id}"


class TrelloCard(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    column_id = models.CharField(max_length=100, db_index=True)
    board_id = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    due_date = models.CharField(max_length=100, blank=True, null=True)
    sequence = models.IntegerField(default=0)
    labels = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sequence", "id"]

    def __str__(self):
        return f"{self.title} ({self.id})"
