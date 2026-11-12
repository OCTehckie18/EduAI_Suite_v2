from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from .models import MailDraft, MailHistory
from .views import personalise

User = get_user_model()
CONFIGURED = mock.patch("apps.mail.views.email_configured", return_value=True)


class MailBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department

        def make(email, role, **kw):
            return User.objects.create_user(email=email, role=role, first_name=email.split("@")[0], last_name="X", **kw)

        self.teacher = make("t@x.com", "TEACHER", department=department)
        self.rival = make("r@x.com", "TEACHER", department=department)
        self.alice = make("alice@x.com", "STUDENT", register_no="R1")
        self.bob = make("bob@x.com", "STUDENT", register_no="R2")
        self.zed = make("zed@x.com", "STUDENT", register_no="R9")
        course = Classroom.objects.create(name="Eng", subject_code="E1", teacher=self.teacher, department=department, program=program, batch=batch)
        other = Classroom.objects.create(name="Art", subject_code="A1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.alice, self.bob):
            Enrollment.objects.create(classroom=course, student=student)
        Enrollment.objects.create(classroom=other, student=self.zed)
        hw = Assignment.objects.create(course=course, title="HW", max_points=100)
        Submission.objects.create(assignment=hw, student=self.alice, grade=80)
        self.client.force_authenticate(self.teacher)

    def send(self, **body):
        return self.client.post(reverse("mail-send"), body, format="json")


class DraftTests(MailBase):
    def test_drafts_belong_to_their_teacher_and_can_be_edited(self):
        created = self.client.post(reverse("mail-drafts-list-create"), {"subject": "Hi", "body": "Body", "student_ids": [self.alice.pk]}, format="json")
        self.assertEqual(created.status_code, 201)
        url = reverse("mail-draft-detail", args=[created.json()["id"]])
        edited = self.client.put(url, {"subject": "New", "body": "Changed", "student_ids": [], "conditions": []}, format="json")
        self.assertEqual((edited.status_code, edited.json()["subject"]), (200, "New"))
        self.assertEqual(MailDraft.objects.get().body, "Changed")
        self.client.force_authenticate(self.rival)
        self.assertEqual(self.client.get(reverse("mail-drafts-list-create")).json(), [])
        for method in ("get", "put", "delete"):
            self.assertEqual(getattr(self.client, method)(url, {"subject": "x"}, format="json").status_code, 404, method)
        self.assertEqual(MailDraft.objects.count(), 1)

    def test_history_is_private_too(self):
        MailHistory.objects.create(owner=self.teacher, subject="Mine", recipients=[], recipient_count=0)
        self.assertEqual(len(self.client.get(reverse("mail-history-list")).json()), 1)
        self.client.force_authenticate(self.rival)
        self.assertEqual(self.client.get(reverse("mail-history-list")).json(), [])


class SendTests(MailBase):
    def test_without_email_set_up_nothing_is_sent_and_the_teacher_is_told(self):
        with mock.patch("apps.mail.views.email_configured", return_value=False), mock.patch("apps.mail.views.send_email") as sender:
            response = self.send(subject="Hi", body="Body", student_ids=[self.alice.pk])
        self.assertEqual(response.status_code, 503)
        sender.assert_not_called()
        self.assertEqual(MailHistory.objects.count(), 0)

    def test_chosen_drafts_are_sent_with_their_own_content(self):
        one = MailDraft.objects.create(owner=self.teacher, subject="First", body="Body one")
        two = MailDraft.objects.create(owner=self.teacher, subject="Second", body="Body two")
        with CONFIGURED, mock.patch("apps.mail.views.send_email", return_value=True) as sender:
            response = self.send(draft_ids=[one.pk, two.pk], student_ids=[self.alice.pk, self.bob.pk])
        self.assertEqual(response.status_code, 201, response.content)
        sent = sorted((c.kwargs["subject"], c.kwargs["to_email"]) for c in sender.call_args_list)
        self.assertEqual(sent, [("First", "alice@x.com"), ("First", "bob@x.com"), ("Second", "alice@x.com"), ("Second", "bob@x.com")])
        self.assertEqual(response.json()["sent"], 4)
        self.assertEqual(MailHistory.objects.filter(owner=self.teacher).count(), 2)

    def test_names_and_real_marks_are_filled_in_per_recipient(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email", return_value=True) as sender:
            self.send(subject="Hello {{name}}", body="Marks: {{marks}} | Attendance: {{attendance}} | Reg {{reg}}", student_ids=[self.alice.pk, self.bob.pk])
        bodies = {c.kwargs["to_email"]: (c.kwargs["subject"], c.kwargs["body"]) for c in sender.call_args_list}
        self.assertEqual(bodies["alice@x.com"], ("Hello alice X", "Marks: 80.0% | Attendance: Not recorded | Reg R1"))
        self.assertIn("Marks: Not recorded", bodies["bob@x.com"][1])

    def test_message_text_is_escaped_and_keeps_its_line_breaks(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email", return_value=True) as sender:
            self.send(subject="S", body="Line one\n<script>x</script>", student_ids=[self.alice.pk])
        self.assertEqual(sender.call_args.kwargs["body"], "Line one<br>&lt;script&gt;x&lt;/script&gt;")

    def test_only_your_own_students_can_be_emailed(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email") as sender:
            response = self.send(subject="S", body="B", student_ids=[self.alice.pk, self.zed.pk])
        self.assertEqual(response.status_code, 400)
        sender.assert_not_called()

    def test_another_teachers_draft_cannot_be_sent(self):
        theirs = MailDraft.objects.create(owner=self.rival, subject="X", body="Y")
        with CONFIGURED, mock.patch("apps.mail.views.send_email") as sender:
            self.assertEqual(self.send(draft_ids=[theirs.pk], student_ids=[self.alice.pk]).status_code, 404)
        sender.assert_not_called()

    def test_uploaded_recipients_are_validated_and_deduplicated(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email", return_value=True) as sender:
            bad = self.send(subject="S", body="B", temporary_students=[{"name": "P", "email": "not-an-email"}])
            ok = self.send(subject="S", body="B", temporary_students=[{"name": "P", "email": "p@x.com"}, {"name": "P2", "email": "P@X.com"}], student_ids=[])
        self.assertEqual(bad.status_code, 400)
        self.assertEqual((ok.status_code, sender.call_count), (201, 1))

    def test_a_partial_failure_is_reported_and_only_reached_people_are_logged(self):
        def flaky(to_email, subject, body, connection=None):
            return to_email != "bob@x.com"

        with CONFIGURED, mock.patch("apps.mail.views.send_email", side_effect=flaky):
            response = self.send(subject="S", body="B", student_ids=[self.alice.pk, self.bob.pk])
        body = response.json()
        self.assertEqual((response.status_code, body["sent"], body["failed"]), (201, 1, ["bob@x.com"]))
        self.assertIn("1 could not be delivered", body["message"])
        self.assertEqual(MailHistory.objects.get().recipients, ["alice@x.com"])

    def test_when_everything_fails_it_is_an_error_not_a_success(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email", return_value=False):
            self.assertEqual(self.send(subject="S", body="B", student_ids=[self.alice.pk]).status_code, 502)
        self.assertEqual(MailHistory.objects.count(), 0)

    def test_empty_or_missing_content_and_recipients_are_refused(self):
        with CONFIGURED, mock.patch("apps.mail.views.send_email") as sender:
            self.assertEqual(self.send(subject="", body="B", student_ids=[self.alice.pk]).status_code, 400)
            self.assertEqual(self.send(subject="S", body="B", student_ids=[]).status_code, 400)
        sender.assert_not_called()


class GenerateTests(MailBase):
    def test_a_template_is_labelled_when_the_ai_is_unavailable(self):
        with mock.patch("apps.mail.views.GroqService.get_client", return_value=None):
            body = self.client.post(reverse("mail-generate"), {"students": [{"name": "A"}], "conditions": []}, format="json").json()
        self.assertEqual(body["source"], "template")


class PersonaliseTests(MailBase):
    def test_both_placeholder_styles_work(self):
        person = {"name": "Ann", "registration_number": "R7", "avg_score": 55.5, "attendance": None}
        self.assertEqual(personalise("{{name}} / {name} / {reg} / {marks} / {attendance}", person), "Ann / Ann / R7 / 55.5% / Not recorded")
