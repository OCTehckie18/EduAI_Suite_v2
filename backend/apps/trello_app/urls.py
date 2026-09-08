from django.urls import path
from .views import (
    TrelloBoardListCreateView,
    TrelloBoardDetailView,
    TrelloSyncView,
    TrelloToggleStarView,
)

urlpatterns = [
    path("board", TrelloBoardListCreateView.as_view(), name="trello-board-list-create"),
    path("board/<str:board_id>", TrelloBoardDetailView.as_view(), name="trello-board-detail"),
    path("board/<str:board_id>/star", TrelloToggleStarView.as_view(), name="trello-board-star"),
    path("sync", TrelloSyncView.as_view(), name="trello-sync"),
]
