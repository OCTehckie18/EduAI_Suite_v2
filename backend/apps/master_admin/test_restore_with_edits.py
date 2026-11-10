from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.models import AdmittedStudent
from apps.accounts.test_roster import build_structure
from apps.core.models import ActionHistory
from apps.institution.models import Department

User = get_user_model()
DEPT = "institution.department"


class RestoreWithEditsTests(APITestCase):
    def setUp(self):
        self.section_a, self.section_b = build_structure()
        self.school = self.section_a.batch.program.department.school
        self.cse = self.section_a.batch.program.department
        self.admin = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.admin)

    def url(self, obj, suffix=""):
        return f"/api/v1/master-admin/recycle-bin/{DEPT}/{obj.pk}/{suffix}"

    def deleted_department(self, code="ECE", name="Electronics"):
        department = Department.objects.create(name=name, code=code, school=self.school)
        department.delete()
        return department

    def test_detail_lists_fields_blockers_and_no_conflicts(self):
        department = self.deleted_department()
        body = self.client.get(self.url(department)).json()
        self.assertEqual([f["name"] for f in body["fields"]], ["name", "code"])
        self.assertEqual((body["blockers"], body["conflicts"]), ([], []))

    def test_plain_restore_still_works_without_a_body(self):
        department = self.deleted_department()
        self.assertEqual(self.client.post(self.url(department, "restore/")).status_code, 200)
        self.assertTrue(Department.objects.filter(pk=department.pk).exists())

    def test_restore_with_a_renamed_code_and_audit(self):
        department = self.deleted_department()
        response = self.client.post(self.url(department, "restore/"), {"changes": {"code": "ECE2", "name": " Electronics 2 "}}, format="json")
        self.assertEqual(response.status_code, 200)
        department.refresh_from_db()
        self.assertEqual((department.code, department.name, department.is_active), ("ECE2", "Electronics 2", True))
        log = ActionHistory.objects.filter(action="restore_record").latest("pk")
        self.assertEqual(log.metadata_json["changes"][f"{DEPT}:{department.pk}"]["code"], {"from": "ECE", "to": "ECE2"})

    def test_a_clash_is_reported_and_left_unresolved_gives_409_naming_both(self):
        department = self.deleted_department(code="cse")  # same code as the active one, ignoring case
        detail = self.client.get(self.url(department)).json()
        self.assertEqual(detail["conflicts"][0]["record"]["id"], self.cse.pk)
        response = self.client.post(self.url(department, "restore/"))
        self.assertEqual(response.status_code, 409)
        department.refresh_from_db()
        self.assertFalse(department.is_active)
        response = self.client.post(self.url(department, "restore/"), {"changes": {"name": "Other"}}, format="json")
        self.assertEqual((response.status_code, response.json()["conflicts"][0]["record"]["id"]), (409, self.cse.pk))

    def test_a_clash_resolved_by_renaming_the_restored_record(self):
        department = self.deleted_department(code="cse")
        response = self.client.post(self.url(department, "restore/"), {"changes": {"code": "CSE-OLD"}}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_a_clash_resolved_by_renaming_the_existing_record(self):
        department = self.deleted_department(code="cse")
        key = f"{DEPT}:{self.cse.pk}"
        response = self.client.post(self.url(department, "restore/"), {"existing_changes": {key: {"code": "CSE-NEW"}}}, format="json")
        self.assertEqual(response.status_code, 200)
        self.cse.refresh_from_db()
        department.refresh_from_db()
        self.assertEqual((self.cse.code, department.code, department.is_active), ("CSE-NEW", "cse", True))

    def test_failed_restore_rolls_back_changes_to_the_existing_record(self):
        department = self.deleted_department(code="cse")
        key = f"{DEPT}:{self.cse.pk}"
        response = self.client.post(self.url(department, "restore/"), {"existing_changes": {key: {"name": "Renamed"}}}, format="json")
        self.assertEqual(response.status_code, 409)
        self.cse.refresh_from_db()
        self.assertEqual(self.cse.name, "Computer Science")

    def test_existing_changes_only_apply_to_records_in_the_way(self):
        department = self.deleted_department(code="ECE")
        key = f"{DEPT}:{self.cse.pk}"  # not in the way
        self.client.post(self.url(department, "restore/"), {"existing_changes": {key: {"name": "Hacked"}}}, format="json")
        self.cse.refresh_from_db()
        self.assertEqual(self.cse.name, "Computer Science")

    def test_invalid_values_give_400_with_the_field_and_nothing_is_saved(self):
        department = self.deleted_department()
        response = self.client.post(self.url(department, "restore/"), {"changes": {"name": "", "code": "X" * 80}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()["errors"]), {"name", "code"})
        department.refresh_from_db()
        self.assertFalse(department.is_active)

    def test_fields_outside_the_allow_list_are_ignored(self):
        department = self.deleted_department()
        self.client.post(self.url(department, "restore/"), {"changes": {"school": 999, "is_active": False, "code": "ECE9"}}, format="json")
        department.refresh_from_db()
        self.assertEqual((department.school_id, department.is_active, department.code), (self.school.pk, True, "ECE9"))

    def test_deleted_parent_still_blocks_with_a_list(self):
        department = self.deleted_department()
        self.school.delete()
        response = self.client.post(self.url(department, "restore/"), {"changes": {"code": "Z"}}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(response.json()["blockers"])

    def test_restoring_a_user_with_a_new_email_keeps_the_roster_in_step(self):
        user = User.objects.create_user(email="s@x.com", password="pw", role="STUDENT", register_no="R1")
        entry = AdmittedStudent.objects.create(register_no="R1", email="s@x.com", name="S", section=self.section_a, user=user)
        user.delete()
        taken = User.objects.create_user(email="s2@x.com", password="pw", role="STUDENT")
        url = f"/api/v1/master-admin/recycle-bin/accounts.user/{user.pk}/restore/"
        self.assertEqual(self.client.post(url, {"changes": {"email": "S2@x.com"}}, format="json").status_code, 409)
        self.assertEqual(self.client.post(url, {"changes": {"email": "s3@x.com", "register_no": ""}}, format="json").status_code, 200)
        user.refresh_from_db()
        entry.refresh_from_db()
        self.assertEqual((user.email, user.register_no, entry.email, entry.register_no), ("s3@x.com", None, "s3@x.com", "R1"))
        self.assertTrue(taken.is_active)

    def test_only_master_admins(self):
        department = self.deleted_department()
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.client.get(self.url(department)).status_code, 403)
        self.assertEqual(self.client.post(self.url(department, "restore/")).status_code, 403)
