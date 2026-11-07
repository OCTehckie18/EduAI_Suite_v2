from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import admit, default_section
from apps.classrooms.models import Classroom, Enrollment


class BulkEnrollTests(TestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        dept = program.department
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", department=dept)
        self.course = Classroom.objects.create(
            name="Maths", subject_code="M1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        admit("a@x.com", "R1", "Asha", section)
        admit("b@x.com", "R2", "Ben", section)
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)

    def upload(self, text, name="students.csv"):
        file = SimpleUploadedFile(name, text.encode(), content_type="text/csv")
        return self.client.post(f"/students/bulk_upload/{self.course.pk}", {"file": file}, format="multipart")

    def test_the_result_says_who_was_enrolled_and_who_was_skipped_and_why(self):
        res = self.upload("Email,Name\na@x.com,Asha\nghost@x.com,Nobody\nb@x.com,Ben\n")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual((data["enrolled"], data["already_enrolled"]), (2, 0))
        self.assertEqual([s["who"] for s in data["skipped"]], ["ghost@x.com"])
        self.assertIn("admitted-students", data["skipped"][0]["reason"])
        self.assertEqual(Enrollment.objects.filter(classroom=self.course).count(), 2)

    def test_uploading_the_same_file_again_reports_already_enrolled(self):
        self.upload("Email\na@x.com\n")
        res = self.upload("Email\na@x.com\n")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.json()["enrolled"], res.json()["already_enrolled"]), (0, 1))

    def test_a_file_with_nobody_usable_explains_why(self):
        res = self.upload("Email\nghost@x.com\n")
        self.assertEqual(res.status_code, 400)
        self.assertIn("ghost@x.com", res.json()["detail"])
        res = self.upload("Name\nAsha\n")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Email column", res.json()["detail"])

    def test_only_the_courses_teacher_can_upload(self):
        other = User.objects.create_user(email="o@x.com", password="x", role="TEACHER")
        client = APIClient()
        client.force_authenticate(other)
        file = SimpleUploadedFile("s.csv", b"Email\na@x.com\n", content_type="text/csv")
        self.assertEqual(client.post(f"/students/bulk_upload/{self.course.pk}", {"file": file}, format="multipart").status_code, 403)
        self.assertEqual(Enrollment.objects.count(), 0)
