import re

from rest_framework import serializers

from .models import Campus, DemoRequest

PHONE = re.compile(r"^[0-9+()\-.\s]{6,32}$")


class DemoRequestCreateSerializer(serializers.ModelSerializer):
    """What the public form may send. Status and notes are for staff only."""

    # Honeypot: hidden from people, so only bots fill it in. Checked in the view.
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)
    approx_students = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=1_000_000)

    class Meta:
        model = DemoRequest
        fields = ["id", "name", "role", "institution", "city", "approx_students", "work_email", "phone", "message", "consent", "website", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"consent": {"required": True}}

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Please tell us your name.")
        return value

    def validate_institution(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Please tell us which college or university you are from.")
        return value

    def validate_role(self, value: str) -> str:
        return value.strip()

    def validate_work_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_phone(self, value: str) -> str:
        value = value.strip()
        if value and not PHONE.match(value):
            raise serializers.ValidationError("Use digits, spaces and + ( ) - only.")
        return value

    def validate_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError("Please agree to be contacted so we can reply.")
        return value

    def create(self, validated_data):
        validated_data.pop("website", None)
        return super().create(validated_data)


class DemoRequestStaffSerializer(serializers.ModelSerializer):
    """The sales team's view: everything, but only status and notes can change."""

    class Meta:
        model = DemoRequest
        fields = "__all__"
        read_only_fields = [f.name for f in DemoRequest._meta.fields if f.name not in {"status", "notes"}]


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
