from django.urls import path

from .consumers import QuizConsumer


websocket_urlpatterns = [
    path("ws/quiz/<str:pin>", QuizConsumer.as_asgi()),
]
