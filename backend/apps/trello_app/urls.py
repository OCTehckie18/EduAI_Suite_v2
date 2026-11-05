from django.urls import path

from . import views

urlpatterns = [
    path("state", views.StateView.as_view(), name="trello-state"),
    path("suggested-members", views.SuggestedMembersView.as_view(), name="trello-suggested-members"),
    path("board", views.BoardListView.as_view(), name="trello-board-list-create"),
    path("board/join", views.BoardJoinView.as_view(), name="trello-board-join"),
    path("board/<int:board_id>", views.BoardDetailView.as_view(), name="trello-board-detail"),
    path("board/<int:board_id>/star", views.BoardStarView.as_view(), name="trello-board-star"),
    path("board/<int:board_id>/approve", views.BoardApproveView.as_view()),
    path("board/<int:board_id>/reject", views.BoardRejectView.as_view()),
    path("board/<int:board_id>/add-member", views.BoardAddMemberView.as_view()),
    path("board/<int:board_id>/remove-member", views.BoardRemoveMemberView.as_view()),
    path("board/<int:board_id>/leave", views.BoardLeaveView.as_view()),
    path("board/<int:board_id>/columns", views.ColumnListView.as_view()),
    path("board/<int:board_id>/columns/reorder", views.ColumnReorderView.as_view()),
    path("column/<int:column_id>", views.ColumnDetailView.as_view()),
    path("column/<int:column_id>/cards", views.CardListView.as_view()),
    path("card/<int:card_id>", views.CardDetailView.as_view()),
    path("card/<int:card_id>/move", views.CardMoveView.as_view()),
]
