from django.urls import path

from . import views

urlpatterns = [
    path("forms", views.FormListView.as_view(), name="forms-list-create"),
    path("forms/<int:form_id>", views.FormDetailView.as_view(), name="forms-detail"),
    path("forms/<int:form_id>/status", views.FormStatusView.as_view(), name="forms-status"),
    path("forms/<int:form_id>/submit", views.FormSubmitView.as_view(), name="forms-submit"),
    path("forms/<int:form_id>/responses", views.FormResponsesView.as_view(), name="forms-responses"),
]
