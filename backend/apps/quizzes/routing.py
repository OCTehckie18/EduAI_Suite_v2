from django.urls import path

from .consumers import QuizConsumer
from apps.games.consumers import WordCloudConsumer


websocket_urlpatterns = [
    path("ws/quiz/<str:pin>", QuizConsumer.as_asgi()),
    path("ws/wordcloud/<str:pin>", WordCloudConsumer.as_asgi()),
]
