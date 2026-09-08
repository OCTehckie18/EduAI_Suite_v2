from rest_framework import serializers
from .models import TrelloBoard, TrelloColumn, TrelloCard


class TrelloCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrelloCard
        fields = [
            "id",
            "column_id",
            "board_id",
            "title",
            "description",
            "due_date",
            "sequence",
            "labels",
            "checklist",
            "created_at",
        ]


class TrelloColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrelloColumn
        fields = ["id", "board_id", "title", "sequence"]


class TrelloBoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrelloBoard
        fields = [
            "id",
            "name",
            "background",
            "creator_email",
            "starred",
            "members",
            "join_requests",
            "created_at",
            "updated_at",
        ]
