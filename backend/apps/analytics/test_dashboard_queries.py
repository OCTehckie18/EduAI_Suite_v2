"""How many database queries the dashboard endpoints make, with a realistic amount of data.

A dashboard must cost about the same whether a class has 5 students or 60, so each test builds a
bigger data set and checks the query count against a small ceiling, not against the data size.
"""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamAttempt
from apps.mail.models import MailHistory

User = get_user_model()
STUDENTS, ASSIGNMENTS, COURSES = 30, 20, 3


class QueryBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        cls.teacher = User.objects.create_user(email="t@x.com", role="TEACHER", first_name="Ann", last_name="Lee", department=department)
        cls.admin = User.objects.create_user(email="m@x.com", role="MASTER_ADMIN", first_name="Master", last_name="Admin")
        cls.courses = [
            Classroom.objects.create(name=f"Course {i}", subject_code=f"C{i}", teacher=cls.teacher, department=department, program=program, batch=batch)
            for i in range(COURSES)
        ]
        cls.students = [
            User.objects.create_user(email=f"s{i}@x.com", role="STUDENT", first_name=f"S{i}", last_name="X", register_no=f"R{i}")
            for i in range(STUDENTS)
        ]
        for course in cls.courses:
            for student in cls.students:
                Enrollment.objects.create(classroom=course, student=student)
            for n in range(ASSIGNMENTS):
                assignment = Assignment.objects.create(course=course, title=f"A{n}", max_points=100, due_date="2099-01-01T10:00")
                for student in cls.students[: STUDENTS // 2]:
                    Submission.objects.create(assignment=assignment, student=student, student_name=student.full_name, grade=(40 + n) if n % 2 else None)
            exam = Exam.objects.create(course=course, title=f"E{course.pk}", status="published")
            for student in cls.students[:10]:
                ExamAttempt.objects.create(exam=exam, student_id=student.pk, status="submitted", score=70.0)
        for i in range(6):
            Appointment.objects.create(student_name="S0 X", teacher_name="Ann Lee", agenda=f"Talk {i}", status="pending", time_slot="2099-01-01 10:00")
            MailHistory.objects.create(owner=cls.teacher, subject=f"M{i}", recipients=["a@x.com"], recipient_count=1)

    def queries(self, user, url):
        self.client.force_authenticate(user)
        self.client.get(url)  # warm caches (content types, session) so only steady-state queries are counted
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content)
        return len(captured), response.json()


def grow(test, courses=3, students=15, assignments=10):
    """Add a lot more data: more classes, more students per class, more work. Returns the course used."""
    base = test.courses[0]
    for i in range(courses):
        course = Classroom.objects.create(name=f"More {i}", subject_code=f"MX{i}", teacher=test.teacher, department=base.department, program=base.program, batch=base.batch)
        for student in test.students[:10]:
            Enrollment.objects.create(classroom=course, student=student)
        Assignment.objects.create(course=course, title="Extra", due_date="2099-01-01T10:00")
    newcomers = [User.objects.create_user(email=f"extra{i}@x.com", role="STUDENT", first_name=f"E{i}", last_name="X", register_no=f"RX{i}") for i in range(students)]
    for student in newcomers:
        Enrollment.objects.create(classroom=base, student=student)
    for n in range(assignments):
        assignment = Assignment.objects.create(course=base, title=f"More{n}", max_points=100, due_date="2099-01-01T10:00")
        for student in newcomers[:8]:
            Submission.objects.create(assignment=assignment, student=student, student_name=student.full_name, grade=50)
    return base


class TeacherSummaryQueries(QueryBase):
    def test_the_teacher_dashboard_does_not_grow_with_the_amount_of_data(self):
        url = reverse("dashboard-summary")
        before, body = self.queries(self.teacher, url)
        self.assertEqual(len(body["classrooms"]), COURSES)
        grow(self)
        after, body = self.queries(self.teacher, url)
        print(f"teacher summary: {before} -> {after} queries")
        self.assertLessEqual(before, 36)
        self.assertLessEqual(after - before, 2)
        self.assertEqual(len(body["classrooms"]), COURSES + 3)


class EngagementQueries(QueryBase):
    def test_the_class_engagement_summary_does_not_grow_with_students_times_assignments(self):
        url = f"/api/v1/engagement/{self.courses[0].pk}/summary"
        before, body = self.queries(self.teacher, url)
        self.assertEqual(body["total_students"], STUDENTS)
        grow(self)
        after, body = self.queries(self.teacher, url)
        print(f"engagement summary: {before} -> {after} queries")
        self.assertLessEqual(before, 12)
        self.assertEqual(after, before)  # 15 more students and 10 more assignments cost no extra queries
        self.assertEqual(body["total_students"], STUDENTS + 15)

    def test_a_single_student_profile_is_also_cheap(self):
        count, _ = self.queries(self.teacher, f"/api/v1/engagement/student/{self.students[0].pk}")
        print(f"student profile: {count} queries")
        self.assertLessEqual(count, 25)


class StudentSummaryQueries(QueryBase):
    def test_the_student_dashboard_does_not_grow_with_the_number_of_courses_or_assignments(self):
        url = reverse("dashboard-student-summary")
        before, body = self.queries(self.students[0], url)
        self.assertEqual(len(body["courses"]), COURSES)
        base = self.courses[0]
        for i in range(4):
            course = Classroom.objects.create(name=f"Another {i}", subject_code=f"AN{i}", teacher=self.teacher, department=base.department, program=base.program, batch=base.batch)
            Enrollment.objects.create(classroom=course, student=self.students[0])
            for n in range(5):
                Assignment.objects.create(course=course, title=f"W{n}", due_date="2099-01-01T10:00")
        after, body = self.queries(self.students[0], url)
        print(f"student summary: {before} -> {after} queries")
        self.assertLessEqual(before, 28)
        self.assertEqual(after, before)
        self.assertEqual(len(body["courses"]), COURSES + 4)


class OverviewTests(QueryBase):
    def test_the_overview_carries_roster_progress_and_recent_actions_with_names(self):
        from apps.accounts.models import AdmittedStudent
        from apps.core.models import ActionHistory

        section = default_section()
        done = User.objects.create_user(email="done@x.com", role="STUDENT", register_no="A1")
        User.objects.filter(pk=done.pk).update(is_profile_complete=True)
        AdmittedStudent.objects.create(section=section, register_no="A1", email="done@x.com", name="Done", user=done)
        AdmittedStudent.objects.create(section=section, register_no="A2", email="wait@x.com", name="Waiting")
        ActionHistory.objects.create(feature="master_admin", action="approve_teacher", user_id=str(self.admin.pk), metadata_json={"target": "accounts.user:5"})
        ActionHistory.objects.create(feature="master_admin", action="create_campus", user_id="999999")
        ActionHistory.objects.create(feature="teacher_stuff", action="ignored", user_id=str(self.teacher.pk))
        count, body = self.queries(self.admin, "/api/v1/master-admin/overview/")
        print(f"master overview: {count} queries")
        self.assertEqual(body["roster"], {"total": 2, "signed_up": 1})
        actions = {a["action"]: a for a in body["recent_actions"]}
        self.assertEqual(set(actions), {"approve_teacher", "create_campus"})
        self.assertEqual(actions["approve_teacher"]["actor"], "Master Admin")
        self.assertEqual(actions["approve_teacher"]["target"], "accounts.user:5")
        self.assertEqual(actions["create_campus"]["actor"], "An admin")  # an unknown actor never breaks the page
        self.assertIn("rejected_teacher_applications", body["users"])
        self.assertLessEqual(count, 40)  # counts, roster, warnings and history: a fixed cost, not tied to data size
