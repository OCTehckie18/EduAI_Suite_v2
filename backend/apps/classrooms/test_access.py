from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.institution.models import Batch, Campus, Department, Program, School

from .models import Classroom, Enrollment

User = get_user_model()


class ClassroomAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        campus = Campus.objects.create(name="Central", code="C", city="Bengaluru")
        school = School.objects.create(name="Sci", code="S", campus=campus)
        self.department = Department.objects.create(name="CS", code="CS", school=school)
        self.program = Program.objects.create(
            name="BCA", code="BCA", department=self.department, degree_level="UG", duration_years=3
        )
        self.batch = Batch.objects.create(
            name="2025", program=self.program, start_year=2025, end_year=2028, academic_year="2025-26"
        )

        self.owner = User.objects.create_user(email="owner@example.com", password="x", role="TEACHER", department=self.department)
        self.other_teacher = User.objects.create_user(email="other@example.com", password="x", role="TEACHER", department=self.department)
        self.admin = User.objects.create_user(email="admin@example.com", password="x", role="MASTER_ADMIN")
        self.student = User.objects.create_user(
            email="stu@example.com", password="x", role="STUDENT", register_no="R1", first_name="Stu"
        )
        self.outsider = User.objects.create_user(
            email="out@example.com", password="x", role="STUDENT", register_no="R2", first_name="Out"
        )
        self.classroom = Classroom.objects.create(
            name="Maths", subject_code="M1", teacher=self.owner,
            department=self.department, program=self.program, batch=self.batch,
        )
        Enrollment.objects.create(classroom=self.classroom, student=self.student)

    def as_user(self, user):
        self.client.force_authenticate(user)

    def test_only_owner_or_admin_can_modify_or_delete_course(self):
        url = f"/courses/{self.classroom.pk}"
        for user in (self.student, self.outsider, self.other_teacher):
            self.as_user(user)
            self.assertEqual(self.client.put(url, {"name": "Hacked"}, format="json").status_code, 403, user.email)
            self.assertEqual(self.client.delete(url).status_code, 403, user.email)
        self.classroom.refresh_from_db()
        self.assertEqual(self.classroom.name, "Maths")

        self.as_user(self.owner)
        self.assertEqual(self.client.put(url, {"name": "Maths II"}, format="json").status_code, 200)
        self.as_user(self.admin)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_students_cannot_create_courses_and_teachers_own_what_they_create(self):
        payload = {
            "code": "N1", "name": "New", "department_id": self.department.pk,
            "program_id": self.program.pk, "batch_id": self.batch.pk, "teacher": self.owner.pk,
        }
        self.as_user(self.student)
        self.assertEqual(self.client.post("/courses/", payload, format="json").status_code, 403)

        self.as_user(self.other_teacher)
        response = self.client.post("/courses/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Classroom.objects.get(subject_code="N1").teacher_id, self.other_teacher.pk)

    def test_course_detail_is_limited_to_members(self):
        url = f"/courses/{self.classroom.pk}"
        self.as_user(self.student)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 403)

    def test_student_record_cannot_be_edited_or_deleted_by_others(self):
        url = f"/students/detail/{self.student.pk}"
        for user in (self.student, self.outsider, self.other_teacher):
            self.as_user(user)
            res = self.client.put(url, {"email": "attacker@example.com"}, format="json")
            self.assertEqual(res.status_code, 403, user.email)
            self.assertEqual(self.client.delete(f"/students/{self.student.pk}").status_code, 403, user.email)
        self.student.refresh_from_db()
        self.assertEqual(self.student.email, "stu@example.com")
        self.assertTrue(Enrollment.objects.filter(student=self.student, is_active=True).exists())

    def test_non_students_cannot_be_edited_through_the_student_endpoint(self):
        self.as_user(self.owner)
        res = self.client.put(f"/students/detail/{self.admin.pk}", {"email": "x@example.com"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.email, "admin@example.com")

    def test_owner_can_manage_own_students(self):
        self.as_user(self.owner)
        self.assertEqual(self.client.get(f"/students/{self.classroom.pk}").status_code, 200)
        res = self.client.put(f"/students/detail/{self.student.pk}", {"name": "Stu Dent"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_student_lists_are_teacher_only_and_scoped(self):
        self.as_user(self.student)
        self.assertEqual(self.client.get("/students/").status_code, 403)
        self.assertEqual(self.client.get(f"/students/{self.classroom.pk}").status_code, 403)
        self.assertEqual(self.client.get(f"/students/{self.classroom.pk}/active").status_code, 403)

        self.as_user(self.other_teacher)
        self.assertEqual(self.client.get(f"/students/{self.classroom.pk}").status_code, 403)
        self.assertEqual(self.client.get("/students/").json(), [])

    def test_viewsets_are_scoped_to_membership(self):
        self.as_user(self.outsider)
        listing = self.client.get("/api/v1/classrooms/").json()
        self.assertEqual(listing["count"], 0)
        self.assertEqual(self.client.get("/api/v1/classrooms/enrollments/").json()["count"], 0)

        self.as_user(self.student)
        self.assertEqual(self.client.get("/api/v1/classrooms/").json()["count"], 1)
        self.assertEqual(self.client.get("/api/v1/classrooms/enrollments/").json()["count"], 1)
        self.assertEqual(self.client.delete(f"/api/v1/classrooms/{self.classroom.pk}/").status_code, 403)

        self.as_user(self.other_teacher)
        self.assertEqual(self.client.delete(f"/api/v1/classrooms/{self.classroom.pk}/").status_code, 404)
