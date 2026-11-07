from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing import default_section
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, AssignmentCriterion, Submission, SubmissionEvaluation
from apps.classrooms.models import Classroom, Enrollment
from apps.forms_app.models import Form, FormResponse


class StudentSideOfTeacherActions(TestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", first_name="Tina", last_name="T")
        self.me = User.objects.create_user(email="me@x.com", password="x", role="STUDENT", first_name="Me", last_name="S")
        self.mate = User.objects.create_user(email="mate@x.com", password="x", role="STUDENT", first_name="Mate", last_name="S")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=batch.program.department,
                                               program=batch.program, batch=batch, section=section)
        for s in (self.me, self.mate):
            Enrollment.objects.create(classroom=self.course, student=s)
        now = timezone.now()
        self.late_one = Assignment.objects.create(course=self.course, title="Overdue", max_points=100, due_date=(now - timedelta(days=2)).isoformat())
        for i, mark in enumerate((80, 55, 30)):
            a = Assignment.objects.create(course=self.course, title=f"A{i}", max_points=100, due_date=(now - timedelta(days=30 - i * 7)).isoformat())
            sub = Submission.objects.create(assignment=a, student=self.me, student_name="Me", grade=mark)
            Submission.objects.filter(pk=sub.pk).update(created_at=now - timedelta(days=31 - i * 7))

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_my_progress_speaks_to_the_student_and_hides_the_score(self):
        data = self.api(self.me).get("/analytics/my-progress").json()
        overall = data["overall"]
        self.assertIn(overall["status"], ("act_now", "needs_attention"))
        self.assertNotIn("score", overall)
        self.assertEqual([m["title"] for m in overall["missing"]], ["Overdue"])
        tips = " ".join(t["text"] for t in overall["tips"])
        self.assertIn("past the due date", tips)
        self.assertIn("Your recent marks average", tips)
        self.assertEqual(len(overall["timeline"]), 3)
        self.assertEqual(data["courses"][0]["code"], "M1")

    def test_a_new_student_is_getting_started_not_on_track(self):
        Assignment.objects.filter(pk=self.late_one.pk).delete()
        data = self.api(self.mate).get("/analytics/my-progress").json()
        # Mate has no marks; the three past assignments are missing for them.
        self.assertEqual(data["overall"]["status"], "needs_attention")
        fresh = User.objects.create_user(email="new@x.com", password="x", role="STUDENT")
        self.assertIsNone(self.api(fresh).get("/analytics/my-progress").json()["overall"])

    def test_only_students_and_only_their_own(self):
        self.assertEqual(self.api(self.teacher).get("/analytics/my-progress").status_code, 403)
        mate = self.api(self.mate).get("/analytics/my-progress").json()["overall"]
        self.assertEqual(mate["results_count"], 0)  # my marks never show up for a classmate

    def test_dashboard_lists_forms_meetings_and_new_feedback(self):
        form = Form.objects.create(classroom=self.course, owner=self.teacher, title="Survey", status="PUBLISHED")
        Form.objects.create(classroom=self.course, owner=self.teacher, title="Draft", status="DRAFT")
        answered = Form.objects.create(classroom=self.course, owner=self.teacher, title="Done", status="PUBLISHED")
        FormResponse.objects.create(form=answered, student=self.me)
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        Appointment.objects.create(student_email="me@x.com", student_name="Me S", teacher_name="Tina T", status="approved",
                                   time_slot=f"{tomorrow} 10:00", agenda="Progress", booked_by_teacher=True)
        Appointment.objects.create(student_email="me@x.com", teacher_name="Tina T", status="approved", time_slot="2020-01-01 10:00")
        Appointment.objects.create(student_email="me@x.com", teacher_name="Tina T", status="pending", time_slot=f"{tomorrow} 11:00")
        sub = Submission.objects.filter(student=self.me).first()
        crit = AssignmentCriterion.objects.create(assignment=sub.assignment, label="All", max_score=100)
        SubmissionEvaluation.objects.create(submission=sub, evaluator=self.teacher, feedback="Well done", total=80)

        data = self.api(self.me).get("/dashboard/student-summary").json()
        self.assertEqual([f["title"] for f in data["formsToFill"]], ["Survey"])
        self.assertEqual(len(data["meetings"]), 1)
        self.assertTrue(data["meetings"][0]["bookedByTeacher"])
        self.assertEqual(data["newFeedback"][0]["feedback"], "Well done")
        # a classmate sees none of it except the class form
        other = self.api(self.mate).get("/dashboard/student-summary").json()
        self.assertEqual((len(other["meetings"]), len(other["newFeedback"]), len(other["formsToFill"])), (0, 0, 2))
        self.assertTrue(crit)

    def test_a_meeting_booked_by_the_teacher_says_so(self):
        self.api(self.teacher).post("/appointments/invite", {"student_id": self.me.pk, "time_slot": "2030-01-01 10:00"}, format="json")
        mine = self.api(self.me).get("/appointments/").json()
        self.assertTrue(mine[0]["booked_by_teacher"])
