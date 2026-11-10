from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.models import AdmittedStudent
from apps.accounts.test_roster import build_structure
from apps.core.models import ActionHistory
from apps.institution.models import Program

User = get_user_model()


class UserEditingTests(APITestCase):
    def setUp(self):
        self.section_a, self.section_b = build_structure()
        self.program = self.section_a.batch.program
        self.admin = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.admin)

    def patch(self, user, **body):
        return self.client.patch(f"/api/v1/master-admin/users/{user.pk}/", body, format="json")

    def student(self, email="s@x.com", **extra):
        return User.objects.create_user(email=email, password="pw", role="STUDENT", **extra)

    def test_email_can_be_changed_and_is_audited(self):
        user = self.student()
        response = self.patch(user, email="  New@X.com ")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.email, "new@x.com")
        log = ActionHistory.objects.filter(action="update_user").latest("pk")
        self.assertEqual((log.metadata_json["email_from"], log.metadata_json["email_to"]), ("s@x.com", "new@x.com"))

    def test_email_taken_by_another_account_including_deactivated_is_refused(self):
        user = self.student()
        other = self.student("other@x.com")
        other.delete()
        response = self.patch(user, email="OTHER@x.com")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["field"], "email")

    def test_invalid_email_and_own_email_are_refused(self):
        self.assertEqual(self.patch(self.student(), email="nope").status_code, 400)
        self.assertEqual(self.patch(self.admin, email="mine@x.com").status_code, 400)

    def test_unchanged_email_in_the_form_body_is_fine(self):
        self.assertEqual(self.patch(self.admin, email="m@x.com", first_name="Mia").status_code, 200)

    def test_duplicate_numbers_name_the_field(self):
        self.student("a@x.com", register_no="R1")
        user = self.student("b@x.com")
        response = self.patch(user, register_no="r1")
        self.assertEqual((response.status_code, response.json()["field"]), (409, "register_no"))

    def test_moving_a_student_to_another_section_updates_account_and_roster_together(self):
        user = self.student(register_no="R1")
        entry = AdmittedStudent.objects.create(register_no="R1", email="s@x.com", name="S", section=self.section_a, user=user)
        response = self.patch(user, section=self.section_b.pk)
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        entry.refresh_from_db()
        self.assertEqual((user.section_id, entry.section_id), (self.section_b.pk, self.section_b.pk))
        self.assertEqual((user.program_id, user.department_id), (self.program.pk, self.program.department_id))

    def test_changing_email_and_register_number_keeps_the_roster_in_step(self):
        user = self.student(register_no="R1")
        entry = AdmittedStudent.objects.create(register_no="R1", email="s@x.com", name="S", section=self.section_a, user=user)
        self.patch(user, email="s2@x.com", register_no="R9")
        entry.refresh_from_db()
        self.assertEqual((entry.email, entry.register_no), ("s2@x.com", "R9"))

    def test_roster_clash_blocks_the_whole_change(self):
        user = self.student(register_no="R1")
        AdmittedStudent.objects.create(register_no="R1", email="s@x.com", name="S", section=self.section_a, user=user)
        AdmittedStudent.objects.create(register_no="R2", email="taken@x.com", name="T", section=self.section_a)
        self.assertEqual(self.patch(user, email="taken@x.com").status_code, 409)
        user.refresh_from_db()
        self.assertEqual(user.email, "s@x.com")

    def test_section_only_for_students_and_must_exist(self):
        teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER", department=self.program.department)
        self.assertEqual(self.patch(teacher, section=self.section_a.pk).status_code, 400)
        self.assertEqual(self.patch(self.student(), section=99999).status_code, 400)

    def test_teaching_programs_limited_to_the_teachers_department(self):
        teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER", department=self.program.department)
        other_department = type(self.program.department).objects.create(name="Maths", code="MTH", school=self.program.department.school)
        foreign = Program.objects.create(name="BSc", code="BSC", department=other_department, degree_level=Program.DegreeLevel.UG, duration_years=3)
        self.assertEqual(self.patch(teacher, teaching_programs=[self.program.pk]).status_code, 200)
        self.assertEqual(self.patch(teacher, teaching_programs=[foreign.pk]).status_code, 400)
        self.assertEqual(list(teacher.teaching_programs.values_list("pk", flat=True)), [self.program.pk])
        self.assertEqual(self.patch(teacher, teaching_programs=[]).status_code, 200)
        self.assertEqual(teacher.teaching_programs.count(), 0)
        self.assertEqual(self.patch(self.student(), teaching_programs=[1]).status_code, 400)

    def test_payload_shows_section_and_programs_and_options_endpoint_lists_them(self):
        user = self.student()
        self.patch(user, section=self.section_a.pk)
        body = self.client.get(f"/api/v1/master-admin/users/{user.pk}/").json()
        self.assertEqual(body["section"]["id"], self.section_a.pk)
        options = self.client.get("/api/v1/master-admin/users/placement-options/").json()
        self.assertEqual({s["id"] for s in options["sections"]}, {self.section_a.pk, self.section_b.pk})
        self.assertEqual(options["programs"][0]["id"], self.program.pk)

    def test_non_admins_are_refused(self):
        self.client.force_authenticate(self.student("x@x.com"))
        self.assertEqual(self.client.get("/api/v1/master-admin/users/placement-options/").status_code, 403)
