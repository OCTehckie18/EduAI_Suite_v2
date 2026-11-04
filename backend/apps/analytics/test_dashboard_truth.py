from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment

User = get_user_model()


class TruthBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        self.teacher = User.objects.create_user(email="t@x.com", first_name="Tess", last_name="Teach", role="TEACHER", department=department)
        self.alice = User.objects.create_user(email="alice@x.com", first_name="Alice", last_name="Able", role="STUDENT", register_no="R1")
        self.bob = User.objects.create_user(email="bob@x.com", first_name="Bob", last_name="B", role="STUDENT", register_no="R2")
        self.maths = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        self.art = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.teacher, department=department, program=program, batch=batch)
        for course in (self.maths, self.art):
            Enrollment.objects.create(classroom=course, student=self.alice)
        Enrollment.objects.create(classroom=self.maths, student=self.bob)

    def student_summary(self):
        self.client.force_authenticate(self.alice)
        return self.client.get(reverse("dashboard-student-summary")).json()

    def teacher_summary(self):
        self.client.force_authenticate(self.teacher)
        return self.client.get(reverse("dashboard-summary")).json()


def iso(delta, fmt="%Y-%m-%dT%H:%M"):
    return (timezone.localtime() + delta).strftime(fmt)


class DeadlineTests(TruthBase):
    def test_overdue_work_is_separate_from_upcoming_and_is_not_urgent(self):
        Assignment.objects.create(course=self.maths, title="Late", due_date=iso(timedelta(days=-3)))
        Assignment.objects.create(course=self.maths, title="Soon", due_date=iso(timedelta(hours=20)))
        Assignment.objects.create(course=self.maths, title="Later", due_date=iso(timedelta(days=9)))
        body = self.student_summary()
        self.assertEqual([d["title"] for d in body["overdue"]], ["Late"])
        self.assertEqual([d["title"] for d in body["deadlines"]], ["Soon", "Later"])
        self.assertTrue(body["overdue"][0]["is_overdue"] and not body["overdue"][0]["is_urgent"])
        self.assertTrue(body["deadlines"][0]["is_urgent"])
        self.assertFalse(body["deadlines"][1]["is_urgent"])
        self.assertEqual((body["student"]["pendingAssignments"], body["student"]["overdueAssignments"]), (3, 1))

    def test_dates_come_out_as_local_iso_times_the_screen_can_format(self):
        Assignment.objects.create(course=self.maths, title="Timed", due_date=iso(timedelta(days=2)))
        due = self.student_summary()["deadlines"][0]["due_at"]
        self.assertRegex(due, r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$")

    def test_a_date_with_no_time_stays_due_until_the_end_of_that_day(self):
        today = timezone.localtime().strftime("%Y-%m-%d")
        Assignment.objects.create(course=self.maths, title="Due today", due_date=today)
        Assignment.objects.create(course=self.maths, title="Due yesterday", due_date=iso(timedelta(days=-1), "%Y-%m-%d"))
        body = self.student_summary()
        self.assertEqual([d["title"] for d in body["deadlines"]], ["Due today"])
        self.assertTrue(body["deadlines"][0]["due_is_date_only"])
        self.assertEqual([d["title"] for d in body["overdue"]], ["Due yesterday"])

    def test_an_ambiguous_slash_date_is_not_guessed(self):
        Assignment.objects.create(course=self.maths, title="Odd", due_date="03/04/2099")
        item = self.student_summary()["deadlines"][0]
        self.assertIsNone(item["due_at"])  # shown as having no readable date, not as 4 March

    def test_handed_in_work_is_not_pending(self):
        done = Assignment.objects.create(course=self.maths, title="Done", due_date=iso(timedelta(days=-2)))
        Submission.objects.create(assignment=done, student=self.alice, student_name="Alice Able")
        body = self.student_summary()
        self.assertEqual((body["overdue"], body["student"]["pendingAssignments"]), ([], 0))


class GradeTests(TruthBase):
    def test_the_students_average_is_real_and_per_course(self):
        hw = Assignment.objects.create(course=self.maths, title="HW", max_points=50)
        Submission.objects.create(assignment=hw, student=self.alice, grade=40)
        body = self.student_summary()
        courses = {c["code"]: c for c in body["courses"]}
        self.assertEqual((courses["M1"]["average"], courses["A1"]["average"], body["student"]["average"]), (80.0, None, 80.0))
        self.assertNotIn("gpa", body["student"])


class TeacherClassCardTests(TruthBase):
    def test_every_class_is_listed_with_real_counts_and_no_invented_time(self):
        hw = Assignment.objects.create(course=self.maths, title="HW")
        Submission.objects.create(assignment=hw, student=self.alice, grade=10)
        Submission.objects.create(assignment=hw, student=self.bob, grade=None)
        cards = {c["code"]: c for c in self.teacher_summary()["classrooms"]}
        self.assertEqual(set(cards), {"M1", "A1"})
        self.assertEqual((cards["M1"]["students"], cards["M1"]["submitted"], cards["M1"]["graded"], cards["M1"]["progress"]), (2, 2, 1, 50))
        self.assertIsNone(cards["A1"]["progress"])
        self.assertTrue(all(c["time"] is None for c in cards.values()))

    def test_more_than_four_classes_are_all_shown(self):
        for index in range(5):
            Classroom.objects.create(name=f"Extra {index}", subject_code=f"X{index}", teacher=self.teacher,
                                     department=self.maths.department, program=self.maths.program, batch=self.maths.batch)
        self.assertEqual(len(self.teacher_summary()["classrooms"]), 7)

    def test_new_students_this_week_counts_people_not_enrolments(self):
        # Alice is in two classes but is one new student; Bob is the second.
        self.assertEqual(self.teacher_summary()["stats"][0]["delta"], "+2")

    def test_the_legacy_fields_nobody_reads_are_gone(self):
        body = self.teacher_summary()
        for key in ("total_courses", "total_submissions", "recent_activities", "upcoming_deadlines", "avg_attendance"):
            self.assertNotIn(key, body)
