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

    def test_original_courses_and_students_endpoints_are_compatible(self):
        course_response = self.client.post(
            "/api/v1/courses/",
            {
                "code": "CS201",
                "name": "Data Structures",
                "batch": self.batch.name,
                "color": "#264796",
                "description": "Original course contract",
            },
            format="json",
        )
        self.assertEqual(course_response.status_code, 201)
        course = course_response.data
        self.assertEqual(course["code"], "CS201")
        self.assertEqual(course["students"], 0)
        self.assertEqual(len(course["enrollment_code"]), 6)

        courses_response = self.client.get("/api/v1/courses/")
        self.assertEqual(courses_response.status_code, 200)
        self.assertEqual(courses_response.data[0]["id"], course["id"])

        all_students_response = self.client.get("/api/v1/students/")
        self.assertEqual(all_students_response.status_code, 200)
        self.assertEqual(all_students_response.data, [])

        student_response = self.client.post(
            f"/api/v1/students/{course['id']}",
            {
                "name": "Student One",
                "email": "student1@example.com",
                "registration_number": "STU001",
                "student_class": "A",
                "department": "Computer Science",
            },
            format="json",
        )
        self.assertEqual(student_response.status_code, 201)
        self.assertEqual(student_response.data["course_id"], course["id"])

        students_response = self.client.get(f"/api/v1/students/{course['id']}")
        self.assertEqual(students_response.status_code, 200)
        self.assertEqual(students_response.data[0]["registration_number"], "STU001")

        code_response = self.client.post(
            f"/api/v1/students/enroll/code?enrollment_code={course['enrollment_code']}",
            {
                "name": "Student Two",
                "email": "student2@example.com",
                "registration_number": "STU002",
                "student_class": "A",
                "department": "Computer Science",
            },
            format="json",
        )
        self.assertEqual(code_response.status_code, 201)
        self.assertEqual(code_response.data["registration_number"], "STU002")

        bulk_upload = SimpleUploadedFile(
            "students.csv",
            b"Register No,Student Name,Student Email,Section\nSTU003,Student Three,student3@example.com,A\n",
            content_type="text/csv",
        )
        bulk_response = self.client.post(
            f"/api/v1/students/bulk_upload/{course['id']}",
            {"file": bulk_upload},
            format="multipart",
        )
        self.assertEqual(bulk_response.status_code, 201)
        self.assertIn("Successfully enrolled 1 students", bulk_response.data["message"])
        self.assertEqual(self.client.get(f"/api/v1/students/{course['id']}/active").status_code, 200)

        delete_response = self.client.delete(f"/api/v1/students/{student_response.data['id']}")
        self.assertEqual(delete_response.status_code, 204)
