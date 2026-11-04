from rest_framework import serializers

from .models import Batch, Campus, Department, Program, School, Section

AUDIT_FIELDS = ["created_at", "updated_at", "is_active", "deleted_at"]


class CampusSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Campus
        fields = "__all__"
        read_only_fields = AUDIT_FIELDS


class SchoolSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)
    campus_detail = CampusSerializer(source="campus", read_only=True)
    campus = serializers.PrimaryKeyRelatedField(queryset=Campus.objects.all(), write_only=True)

    class Meta:
        model = School
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "campus", "campus_detail", "child_count"]
        read_only_fields = AUDIT_FIELDS


class DepartmentSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)
    school_detail = SchoolSerializer(source="school", read_only=True)
    school = serializers.PrimaryKeyRelatedField(queryset=School.objects.all(), write_only=True)

    class Meta:
        model = Department
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "school", "school_detail", "child_count"]
        read_only_fields = AUDIT_FIELDS


class ProgramSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)
    department_detail = DepartmentSerializer(source="department", read_only=True)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), write_only=True)

    class Meta:
        model = Program
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "department", "degree_level", "duration_years", "department_detail", "child_count"]
        read_only_fields = AUDIT_FIELDS

    def validate_duration_years(self, value):
        if value < 1:
            raise serializers.ValidationError("Duration must be at least one year.")
        return value


class BatchSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)
    program_detail = ProgramSerializer(source="program", read_only=True)
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all(), write_only=True)

    class Meta:
        model = Batch
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "program", "start_year", "end_year", "academic_year", "program_detail", "child_count"]
        read_only_fields = AUDIT_FIELDS

    def validate(self, attrs):
        start = attrs.get("start_year", getattr(self.instance, "start_year", None))
        end = attrs.get("end_year", getattr(self.instance, "end_year", None))
        if start is not None and end is not None and start > end:
            raise serializers.ValidationError({"end_year": "End year cannot be before the start year."})
        return attrs


class SectionSerializer(serializers.ModelSerializer):
    child_count = serializers.IntegerField(read_only=True, default=0)
    batch_detail = BatchSerializer(source="batch", read_only=True)
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), write_only=True)

    class Meta:
        model = Section
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "batch", "max_capacity", "batch_detail", "child_count"]
        read_only_fields = AUDIT_FIELDS

    def validate_max_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least 1.")
        return value
