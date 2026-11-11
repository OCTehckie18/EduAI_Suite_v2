from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.models import AdmittedStaff
from apps.accounts.test_roster import build_structure, google
from apps.analytics import risk as risk_module
from apps.exams.models import ExamAttempt
from apps.exams.test_paper import PaperBase, pool_of_mcqs

from .models import UniversityProfile
from .rules import DEFAULT_RULES, domain_allowed

User = get_user_model()
RULES = "/api/v1/master-admin/university/rules/"
PUBLIC = "/api/v1/institution/university/"


def set_rules(**groups):
    profile = UniversityProfile.load()
    profile.rules = groups
    profile.save()


class RulesSettingsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(RULES, body, format="json")

    def test_defaults_are_todays_behaviour_and_the_public_part_excludes_risk(self):
        body = self.client.get(RULES).json()
        self.assertEqual(body["rules"], DEFAULT_RULES)
        public = self.client.get(PUBLIC).json()["rules"]
        self.assertEqual(public["exam"]["events"]["fullscreen_exit"], "end")
        self.assertEqual((public["signin"]["methods"], public["signin"]["session_minutes"]), ("both", 15))
        self.assertNotIn("risk", public)

    def test_changes_are_saved_audited_and_laid_over_the_defaults(self):
        response = self.put({"exam": {"events": {"window_blur": "warn"}, "warnings_allowed": 3}, "signin": {"allowed_domains": "ctu.edu, @Staff.ctu.edu"}})
        self.assertEqual(response.status_code, 200, response.content)
        rules = response.json()["rules"]
        self.assertEqual((rules["exam"]["events"]["window_blur"], rules["exam"]["events"]["tab_hidden"], rules["exam"]["warnings_allowed"]), ("warn", "end", 3))
        self.assertEqual(rules["signin"]["allowed_domains"], ["ctu.edu", "staff.ctu.edu"])
        self.put({"signin": {"session_minutes": 30}})
        self.assertEqual(self.client.get(RULES).json()["rules"]["exam"]["warnings_allowed"], 3)

    def test_wrong_values_are_refused_naming_the_field(self):
        for body, field in (
            ({"exam": {"events": {"window_blur": "explode"}}}, "exam.events.window_blur"),
            ({"exam": {"events": {"teleport": "end"}}}, "exam.events.teleport"),
            ({"exam": {"warnings_allowed": 0}}, "exam.warnings_allowed"),
            ({"exam": {"reset_by": "students"}}, "exam.reset_by"),
            ({"exam": {"rules_text": "x" * 2001}}, "exam.rules_text"),
            ({"signin": {"methods": "fax"}}, "signin.methods"),
            ({"signin": {"allowed_domains": ["not a domain"]}}, "signin.allowed_domains"),
            ({"signin": {"session_minutes": 2}}, "signin.session_minutes"),
            ({"accounts": {"teacher_approval": "anyone"}}, "accounts.teacher_approval"),
            ({"accounts": {"teacher_approval": "domain_auto"}}, "accounts.teacher_approval"),
            ({"accounts": {"student_can_edit": {"name": "no"}}}, "accounts.student_can_edit.name"),
            ({"risk": {"safe_mark": 50, "floor_mark": 60}}, "risk.floor_mark"),
            ({"risk": {"weights": {"marks": 60}}}, "risk.weights"),
        ):
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)
        self.assertEqual(UniversityProfile.load().rules, {})

    def test_only_a_master_admin_can_change_rules(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.put({"signin": {"session_minutes": 30}}).status_code, 403)

    def test_domains_include_their_subdomains(self):
        self.assertTrue(domain_allowed("a@mca.ctu.edu", ["ctu.edu"]))
        self.assertTrue(domain_allowed("a@CTU.edu", ["ctu.edu"]))
        self.assertFalse(domain_allowed("a@notctu.edu", ["ctu.edu"]))
        self.assertTrue(domain_allowed("a@gmail.com", []))


class ExamRuleTests(PaperBase):
    def violation(self, exam, attempt_id, kind="window_blur"):
        return self.client.post(reverse("exam-attempt-violation", args=[exam.pk, attempt_id]), {"type": kind}, format="json")

    def test_by_default_leaving_ends_the_attempt(self):
        exam = self.make_exam(pool_of_mcqs(2))
        student = self.student_number(1)
        attempt = self.start(student, exam).json()
        self.assertEqual(self.violation(exam, attempt["id"]).json()["status"], "flagged")

    def test_a_warned_event_counts_down_and_then_ends_the_attempt(self):
        set_rules(exam={"events": {"window_blur": "warn"}, "warnings_allowed": 2})
        exam = self.make_exam(pool_of_mcqs(2))
        student = self.student_number(1)
        attempt = self.start(student, exam).json()
        first = self.violation(exam, attempt["id"]).json()
        second = self.violation(exam, attempt["id"]).json()
        self.assertEqual([(first["status"], first["warnings"]), (second["status"], second["warnings"])], [("in_progress", 1), ("in_progress", 2)])
        third = self.violation(exam, attempt["id"]).json()
        self.assertEqual(third["status"], "flagged")
        self.assertIn("after 2 warnings", third["flag_reason"])
        # an event still set to end the exam ends it at once
        other = self.make_exam(pool_of_mcqs(2))
        attempt = self.start(student, other).json()
        self.assertEqual(self.violation(other, attempt["id"], "tab_hidden").json()["status"], "flagged")

    def test_an_ignored_event_changes_nothing(self):
        set_rules(exam={"events": {"page_unload": "ignore"}})
        exam = self.make_exam(pool_of_mcqs(2))
        attempt = self.start(self.student_number(1), exam).json()
        body = self.violation(exam, attempt["id"], "page_unload").json()
        self.assertEqual((body["status"], body["warnings"]), ("in_progress", 0))

    def test_when_only_admins_may_reset_a_teacher_is_refused(self):
        exam = self.make_exam(pool_of_mcqs(2))
        student = self.student_number(1)
        attempt = self.start(student, exam).json()
        self.violation(exam, attempt["id"], "tab_hidden")
        set_rules(exam={"reset_by": "admins"})
        self.client.force_authenticate(self.teacher)
        url = reverse("exam-attempt-reset", args=[exam.pk, attempt["id"]])
        response = self.client.post(url, {"reason": "Crash"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertIn("only the administration", response.json()["detail"])
        admin = User.objects.create_user(email="admin@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.post(url, {"reason": "Crash"}, format="json").status_code, 201)
        self.assertFalse(ExamAttempt.objects.filter(pk=attempt["id"]).exists())


class SignInRuleTests(APITestCase):
    def setUp(self):
        self.section, _ = build_structure()
        self.department = self.section.batch.program.department

    def password_login(self, username, password="Pw-12345678"):
        return self.client.post(reverse("password-login"), {"username": username, "password": password}, format="json")

    def test_google_only_refuses_passwords_but_never_locks_out_a_master_admin(self):
        set_rules(signin={"methods": "google"})
        User.objects.create_user(email="t@ctu.edu", password="Pw-12345678", role="TEACHER")
        User.objects.create_user(email="boss@ctu.edu", password="Pw-12345678", role="MASTER_ADMIN")
        self.assertEqual(self.password_login("t@ctu.edu").status_code, 403)
        self.assertEqual(self.password_login("boss@ctu.edu").status_code, 200)

    def test_password_only_refuses_google(self):
        set_rules(signin={"methods": "password"})
        self.assertEqual(google(self.client, "new@ctu.edu", app="teacherbuddy").status_code, 403)

    def test_google_sign_in_is_limited_to_the_allowed_domains(self):
        set_rules(signin={"allowed_domains": ["ctu.edu"]})
        refused = google(self.client, "someone@gmail.com", app="teacherbuddy")
        self.assertEqual(refused.status_code, 403)
        self.assertIn("@ctu.edu", refused.json()["detail"])
        self.assertEqual(google(self.client, "teacher@mca.ctu.edu", app="teacherbuddy").status_code, 200)
        User.objects.create_user(email="boss@gmail.com", password="pw", role="MASTER_ADMIN")
        self.assertEqual(google(self.client, "boss@gmail.com").status_code, 200)

    def test_roster_only_turns_away_unlisted_teachers(self):
        set_rules(accounts={"teacher_approval": "roster_only"})
        response = google(self.client, "stranger@ctu.edu", app="teacherbuddy")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email="stranger@ctu.edu").exists())
        AdmittedStaff.objects.create(emp_no="E1", email="listed@ctu.edu", department=self.department)
        self.assertEqual(google(self.client, "listed@ctu.edu", app="teacherbuddy").json()["status"], "approved")

    def test_domain_auto_approves_teachers_from_the_university_domain(self):
        set_rules(signin={"allowed_domains": ["ctu.edu"]}, accounts={"teacher_approval": "domain_auto"})
        response = google(self.client, "new@ctu.edu", app="teacherbuddy")
        self.assertEqual(response.json()["status"], "approved")

    def test_students_can_be_stopped_from_editing_parts_of_their_profile(self):
        student = User.objects.create_user(email="s@ctu.edu", password="Pw-12345678", role="STUDENT")
        self.client.force_authenticate(student)
        me = "/api/v1/auth/me/"
        self.assertEqual(self.client.patch(me, {"first_name": "Asha"}, format="json").status_code, 200)
        set_rules(accounts={"student_can_edit": {"name": False, "phone": True, "password": False}})
        self.assertEqual(self.client.patch(me, {"first_name": "Other"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(me, {"phone_number": "123"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(me, {"password": "New-pass-123", "current_password": "Pw-12345678"}, format="json").status_code, 403)
        teacher = User.objects.create_user(email="t@ctu.edu", password="pw", role="TEACHER")
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.patch(me, {"first_name": "Tina"}, format="json").status_code, 200)


class RiskRuleTests(PaperBase):
    def test_the_universitys_safe_mark_and_weights_change_the_score(self):
        exam = self.make_exam(pool_of_mcqs(4), attempts_allowed=1)
        student = self.student_number(1)
        attempt = self.start(student, exam).json()
        self.client.force_authenticate(student)
        right = [{"question_id": q["id"], "selected_choice_id": next(c["id"] for c in q["choices"] if c["choice_text"] == "4")} for q in attempt["paper"][:2]]
        self.client.post(reverse("exam-attempt-submit", args=[exam.pk, attempt["id"]]), {"answers": right}, format="json")  # 50%
        default = risk_module.analyse([self.classroom])[student.pk]
        set_rules(risk={"safe_mark": 50, "floor_mark": 20})
        relaxed = risk_module.analyse([self.classroom])[student.pk]
        set_rules(risk={"safe_mark": 90, "floor_mark": 40, "weights": {"marks": 70, "missing": 10, "trend": 10, "integrity": 10}})
        strict = risk_module.analyse([self.classroom])[student.pk]
        self.assertGreater(default.parts()["marks"], 0)
        self.assertEqual(relaxed.parts()["marks"], 0)
        self.assertGreater(strict.parts()["marks"], default.parts()["marks"])
