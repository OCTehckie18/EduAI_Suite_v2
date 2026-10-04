from django.urls import path
from .views import AIChatView, PromptSuggestionListView

urlpatterns = [
    path("chat", AIChatView.as_view(), name="ai-chat"),
    path("prompt-suggestions", PromptSuggestionListView.as_view(), name="ai-prompt-suggestions"),
]
