from django.urls import path
from .views import (
    MailGenerateView,
    MailFilterView,
    MailParseExcelView,
    MailDraftListCreateView,
    MailDraftDetailView,
    MailSendView,
    MailGmailLogView,
    MailHistoryListView,
    MailHistoryDetailView,
)

urlpatterns = [
    path("generate", MailGenerateView.as_view(), name="mail-generate"),
    path("filter", MailFilterView.as_view(), name="mail-filter"),
    path("parse-excel", MailParseExcelView.as_view(), name="mail-parse-excel"),
    path("drafts", MailDraftListCreateView.as_view(), name="mail-drafts-list-create"),
    path("drafts/<int:draft_id>", MailDraftDetailView.as_view(), name="mail-draft-detail"),
    path("send", MailSendView.as_view(), name="mail-send"),
    path("log-gmail", MailGmailLogView.as_view(), name="mail-log-gmail"),
    path("history", MailHistoryListView.as_view(), name="mail-history-list"),
    path("history/<int:history_id>", MailHistoryDetailView.as_view(), name="mail-history-detail"),
]
