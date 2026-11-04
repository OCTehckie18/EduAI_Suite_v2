from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import AdmittedStudent
from apps.accounts.testing import default_section
from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Department, Program

User = get_user_model()
URL = "/api/v1/master-admin/overview/"


class OverviewWidgetTests(APITestCase):
    def setUp(self):
        self.section = default_section()
        self.batch = self.section.batch
        self.program = self.batch.program
        self.department = self.program.department
        self.campus = self.department.school.campus
        self.admin = User.objects.create_user(email="m@x.com", role="MASTER_ADMIN", first_name="Master", last_name="Admin")
        self.client.force_authenticate(self.admin)

    def overview(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def teacher(self, email, state="APPROVED", **kw):
        return User.objects.create_user(email=email, role="TEACHER", first_name=email.split("@")[0], last_name="T", approval_status=state, department=self.department, **kw)

    def test_a_clean_setup_has_no_warnings(self):
        teacher = self.teacher("t@x.com")
        course = Classroom.objects.create(name="C", subject_code="C1", teacher=teacher, department=self.department, program=self.program, batch=self.batch)
        student = User.objects.create_user(email="s@x.com", role="STUDENT")
        Enrollment.objects.create(classroom=course, student=student)
        self.assertEqual(self.overview()["warnings"], [])

    def test_every_kind_of_incomplete_setup_is_reported_with_where_to_fix_it(self):
        teacher = self.teacher("idle@x.com")  # approved but has no classroom
        Batch.objects.create(name="No sections", program=self.program, start_year=2026, end_year=2029, academic_year="2026-27")
        Department.objects.create(name="Empty dept", code="ED", school=self.department.school)
        Classroom.objects.create(name="Empty class", subject_code="E1", teacher=self.teacher_for_class(), department=self.department, program=self.program, batch=self.batch)
        placed = User.objects.create_user(email="loose@x.com", role="STUDENT", is_profile_complete=True)
        AdmittedStudent.objects.create(section=self.section, register_no="U1", email="half@x.com", name="Half",
                                       user=User.objects.create_user(email="half@x.com", role="STUDENT", is_profile_complete=False))
        found = {w["key"]: w for w in self.overview()["warnings"]}
        self.assertEqual(found["batches_without_sections"]["count"], 1)
        self.assertEqual(found["departments_without_programs"]["count"], 1)
        self.assertEqual(found["empty_classrooms"]["count"], 1)
        self.assertEqual(found["idle_teachers"]["count"], 1)  # the class owner has a class; only idle@x.com does not
        self.assertEqual(found["unplaced_students"]["count"], 1)
        self.assertEqual(found["unfinished_signups"]["count"], 1)
        self.assertEqual(found["batches_without_sections"]["tab"], "structure")
        self.assertEqual(found["unfinished_signups"]["tab"], "roster")
        self.assertTrue(teacher and placed)

    def teacher_for_class(self):
        return self.teacher("owner@x.com")

    def test_teachers_by_approval_state_and_how_long_the_oldest_has_waited(self):
        self.teacher("a@x.com")
        waiting = self.teacher("p@x.com", "PENDING")
        self.teacher("r@x.com", "REJECTED")
        User.objects.filter(pk=waiting.pk).update(created_at=timezone.now() - timedelta(days=5))
        teachers = self.overview()["teachers"]
        self.assertEqual((teachers["approved"], teachers["pending"], teachers["rejected"]), (1, 1, 1))
        self.assertIsNotNone(teachers["oldest_pending_at"])

    def test_roster_progress_per_class_and_campus_sizes(self):
        done = User.objects.create_user(email="d@x.com", role="STUDENT", is_profile_complete=True)
        AdmittedStudent.objects.create(section=self.section, register_no="A1", email="d@x.com", name="D", user=done)
        AdmittedStudent.objects.create(section=self.section, register_no="A2", email="w@x.com", name="W")
        teacher = self.teacher("t@x.com")
        Classroom.objects.create(name="C", subject_code="C1", teacher=teacher, department=self.department, program=self.program, batch=self.batch)
        body = self.overview()
        row = body["roster_by_class"][0]
        self.assertEqual((row["class_name"], row["total"], row["signed_up"]), (self.batch.name, 2, 1))
        self.assertEqual(body["campus_stats"][str(self.campus.pk)], {"classrooms": 1, "teachers": 1})

    def test_this_weeks_activity_counts_only_this_week(self):
        old = User.objects.create_user(email="old@x.com", role="STUDENT")
        User.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=30))
        User.objects.create_user(email="new@x.com", role="STUDENT")
        week = self.overview()["last_7_days"]
        self.assertEqual(week["students_joined"], 1)
        self.assertEqual(week["classrooms_created"], 0)

    def test_only_master_admins_see_it(self):
        self.client.force_authenticate(self.teacher("t@x.com"))
        self.assertEqual(self.client.get(URL).status_code, 403)
