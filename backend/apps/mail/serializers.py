from rest_framework import serializers
from .models import MailDraft, MailHistory


class MailDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailDraft
        fields = ["id", "subject", "body", "student_ids", "conditions", "created_at"]


class MailHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MailHistory
        fields = ["id", "subject", "body", "sent_at", "recipients", "recipient_count"]
