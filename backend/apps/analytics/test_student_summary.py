from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.games.models import ChainAnswerGame, GamePlayer

User = get_user_model()
URL = "/api/v1/api/dashboard/student-summary"


class StudentSummaryTests(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        self.teacher = User.objects.create_user(email="t@x.com", first_name="Tess", last_name="Teach", role="TEACHER", department=department)
        self.alice = User.objects.create_user(email="alice@x.com", first_name="Alice", last_name="Able", role="STUDENT", register_no="R1")
        self.zed = User.objects.create_user(email="zed@x.com", first_name="Zed", last_name="Zero", role="STUDENT", register_no="R2")
        mk = lambda name, code: Classroom.objects.create(name=name, subject_code=code, teacher=self.teacher, department=department, program=program, batch=batch)
        self.maths, self.iot, self.law = mk("Maths", "M1"), mk("IoT", "I1"), mk("Law", "L1")
        Enrollment.objects.create(classroom=self.maths, student=self.alice)
        Enrollment.objects.create(classroom=self.iot, student=self.alice)
        self.hw1 = Assignment.objects.create(course=self.maths, title="HW1", due_date="2026-12-01T10:00")
        self.hw2 = Assignment.objects.create(course=self.maths, title="HW2", due_date="2026-11-20T10:00")
        self.hw3 = Assignment.objects.create(course=self.law, title="Law HW", due_date="2026-11-10T10:00")

    def get(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get(URL, params)

    def test_only_the_students_enrolled_courses_are_shown_whatever_name_is_sent(self):
        body = self.get(self.alice, student_name="Zed").json()
        self.assertEqual({c["code"] for c in body["courses"]}, {"M1", "I1"})
        self.assertEqual(body["student"]["name"], "Alice Able")

    def test_a_student_with_no_enrolments_sees_nothing_not_other_peoples_classes(self):
        body = self.get(self.zed, student_name="Alice").json()
        self.assertEqual(body["courses"], [])
        self.assertEqual(body["deadlines"], [])
        self.assertEqual(body["student"]["pendingAssignments"], 0)

    def test_deadlines_skip_submitted_work_and_are_soonest_first(self):
        Submission.objects.create(assignment=self.hw1, student=self.alice, student_name="Alice Able")
        body = self.get(self.alice).json()
        self.assertEqual([d["title"] for d in body["deadlines"]], ["HW2"])
        self.assertEqual(body["student"]["pendingAssignments"], 1)
        Submission.objects.all().delete()
        self.assertEqual([d["title"] for d in self.get(self.alice).json()["deadlines"]], ["HW2", "HW1"])

    def test_progress_is_real_and_empty_when_a_course_has_no_assignments(self):
        Submission.objects.create(assignment=self.hw1, student=self.alice, student_name="Alice Able")
        courses = {c["code"]: c for c in self.get(self.alice).json()["courses"]}
        self.assertEqual(courses["M1"]["progress"], 50.0)
        self.assertIsNone(courses["I1"]["progress"])

    def test_join_codes_and_invented_stats_are_not_returned(self):
        body = self.get(self.alice).json()
        self.assertTrue(all("enrollment_code" not in c for c in body["courses"]))
        self.assertIsNone(body["student"]["gpa"])
        self.assertIsNone(body["student"]["level"])

    def test_live_games_only_count_when_the_student_is_in_them(self):
        game = ChainAnswerGame.objects.create(session_id="g1", name="Word chain", status="active", teacher_id=self.teacher.pk)
        self.assertFalse(self.get(self.alice).json()["liveGame"]["active"])
        GamePlayer.objects.create(game=game, student_id="R1", name="Alice")
        body = self.get(self.alice).json()
        self.assertEqual((body["liveGame"]["active"], body["liveGame"]["teacher"], body["student"]["liveGames"]), (True, "Tess Teach", 1))
        self.assertFalse(self.get(self.zed).json()["liveGame"]["active"])

    def test_only_students_may_use_the_student_dashboard(self):
        self.assertEqual(self.get(self.teacher).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))
