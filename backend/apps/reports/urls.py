from django.urls import path
from .views import (
    ReportListCreateView,
    ReportDetailView,
    ReportSendView,
    ReportDownloadView,
)

urlpatterns = [
    path("", ReportListCreateView.as_view(), name="report-list-create"),
    path("generate", ReportListCreateView.as_view(), name="report-generate"),
    path("<str:report_id>", ReportDetailView.as_view(), name="report-detail"),
    path("<str:report_id>/send", ReportSendView.as_view(), name="report-send"),
    path("<str:report_id>/download", ReportDownloadView.as_view(), name="report-download"),
]
