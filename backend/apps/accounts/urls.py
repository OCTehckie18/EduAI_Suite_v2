from django.urls import path

from .views import CurrentUserView, GoogleLoginView

urlpatterns = [
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
]
