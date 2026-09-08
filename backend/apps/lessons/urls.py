from django.urls import path
from .views import (
    LessonGenerateView,
    LessonParsePlanView,
    LessonListCreateView,
    LessonDetailView,
    LessonPostView,
)

urlpatterns = [
    path("", LessonListCreateView.as_view(), name="lesson-list-create"),
    path("generate", LessonGenerateView.as_view(), name="lesson-generate"),
    path("parse-plan", LessonParsePlanView.as_view(), name="lesson-parse-plan"),
    path("<int:lesson_id>", LessonDetailView.as_view(), name="lesson-detail"),
    path("<int:lesson_id>/post", LessonPostView.as_view(), name="lesson-post"),
]
