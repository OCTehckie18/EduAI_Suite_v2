from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Classroom, Enrollment


class ClassroomTests(APITestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name="Central Campus", code="CENTRAL", city="Bengaluru")
        self.school = School.objects.create(name="School of Sciences", code="SOS", campus=self.campus)
        self.department = Department.objects.create(name="Computer Science", code="CSE", school=self.school)
        self.program = Program.objects.create(
            name="B.Tech Computer Science", code="BTECH-CSE", department=self.department,
            degree_level=Program.DegreeLevel.UG, duration_years=4,
        )
        self.batch = Batch.objects.create(
            name="2025-29", program=self.program, start_year=2025, end_year=2029,
            academic_year="2025-26",
        )
        self.section = Section.objects.create(name="A", batch=self.batch, max_capacity=2)
        self.teacher = get_user_model().objects.create_user(
            email="teacher@example.com", password="password123", role=get_user_model().Role.TEACHER,
            campus=self.campus, school=self.school, department=self.department, is_profile_complete=True,
        )
        self.client.force_authenticate(user=self.teacher)

    def create_classroom(self):
        return Classroom.objects.create(
            name="Data Structures", subject_code="CS201", teacher=self.teacher,
            department=self.department, program=self.program, batch=self.batch, section=self.section,
        )

    def test_create_classroom_and_download_template(self):
        response = self.client.post(
            reverse("classroom-list"),
            {
                "name": "Data Structures", "subject_code": "CS201", "teacher": self.teacher.pk,
                "department": self.department.pk, "program": self.program.pk, "batch": self.batch.pk,
                "section": self.section.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["enrollment_code"].startswith("EDU-"))
        template = self.client.get(reverse("classroom-enrollment-template"))
        self.assertEqual(template.status_code, 200)
        self.assertEqual(template["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    def test_csv_upload_provisions_and_enrolls_students(self):
        classroom = self.create_classroom()
        csv_data = "Register No,Student Name,Student Email,Section\nSTU001,Student One,student1@example.com,A\n,Student Two,student2@example.com,A\n"
        upload = SimpleUploadedFile("students.csv", csv_data.encode(), content_type="text/csv")
        response = self.client.post(
            reverse("classroom-enroll-upload", args=[classroom.pk]), {"file": upload}, format="multipart"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["enrolled"], 2)
        self.assertEqual(response.data["provisioned"], 2)
        self.assertEqual(Enrollment.objects.filter(classroom=classroom).count(), 2)
        student = get_user_model().objects.get(email="student1@example.com")
        self.assertEqual(student.register_no, "STU001")
        self.assertEqual(student.section_id, self.section.pk)

    def test_classroom_delete_soft_deletes_enrollments(self):
        classroom = self.create_classroom()
        student = get_user_model().objects.create_user(email="student@example.com", role=get_user_model().Role.STUDENT)
        Enrollment.objects.create(classroom=classroom, student=student)
        classroom.delete()

        self.assertFalse(Classroom.objects.filter(pk=classroom.pk).exists())
        self.assertFalse(Enrollment.objects.filter(classroom=classroom).exists())
        self.assertFalse(Enrollment.all_objects.get(classroom=classroom).is_active)
