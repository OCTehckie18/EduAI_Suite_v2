from django.urls import path
from .views import (
    QuizListCreateView,
    QuizDetailView,
    QuizHostView,
    QuizSessionDetailView,
    QuizSessionJoinView,
    QuizLeaderboardView,
)

urlpatterns = [
    path("", QuizListCreateView.as_view(), name="quiz-list-create"),
    path("<int:quiz_id>", QuizDetailView.as_view(), name="quiz-detail"),
    path("<int:quiz_id>/host", QuizHostView.as_view(), name="quiz-host"),
    path("session/<str:pin>", QuizSessionDetailView.as_view(), name="quiz-session-detail"),
    path("session/<str:pin>/join", QuizSessionJoinView.as_view(), name="quiz-session-join"),
    path("session/<str:pin>/leaderboard", QuizLeaderboardView.as_view(), name="quiz-session-leaderboard"),
]
