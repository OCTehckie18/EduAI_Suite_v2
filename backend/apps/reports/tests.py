import io
from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from docx import Document
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam, ExamAttempt
from .builders import extract_event_fields
from .models import Report

User = get_user_model()


class ReportBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, **kw):
            return User.objects.create_user(email=email, role=role, first_name=email.split("@")[0], last_name="X", **kw)

        self.teacher = make("t@x.com", "TEACHER", department=department)
        self.rival = make("r@x.com", "TEACHER", department=department)
        self.admin = make("m@x.com", "MASTER_ADMIN")
        self.low = make("low@x.com", "STUDENT", register_no="R1")
        self.high = make("high@x.com", "STUDENT", register_no="R2")
        self.outsider = make("out@x.com", "STUDENT")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        self.other = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.low, self.high):
            Enrollment.objects.create(classroom=self.course, student=student)
        Enrollment.objects.create(classroom=self.other, student=self.outsider)
        hw = Assignment.objects.create(course=self.course, title="HW1", max_points=100)
        Submission.objects.create(assignment=hw, student=self.low, grade=30)
        Submission.objects.create(assignment=hw, student=self.high, grade=90)
        exam = Exam.objects.create(course=self.course, title="Midterm")
        ExamAttempt.objects.create(exam=exam, student_id=self.low.pk, status="flagged", score=0.0, flag_reason="Exited full-screen mode")
        ExamAttempt.objects.create(exam=exam, student_id=self.high.pk, status="submitted", score=80.0)

    def generate(self, user, report_type, target):
        self.client.force_authenticate(user)
        return self.client.post(reverse("report-list-create"), {"type": report_type, "target_id": target}, format="json")


class GenerateTests(ReportBase):
    def test_a_class_report_contains_the_real_numbers(self):
        response = self.generate(self.teacher, "Class Report", self.course.pk)
        self.assertEqual(response.status_code, 201, response.content)
        content = response.json()["content"]
        self.assertIn("Students enrolled: 2", content)
        self.assertIn("Class average (graded work): 60.0%", content)
        self.assertIn("HW1: 2 of 2 submitted, 2 graded, average 60.0%", content)
        self.assertIn("Midterm: 1 completed, average 80.0%, 1 flagged", content)
        self.assertIn("low X: 30.0%", content)  # needs support
        self.assertIn("Attendance: Not recorded", content)
        self.assertNotIn("88", content)

    def test_a_student_report_covers_only_the_requesting_teachers_courses(self):
        response = self.generate(self.teacher, "Student Report", self.low.pk)
        self.assertEqual(response.status_code, 201, response.content)
        content = response.json()["content"]
        self.assertIn("Register number:** R1", content)
        self.assertIn("1 of 1 assignments submitted, average 30.0%", content)
        self.assertIn("Flagged for leaving the exam (Exited full-screen mode)", content)
        self.assertIn("Maths (30.0%)", content)  # under areas to improve

    def test_targets_outside_the_teachers_classes_are_refused(self):
        self.assertEqual(self.generate(self.teacher, "Student Report", self.outsider.pk).status_code, 404)
        self.assertEqual(self.generate(self.teacher, "Class Report", self.other.pk).status_code, 404)
        self.assertEqual(self.generate(self.teacher, "Class Report", 999999).status_code, 404)
        self.assertEqual(Report.objects.count(), 0)

    def test_bad_input_is_a_400(self):
        self.assertEqual(self.generate(self.teacher, "Secret Report", self.course.pk).status_code, 400)
        self.assertEqual(self.generate(self.teacher, "Class Report", "abc").status_code, 400)
        self.assertEqual(self.generate(self.teacher, "Class Report", None).status_code, 400)

    def test_report_ids_are_unique_and_students_are_refused(self):
        first = self.generate(self.teacher, "Class Report", self.course.pk).json()["id"]
        second = self.generate(self.teacher, "Class Report", self.course.pk).json()["id"]
        self.assertNotEqual(first, second)
        self.assertEqual(self.generate(self.low, "Class Report", self.course.pk).status_code, 403)


class OwnershipTests(ReportBase):
    def setUp(self):
        super().setUp()
        self.report_id = self.generate(self.teacher, "Class Report", self.course.pk).json()["id"]

    def test_only_the_owner_and_a_master_admin_can_see_a_report(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(len(self.client.get(reverse("report-list-create")).json()), 1)
        self.client.force_authenticate(self.rival)
        self.assertEqual(self.client.get(reverse("report-list-create")).json(), [])
        for name in ("report-detail", "report-download"):
            self.assertEqual(self.client.get(reverse(name, args=[self.report_id])).status_code, 404, name)
        self.assertEqual(self.client.delete(reverse("report-detail", args=[self.report_id])).status_code, 404)
        self.assertEqual(self.client.post(reverse("report-send", args=[self.report_id]), {"email": "a@b.co"}, format="json").status_code, 404)
        self.assertTrue(Report.objects.filter(report_id=self.report_id).exists())
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(self.client.get(reverse("report-list-create")).json()), 1)

    def test_a_numeric_primary_key_no_longer_opens_a_report(self):
        pk = Report.objects.get().pk
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(reverse("report-detail", args=[str(pk)])).status_code, 404)

    def test_the_owner_can_delete(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(reverse("report-detail", args=[self.report_id])).status_code, 204)
        self.assertEqual(Report.objects.count(), 0)


class DownloadTests(ReportBase):
    def test_download_is_a_real_word_document_with_the_content(self):
        report_id = self.generate(self.teacher, "Class Report", self.course.pk).json()["id"]
        response = self.client.get(reverse("report-download", args=[report_id]))
        self.assertEqual(response.status_code, 200)
        self.assertIn("wordprocessingml", response["Content-Type"])
        self.assertTrue(response["Content-Disposition"].endswith('.docx"'))
        text = "\n".join(p.text for p in Document(io.BytesIO(response.content)).paragraphs)
        self.assertIn("Class Report: Maths", text)
        self.assertIn("Students enrolled: 2", text)


class SendTests(ReportBase):
    def setUp(self):
        super().setUp()
        self.report_id = self.generate(self.teacher, "Class Report", self.course.pk).json()["id"]
        self.url = reverse("report-send", args=[self.report_id])

    def send(self, email):
        return self.client.post(self.url, {"email": email}, format="json")

    def test_without_email_set_up_the_teacher_is_told_nothing_was_sent(self):
        with mock.patch("apps.reports.views.email_configured", return_value=False), mock.patch("apps.reports.views.send_email") as sender:
            response = self.send("parent@example.com")
        self.assertEqual(response.status_code, 503)
        sender.assert_not_called()

    def test_a_bad_address_is_refused_before_anything_is_sent(self):
        with mock.patch("apps.reports.views.email_configured", return_value=True), mock.patch("apps.reports.views.send_email") as sender:
            self.assertEqual(self.send("not-an-email").status_code, 400)
            self.assertEqual(self.send("").status_code, 400)
        sender.assert_not_called()

    def test_success_and_failure_are_reported_honestly_and_content_is_escaped(self):
        Report.objects.filter(report_id=self.report_id).update(content="<script>alert(1)</script> **bold**")
        with mock.patch("apps.reports.views.email_configured", return_value=True), mock.patch("apps.reports.views.send_email", return_value=True) as sender:
            self.assertEqual(self.send("parent@example.com").status_code, 200)
        body = sender.call_args.kwargs["body"]
        self.assertIn("&lt;script&gt;", body)
        self.assertNotIn("<script>", body)
        with mock.patch("apps.reports.views.email_configured", return_value=True), mock.patch("apps.reports.views.send_email", return_value=False):
            self.assertEqual(self.send("parent@example.com").status_code, 502)


class EventReportTests(ReportBase):
    NOTES = "Event: Guest Lecture on AI\nDate: 12 Oct 2026\nVenue: Seminar Hall\nGuests: Dr. Rao\nHighlights: Intro to ML\nand live demo\nFeedback: Very positive"

    def post(self, data, user=None):
        self.client.force_authenticate(user or self.teacher)
        return self.client.post(reverse("report-generate-event"), data, format="multipart")

    def test_fields_are_read_from_the_notes_and_the_missing_ones_are_listed(self):
        with mock.patch("apps.reports.views.GroqService.get_client", return_value=None):
            response = self.post({"meeting_notes": self.NOTES})
        body = response.json()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(body["name"], "Guest Lecture on AI")
        self.assertIn("**Venue:** Seminar Hall", body["content"])
        self.assertIn("Intro to ML and live demo", body["content"])
        self.assertIn("**Time:** (to be completed by the teacher)", body["content"])
        self.assertEqual(set(body["fields_requiring_teacher"]), {"activity_type", "time", "participants", "takeaways", "follow_up"})
        self.assertEqual(body["report_id"], body["id"])

    def test_the_parser_ignores_unknown_labels_and_empty_notes_are_refused(self):
        self.assertEqual(extract_event_fields("Random: thing\nVenue: Hall"), {"venue": "Hall"})
        self.assertEqual(self.post({"meeting_notes": "   "}).status_code, 400)

    def test_the_optional_student_must_be_one_of_the_teachers_students(self):
        with mock.patch("apps.reports.views.GroqService.get_client", return_value=None):
            self.assertEqual(self.post({"meeting_notes": self.NOTES, "target_id": self.outsider.pk}).status_code, 404)
            ok = self.post({"meeting_notes": self.NOTES, "target_id": self.low.pk})
        self.assertEqual(ok.status_code, 201)
        self.assertIn("low X (R1)", ok.json()["content"])

    def test_students_cannot_generate_event_reports(self):
        self.assertEqual(self.post({"meeting_notes": self.NOTES}, user=self.low).status_code, 403)
