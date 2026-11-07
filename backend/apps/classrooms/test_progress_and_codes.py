from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import admit, default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment


class ProgressAndJoinCodes(TestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", department=batch.program.department)
        admit("s@x.com", "R1", "Sam", section)
        self.student = User.objects.create_user(email="s@x.com", password="x", role="STUDENT", register_no="R1")
        # The model default code is the long "EDU-XXXXXXXX" form.
        self.course = Classroom.objects.create(
            name="C", subject_code="C1", teacher=self.teacher, department=batch.program.department,
            program=batch.program, batch=batch, section=section,
        )

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_a_long_code_joins_in_any_letter_case(self):
        self.assertTrue(self.course.enrollment_code.startswith("EDU-"))
        res = self.api(self.student).post(f"/students/enroll/code?enrollment_code={self.course.enrollment_code.lower()}", {}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(Enrollment.objects.filter(classroom=self.course, student=self.student).exists())
        self.assertEqual(self.api(self.student).post("/students/enroll/code?enrollment_code=", {}, format="json").status_code, 404)

    def test_progress_means_hand_ins_for_a_student_and_marking_for_the_teacher(self):
        Enrollment.objects.create(classroom=self.course, student=self.student)
        course = lambda user: self.api(user).get("/courses/").json()[0]
        self.assertIsNone(course(self.student)["progress"])  # no assignments yet
        self.assertIsNone(course(self.teacher)["progress"])  # nothing handed in yet
        a1 = Assignment.objects.create(course=self.course, title="A1")
        Assignment.objects.create(course=self.course, title="A2")
        sub = Submission.objects.create(assignment=a1, student=self.student, student_name="Sam")
        self.assertEqual(course(self.student)["progress"], 50.0)
        self.assertEqual(course(self.teacher)["progress"], 0)
        sub.grade = 9
        sub.save()
        self.assertEqual(course(self.teacher)["progress"], 100)
