from rest_framework import serializers

from apps.accounts.models import User
from apps.institution.models import Batch, Department, Program, Section

from .models import Classroom, Enrollment


class ClassroomSerializer(serializers.ModelSerializer):
    teacher_detail = serializers.SerializerMethodField(read_only=True)
    department_detail = serializers.SerializerMethodField(read_only=True)
    program_detail = serializers.SerializerMethodField(read_only=True)
    batch_detail = serializers.SerializerMethodField(read_only=True)
    section_detail = serializers.SerializerMethodField(read_only=True)
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), write_only=True)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), write_only=True)
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all(), write_only=True)
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), write_only=True)
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), write_only=True, required=False, allow_null=True)

    class Meta:
        model = Classroom
        fields = [
            "id", "created_at", "updated_at", "is_active", "deleted_at", "name", "subject_code",
            "teacher", "department", "program", "batch", "section", "enrollment_code",
            "teacher_detail", "department_detail", "program_detail", "batch_detail", "section_detail",
        ]
        read_only_fields = ["enrollment_code"]

    def get_teacher_detail(self, obj):
        return {"id": obj.teacher_id, "name": obj.teacher.full_name, "email": obj.teacher.email}

    def _detail(self, value):
        return {"id": value.pk, "name": str(value)} if value else None

    def get_department_detail(self, obj):
        return self._detail(obj.department)

    def get_program_detail(self, obj):
        return self._detail(obj.program)

    def get_batch_detail(self, obj):
        return self._detail(obj.batch)

    def get_section_detail(self, obj):
        return self._detail(obj.section)

    def validate(self, attrs):
        program = attrs.get("program", getattr(self.instance, "program", None))
        department = attrs.get("department", getattr(self.instance, "department", None))
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        teacher = attrs.get("teacher", getattr(self.instance, "teacher", None))
        if teacher and teacher.role not in {User.Role.TEACHER, User.Role.MASTER_ADMIN, User.Role.CAMPUS_ADMIN}:
            raise serializers.ValidationError({"teacher": "The selected user is not a teacher or administrator."})
        if program and department and program.department_id != department.id:
            raise serializers.ValidationError({"program": "Program must belong to the selected department."})
        if batch and program and batch.program_id != program.id:
            raise serializers.ValidationError({"batch": "Batch must belong to the selected program."})
        if section and batch and section.batch_id != batch.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected batch."})
        return attrs


class EnrollmentSerializer(serializers.ModelSerializer):
    student_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "classroom", "student", "enrolled_at", "is_active", "deleted_at", "student_detail"]
        read_only_fields = ["enrolled_at"]

    def get_student_detail(self, obj):
        return {
            "id": obj.student_id,
            "email": obj.student.email,
            "name": obj.student.full_name,
            "register_no": obj.student.register_no,
            "section": obj.student.section_id,
        }
