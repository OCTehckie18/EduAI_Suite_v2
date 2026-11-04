from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.assignments.stats import average_by_student, average_for, course_average
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamAttempt

User = get_user_model()


class RealMetricsBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, **kw):
            return User.objects.create_user(email=email, role=role, first_name=email.split("@")[0], last_name="X", **kw)

        self.teacher = make("t@x.com", "TEACHER", department=department)
        self.rival = make("r@x.com", "TEACHER", department=department)
        self.low = make("low@x.com", "STUDENT")
        self.high = make("high@x.com", "STUDENT")
        self.blank = make("blank@x.com", "STUDENT")
        self.outsider = make("out@x.com", "STUDENT")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        self.other = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.low, self.high, self.blank):
            Enrollment.objects.create(classroom=self.course, student=student)
        Enrollment.objects.create(classroom=self.other, student=self.outsider)
        self.hw50 = Assignment.objects.create(course=self.course, title="A", max_points=50)
        self.hw100 = Assignment.objects.create(course=self.course, title="B", max_points=100)
        Submission.objects.create(assignment=self.hw50, student=self.low, grade=10)
        Submission.objects.create(assignment=self.hw100, student=self.low, grade=30)    # 40 of 150
        Submission.objects.create(assignment=self.hw50, student=self.high, grade=45)
        Submission.objects.create(assignment=self.hw100, student=self.high, grade=90)   # 135 of 150
        Submission.objects.create(assignment=self.hw50, student=self.blank, grade=None)  # handed in, not graded


class StatsTests(RealMetricsBase):
    def test_average_is_marks_earned_over_marks_possible(self):
        self.assertEqual(average_for(self.low.pk), 26.7)  # 40 of 150, not a mean of raw marks
        self.assertEqual(average_by_student([self.low.pk, self.high.pk])[self.high.pk], 90.0)

    def test_nothing_graded_means_none_not_an_invented_number(self):
        self.assertIsNone(average_for(self.blank.pk))
        self.assertIsNone(average_for(self.outsider.pk))
        self.assertIsNone(course_average([self.other.pk]))


class DashboardTests(RealMetricsBase):
    def get(self, user):
        self.client.force_authenticate(user)
        return self.client.get(reverse("dashboard-summary"))

    def test_dashboard_counts_only_the_teachers_own_students_and_marks(self):
        body = self.get(self.teacher).json()
        self.assertEqual(body["engagementSnapshot"]["studentCount"], 3)
        self.assertEqual(body["engagementSnapshot"]["studentCount"], 3)
        self.assertIsNone(body["engagementSnapshot"]["avgAttendance"])
        self.assertEqual(body["engagementSnapshot"]["avgScore"], 58.3)  # 175 of 300
        self.assertEqual([c["id"] for c in body["classrooms"]], [self.course.pk])

    def test_a_teacher_with_no_classes_sees_zeroes_not_everyones_students(self):
        newcomer = User.objects.create_user(email="n@x.com", role="TEACHER")
        body = self.get(newcomer).json()
        self.assertEqual((body["engagementSnapshot"]["studentCount"], body["classrooms"]), (0, []))
        self.assertIsNone(body["engagementSnapshot"]["avgScore"])
        self.assertEqual(body["riskAlerts"], [])

    def test_risk_alerts_come_from_graded_work_only(self):
        alerts = self.get(self.teacher).json()["riskAlerts"]
        self.assertEqual([a["name"] for a in alerts], ["low X"])
        self.assertEqual(alerts[0]["level"], "high")
        self.assertNotIn("ttendance", alerts[0]["reason"])

    def test_students_cannot_open_the_teacher_dashboard(self):
        self.assertEqual(self.get(self.low).status_code, 403)

    def test_a_class_with_no_assignments_has_no_progress(self):
        Assignment.objects.filter(course=self.course).delete()
        self.assertIsNone(self.get(self.teacher).json()["classrooms"][0]["progress"])


class RiskAndCourseTests(RealMetricsBase):
    def test_global_risk_lists_real_students_with_real_scores(self):
        self.client.force_authenticate(self.teacher)
        data = self.client.get(reverse("analytics-risk-global")).json()
        self.assertEqual([s["name"] for s in data["risk_students"]], ["low X"])
        self.assertEqual(data["risk_students"][0]["avgScore"], 26.7)
        self.assertIsNone(data["risk_students"][0]["attendance"])
        self.assertIsNone(data["overview"]["attendance_rate"])

    def test_course_analytics_is_real_and_owner_only(self):
        url = reverse("analytics-course", args=[self.course.pk])
        self.client.force_authenticate(self.teacher)
        body = self.client.get(url).json()
        self.assertEqual((body["student_count"], body["avg_score"], body["avg_attendance"]), (3, 58.3, None))
        for user in (self.rival, self.low):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 403)


class MailFilterTests(RealMetricsBase):
    def filter(self, conditions):
        self.client.force_authenticate(self.teacher)
        return self.client.post(reverse("mail-filter"), {"conditions": conditions}, format="json")

    def test_filters_use_real_averages_and_only_the_teachers_students(self):
        rows = self.filter([{"field": "avg_score", "operator": "<", "value": 50}]).json()
        self.assertEqual([r["email"] for r in rows], ["low@x.com"])
        self.assertEqual(rows[0]["avg_score"], 26.7)
        self.assertIsNone(rows[0]["attendance"])

    def test_students_without_marks_never_match_and_attendance_never_matches(self):
        self.assertEqual(len(self.filter([{"field": "avg_score", "operator": ">=", "value": 0}]).json()), 2)
        self.assertEqual(self.filter([{"field": "attendance", "operator": "<", "value": 100}]).json(), [])

    def test_bad_condition_value_is_a_400(self):
        self.assertEqual(self.filter([{"field": "avg_score", "operator": "<", "value": "abc"}]).status_code, 400)


class ExamStatsTests(RealMetricsBase):
    def test_completion_rate_is_submitted_over_started_and_none_before_any_attempt(self):
        exam = Exam.objects.create(course=self.course, title="E")
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-stats")
        self.assertIsNone(self.client.get(url).json()["avg_completion_rate"])
        ExamAttempt.objects.create(exam=exam, student_id=self.low.pk, status="submitted")
        ExamAttempt.objects.create(exam=exam, student_id=self.high.pk, status="in_progress")
        self.assertEqual(self.client.get(url).json()["avg_completion_rate"], 50.0)
