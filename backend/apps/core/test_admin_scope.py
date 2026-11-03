from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.core.models import ActionHistory
from apps.institution.models import Batch, Campus, Department, Program, School, Section

User = get_user_model()


def build_campus(code):
    campus = Campus.objects.create(name=f"Campus {code}", code=code, city="Bengaluru")
    school = School.objects.create(name=f"School {code}", code=f"S{code}", campus=campus)
    department = Department.objects.create(name=f"Dept {code}", code=f"D{code}", school=school)
    program = Program.objects.create(
        name=f"Program {code}", code=f"P{code}", department=department,
        degree_level=Program.DegreeLevel.UG, duration_years=3,
    )
    batch = Batch.objects.create(name="2026", program=program, start_year=2026, end_year=2029, academic_year="2026-27")
    section = Section.objects.create(name="A", batch=batch)
    return campus, school, department, program, batch, section


class AuditLogAccessTests(APITestCase):
    def setUp(self):
        self.campus_a, *_ = build_campus("A")
        self.campus_b, *_ = build_campus("B")
        self.student = User.objects.create_user(email="s@x.com", password="pw", role="STUDENT", campus=self.campus_a)
        self.teacher_b = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER", campus=self.campus_b)
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        ActionHistory.objects.create(feature="mail", action="send", user_id=str(self.student.pk))
        ActionHistory.objects.create(feature="mail", action="send", user_id=str(self.teacher_b.pk))

    def test_anonymous_cannot_read_or_write(self):
        self.assertIn(self.client.get("/api/v1/history/").status_code, (401, 403))
        before = ActionHistory.objects.count()
        response = self.client.post("/api/v1/history/", {"feature": "x", "user_id": "1"}, format="json")
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(ActionHistory.objects.count(), before)

    def test_users_only_see_their_own_entries(self):
        self.client.force_authenticate(self.student)
        entries = self.client.get("/api/v1/history/").json()
        self.assertEqual({e["user_id"] for e in entries}, {str(self.student.pk)})

    def test_master_admin_sees_every_entry(self):
        self.client.force_authenticate(self.master)
        self.assertEqual(len(self.client.get("/api/v1/history/").json()), 2)

    def test_posted_entries_are_attributed_to_the_caller(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            "/api/v1/history/", {"feature": "calendar", "action": "x" * 300, "user_id": str(self.master.pk)}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user_id"], str(self.student.pk))
        self.assertEqual(len(response.json()["action"]), 100)

    def test_health_check_does_not_leak_errors(self):
        body = self.client.get("/api/v1/health/").json()
        self.assertEqual(body["database"], "connected")


class HierarchyAccessTests(APITestCase):
    def setUp(self):
        self.campus_a, self.school_a, self.dept_a, self.program_a, self.batch_a, self.section_a = build_campus("A")
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.teacher = User.objects.create_user(email="t@x.com", password="pw", role="TEACHER", campus=self.campus_a)
        self.student = User.objects.create_user(email="s@x.com", password="pw", role="STUDENT", campus=self.campus_a)

    def test_only_master_admin_can_change_the_hierarchy(self):
        for user in (self.teacher, self.student):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/v1/institution/schools/").status_code, 200)
            create = self.client.post("/api/v1/institution/schools/", {"name": "N", "code": "N", "campus": self.campus_a.pk}, format="json")
            self.assertEqual(create.status_code, 403)
            self.assertEqual(self.client.patch(f"/api/v1/institution/schools/{self.school_a.pk}/", {"name": "x"}, format="json").status_code, 403)
            self.assertEqual(self.client.delete(f"/api/v1/institution/departments/{self.dept_a.pk}/").status_code, 403)
        self.school_a.refresh_from_db()
        self.assertNotEqual(self.school_a.name, "x")
        self.client.force_authenticate(self.master)
        ok = self.client.post("/api/v1/institution/schools/", {"name": "N", "code": "N", "campus": self.campus_a.pk}, format="json")
        self.assertEqual(ok.status_code, 201)

    def test_audit_fields_are_read_only(self):
        self.client.force_authenticate(self.master)
        response = self.client.patch(
            f"/api/v1/institution/schools/{self.school_a.pk}/", {"is_active": False, "deleted_at": "2020-01-01T00:00:00Z"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.school_a.refresh_from_db()
        self.assertTrue(self.school_a.is_active)
        self.assertIsNone(self.school_a.deleted_at)

    def test_duplicate_of_soft_deleted_code_is_a_400_not_a_500(self):
        self.school_a.delete()
        self.client.force_authenticate(self.master)
        response = self.client.post(
            "/api/v1/institution/schools/", {"name": "Again", "code": self.school_a.code, "campus": self.campus_a.pk}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        campus_dup = self.client.post("/api/v1/institution/campuses/", {"name": "Z", "code": "A", "city": "Y"}, format="json")
        self.assertEqual(campus_dup.status_code, 400)

    def test_field_validation(self):
        self.client.force_authenticate(self.master)
        batch = self.client.post(
            "/api/v1/institution/batches/",
            {"name": "bad", "program": self.program_a.pk, "start_year": 2030, "end_year": 2026, "academic_year": "x"},
            format="json",
        )
        self.assertEqual(batch.status_code, 400)
        section = self.client.post("/api/v1/institution/sections/", {"name": "Z", "batch": self.batch_a.pk, "max_capacity": 0}, format="json")
        self.assertEqual(section.status_code, 400)

    def test_restore_requires_active_parents(self):
        self.school_a.delete()  # cascades to its departments
        self.client.force_authenticate(self.master)
        blocked = self.client.post(f"/api/v1/institution/departments/{self.dept_a.pk}/restore/")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(self.client.post(f"/api/v1/institution/schools/{self.school_a.pk}/restore/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/institution/departments/{self.dept_a.pk}/restore/").status_code, 200)


class MasterAdminHardeningTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN", is_superuser=True, is_staff=True)
        self.other = User.objects.create_user(email="m2@x.com", password="pw", role="MASTER_ADMIN", is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.master)

    def test_demoting_a_master_admin_clears_superuser_access(self):
        response = self.client.patch(f"/api/v1/master-admin/users/{self.other.pk}/", {"role": "TEACHER"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertFalse(self.other.is_superuser)
        self.assertFalse(self.other.is_staff)

    def test_last_master_admin_cannot_be_demoted_by_another_admin(self):
        self.other.role = "TEACHER"
        self.other.save(update_fields=["role"])
        promoter = User.objects.create_user(email="p@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(promoter)
        response = self.client.patch(f"/api/v1/master-admin/users/{self.master.pk}/", {"role": "STUDENT"}, format="json")
        self.assertEqual(response.status_code, 200)  # promoter still remains
        response = self.client.patch(f"/api/v1/master-admin/users/{promoter.pk}/", {"role": "STUDENT"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_create_user_validates_role_and_password(self):
        base = {"email": "new@x.com", "first_name": "N"}
        self.assertEqual(self.client.post("/api/v1/master-admin/users/", {**base, "password": "Str0ng!pass", "role": "WIZARD"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/master-admin/users/", {**base, "password": "123", "role": "STUDENT"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/master-admin/users/", {**base, "password": "Str0ng!pass", "role": "TEACHER"}, format="json").status_code, 201)

    def test_patch_blank_names_do_not_null_required_columns(self):
        response = self.client.patch(f"/api/v1/master-admin/users/{self.other.pk}/", {"first_name": None, "last_name": "", "phone_number": None}, format="json")
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual((self.other.first_name, self.other.last_name, self.other.phone_number), ("", "", ""))

    def test_recycle_bin_survives_null_deleted_at_and_finds_old_records(self):
        campus = Campus.objects.create(name="Old", code="OLD", city="X")
        Campus.all_objects.filter(pk=campus.pk).update(is_active=False, deleted_at=None)
        newer = Campus.objects.create(name="Newer", code="NEW", city="X")
        newer.delete()
        response = self.client.get("/api/v1/master-admin/recycle-bin/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)
        found = self.client.get("/api/v1/master-admin/recycle-bin/?search=old").json()
        self.assertEqual([i["label"] for i in found["results"]], [str(campus)])

    def test_recycle_bin_restore_requires_active_parent(self):
        school_campus, school, *_ = build_campus("Q")
        school.delete()
        school_campus.delete()
        response = self.client.post(f"/api/v1/master-admin/recycle-bin/institution.school/{school.pk}/restore/")
        self.assertEqual(response.status_code, 409)


