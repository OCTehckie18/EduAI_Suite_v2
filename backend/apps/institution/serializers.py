from rest_framework import serializers

from .models import Batch, Campus, Department, Program, School, Section


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = "__all__"


class SchoolSerializer(serializers.ModelSerializer):
    campus_detail = CampusSerializer(source="campus", read_only=True)
    campus = serializers.PrimaryKeyRelatedField(queryset=Campus.objects.all(), write_only=True)

    class Meta:
        model = School
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "campus", "campus_detail"]


class DepartmentSerializer(serializers.ModelSerializer):
    school_detail = SchoolSerializer(source="school", read_only=True)
    school = serializers.PrimaryKeyRelatedField(queryset=School.objects.all(), write_only=True)

    class Meta:
        model = Department
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "school", "school_detail"]


class ProgramSerializer(serializers.ModelSerializer):
    department_detail = DepartmentSerializer(source="department", read_only=True)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), write_only=True)

    class Meta:
        model = Program
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "code", "department", "degree_level", "duration_years", "department_detail"]


class BatchSerializer(serializers.ModelSerializer):
    program_detail = ProgramSerializer(source="program", read_only=True)
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all(), write_only=True)

    class Meta:
        model = Batch
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "program", "start_year", "end_year", "academic_year", "program_detail"]


class SectionSerializer(serializers.ModelSerializer):
    batch_detail = BatchSerializer(source="batch", read_only=True)
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), write_only=True)

    class Meta:
        model = Section
        fields = ["id", "created_at", "updated_at", "is_active", "deleted_at", "name", "batch", "max_capacity", "batch_detail"]
