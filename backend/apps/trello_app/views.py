import uuid
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TrelloBoard, TrelloColumn, TrelloCard
from .serializers import TrelloBoardSerializer, TrelloColumnSerializer, TrelloCardSerializer


class TrelloBoardListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        email = request.query_params.get("user_email")
        qs = TrelloBoard.objects.all()
        if email:
            qs = [b for b in qs if b.creator_email == email or email in (b.members or [])]
            return Response(TrelloBoardSerializer(qs, many=True).data)
        return Response(TrelloBoardSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data
        board_id = data.get("id") or str(uuid.uuid4())
        creator_email = data.get("creator_email", "user@eduai.suite")

        board = TrelloBoard.objects.create(
            id=board_id,
            name=data.get("name", "Untitled Board"),
            background=data.get("background", "linear-gradient(135deg, #0079bf, #5067c5)"),
            creator_email=creator_email,
            starred=bool(data.get("starred", False)),
            members=[creator_email],
            join_requests=[],
        )

        # Default columns: To Do, Doing, Done
        defaults = ["To Do", "Doing", "Done"]
        for idx, title in enumerate(defaults):
            TrelloColumn.objects.create(
                id=str(uuid.uuid4()),
                board_id=board.id,
                title=title,
                sequence=idx,
            )

        return Response(TrelloBoardSerializer(board).data, status=status.HTTP_201_CREATED)


class TrelloBoardDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, board_id):
        board = get_object_or_404(TrelloBoard, pk=board_id)
        columns = TrelloColumn.objects.filter(board_id=board_id)
        cards = TrelloCard.objects.filter(board_id=board_id)

        return Response({
            "board": TrelloBoardSerializer(board).data,
            "columns": TrelloColumnSerializer(columns, many=True).data,
            "cards": TrelloCardSerializer(cards, many=True).data,
        })

    def delete(self, request, board_id):
        board = get_object_or_404(TrelloBoard, pk=board_id)
        TrelloColumn.objects.filter(board_id=board_id).delete()
        TrelloCard.objects.filter(board_id=board_id).delete()
        board.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrelloSyncView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        board_data = data.get("board", {})
        columns_data = data.get("columns", [])
        cards_data = data.get("cards", [])

        board_id = board_data.get("id")
        if not board_id:
            return Response({"detail": "Board ID required"}, status=status.HTTP_400_BAD_REQUEST)

        board, _ = TrelloBoard.objects.get_or_create(
            id=board_id,
            defaults={
                "name": board_data.get("name", "Untitled Board"),
                "background": board_data.get("background"),
                "creator_email": board_data.get("creator_email"),
                "starred": board_data.get("starred", False),
            }
        )

        if "name" in board_data: board.name = board_data["name"]
        if "background" in board_data: board.background = board_data["background"]
        if "starred" in board_data: board.starred = board_data["starred"]
        board.save()

        # Sync columns
        existing_col_ids = []
        for col_d in columns_data:
            c_id = col_d.get("id") or str(uuid.uuid4())
            existing_col_ids.append(c_id)
            TrelloColumn.objects.update_or_create(
                id=c_id,
                defaults={
                    "board_id": board_id,
                    "title": col_d.get("title", ""),
                    "sequence": col_d.get("sequence", 0),
                }
            )

        # Sync cards
        for card_d in cards_data:
            c_id = card_d.get("id") or str(uuid.uuid4())
            TrelloCard.objects.update_or_create(
                id=c_id,
                defaults={
                    "column_id": card_d.get("column_id"),
                    "board_id": board_id,
                    "title": card_d.get("title", ""),
                    "description": card_d.get("description", ""),
                    "due_date": card_d.get("due_date"),
                    "sequence": card_d.get("sequence", 0),
                    "labels": card_d.get("labels", []),
                    "checklist": card_d.get("checklist", []),
                }
            )

        return Response({"status": "synced", "board_id": board_id})


class TrelloToggleStarView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, board_id):
        board = get_object_or_404(TrelloBoard, pk=board_id)
        board.starred = not board.starred
        board.save()
        return Response({"starred": board.starred})
