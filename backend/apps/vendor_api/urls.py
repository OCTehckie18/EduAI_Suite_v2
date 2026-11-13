from django.urls import path

from . import views

urlpatterns = [
    path("summary/", views.VendorSummaryView.as_view()),
    path("admins/", views.VendorAdminsView.as_view()),
    path("admins/<int:admin_id>/disable/", views.VendorAdminDisableView.as_view()),
    path("admins/<int:admin_id>/enable/", views.VendorAdminEnableView.as_view()),
    path("admins/<int:admin_id>/reset-link/", views.VendorAdminResetView.as_view()),
    path("set-password/", views.SetPasswordView.as_view()),
    path("actions/", views.VendorActionsListView.as_view()),
]
