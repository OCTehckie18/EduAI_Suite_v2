from django.urls import path
from .views import (
    QuizListCreateView,
    QuizDetailView,
    QuizHostView,
    QuizSessionListView,
    QuizSessionDetailView,
    QuizSessionJoinView,
    QuizLeaderboardView,
)

urlpatterns = [
    path("", QuizListCreateView.as_view(), name="quiz-list-create"),
    path("<int:quiz_id>", QuizDetailView.as_view(), name="quiz-detail"),
    path("<int:quiz_id>/host", QuizHostView.as_view(), name="quiz-host"),
    path("<int:quiz_id>/session", QuizHostView.as_view(),
         name="quiz-session-create"),
    path("session/<str:pin>", QuizSessionDetailView.as_view(),
         name="quiz-session-detail"),
    path("sessions", QuizSessionListView.as_view(), name="quiz-session-list"),
    path("sessions/<str:pin>", QuizSessionDetailView.as_view(),
         name="quiz-session-detail-plural"),
    path("session/<str:pin>/join", QuizSessionJoinView.as_view(),
         name="quiz-session-join"),
    path("sessions/<str:pin>/join", QuizSessionJoinView.as_view(),
         name="quiz-session-join-plural"),
    path("session/<str:pin>/leaderboard", QuizLeaderboardView.as_view(),
         name="quiz-session-leaderboard"),
]
