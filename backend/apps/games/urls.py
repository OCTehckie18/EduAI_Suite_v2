from django.urls import path
from .views import (
    ChainAnswerGameListCreateView,
    ChainAnswerGameDetailView,
    ChainAnswerGameJoinView,
    ChainAnswerGameStartView,
    ChainAnswerGameEndView,
    ChainAnswerGameSubmitWordView,
    WordSuggestionsView,
    ValidateWordView,
)

urlpatterns = [
    path("chain-answer", ChainAnswerGameListCreateView.as_view(), name="game-chain-answer-list-create"),
    path("chain-answer/<str:session_id>", ChainAnswerGameDetailView.as_view(), name="game-chain-answer-detail"),
    path("chain-answer/<str:session_id>/join", ChainAnswerGameJoinView.as_view(), name="game-chain-answer-join"),
    path("chain-answer/<str:session_id>/start", ChainAnswerGameStartView.as_view(), name="game-chain-answer-start"),
    path("chain-answer/<str:session_id>/end", ChainAnswerGameEndView.as_view(), name="game-chain-answer-end"),
    path("chain-answer/<str:session_id>/words", ChainAnswerGameSubmitWordView.as_view(), name="game-chain-answer-words"),
    path("word-suggestions", WordSuggestionsView.as_view(), name="game-word-suggestions"),
    path("validate-word", ValidateWordView.as_view(), name="game-validate-word"),
]
