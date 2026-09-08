from rest_framework import serializers
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    date = serializers.SerializerMethodField()
    id = serializers.CharField(source="report_id", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id",
            "name",
            "type",
            "date",
            "status",
            "content",
            "target_id",
            "template_path",
            "docx_path",
        ]

    def get_date(self, obj):
        return obj.generated_at.strftime("%b %d, %Y") if obj.generated_at else ""
