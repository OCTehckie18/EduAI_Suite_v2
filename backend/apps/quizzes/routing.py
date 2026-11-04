from django.urls import path

from .consumers import QuizConsumer
from apps.games.consumers import WordCloudConsumer
from apps.games.chain_consumer import ChainAnswerConsumer


websocket_urlpatterns = [
    path("ws/quiz/<str:pin>", QuizConsumer.as_asgi()),
    path("ws/wordcloud/<str:pin>", WordCloudConsumer.as_asgi()),
    path("ws/games/chain-answer/<str:session_id>", ChainAnswerConsumer.as_asgi()),
]
