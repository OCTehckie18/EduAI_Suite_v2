from django.urls import path

from .views import CurrentUserView, GoogleLoginView, PasswordLoginView, ProfileSetupView, RefreshTokenView

urlpatterns = [
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("login/", PasswordLoginView.as_view(), name="password-login"),
    path("refresh/", RefreshTokenView.as_view(), name="refresh-token"),
    path("profile/setup/", ProfileSetupView.as_view(), name="profile-setup"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
]
