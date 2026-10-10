from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.core.models import ActionHistory
from apps.institution.models import Campus, Department, School


class MasterAdminAuthorizationTests(APITestCase):
    def setUp(self):
        self.student = get_user_model().objects.create_user(
            email="student@example.com", password="test-password")
        self.admin = get_user_model().objects.create_superuser(
            email="admin@example.com", password="test-password")

    def test_overview_requires_authentication(self):
        response = self.client.get(reverse("master-admin-overview"))
        self.assertEqual(response.status_code, 403)

    def test_overview_rejects_non_master_admin(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(reverse("master-admin-overview"))
        self.assertEqual(response.status_code, 403)

    def test_overview_allows_master_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("master-admin-overview"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("institution", response.data)
        self.assertIn("users", response.data)


class RecycleBinTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            email="admin2@example.com", password="test-password")
        self.campus = Campus.objects.create(
            name="Central Campus", code="CENTRAL", city="Bengaluru")
        self.campus.delete()
        self.client.force_authenticate(user=self.admin)

    def test_recycle_bin_lists_soft_deleted_records(self):
        response = self.client.get(
            reverse("master-admin-recycle-bin"), {"model": "institution.campus"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"]
                         [0]["content_type"], "institution.campus")

    def test_recycle_bin_restore_reactivates_record(self):
        response = self.client.post(
            reverse("master-admin-recycle-bin-restore",
                    args=["institution.campus", self.campus.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Campus.objects.filter(pk=self.campus.pk).exists())

    def test_recycle_bin_restore_rejects_already_active_record(self):
        self.campus.restore()
        response = self.client.post(
            reverse("master-admin-recycle-bin-restore",
                    args=["institution.campus", self.campus.pk])
        )
        self.assertEqual(response.status_code, 400)

    def test_recycle_bin_restore_rejects_unknown_content_type(self):
        response = self.client.post(
            reverse("master-admin-recycle-bin-restore",
                    args=["institution.doesnotexist", 1])
        )
        self.assertEqual(response.status_code, 404)


class CampusSummaryTests(APITestCase):
    def test_campus_summary_counts_real_rows(self):
        admin = get_user_model().objects.create_superuser(
            email="ca-admin@example.com", password="pw-12345-x")
        campus = Campus.objects.create(name="Counting Campus", code="CNT")
        school = School.objects.create(campus=campus, name="School A")
        Department.objects.create(school=school, name="Dept A")
        get_user_model().objects.create_user(
            email="stu-count@example.com", password="pw-12345-x", role="STUDENT", campus=campus)
        self.client.force_authenticate(admin)
        response = self.client.get("/api/v1/master-admin/campuses/")
        self.assertEqual(response.status_code, 200)
        row = next(r for r in response.data["results"] if r["code"] == "CNT")
        self.assertEqual((row["schools"], row["departments"], row["students"]), (1, 1, 1))

    def test_campus_summary_requires_master_admin(self):
        user = get_user_model().objects.create_user(
            email="plain@example.com", password="pw-12345-x", role="STUDENT")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/v1/master-admin/campuses/").status_code, 403)


class MasterAdminGovernanceTests(APITestCase):
    def setUp(self):
        self.User = get_user_model()
        self.admin = self.User.objects.create_superuser(
            email="governance-admin@example.com", password="testpass123")
        self.client.force_authenticate(self.admin)

    def test_master_admin_can_create_update_and_deactivate_campus(self):
        created = self.client.post(
            reverse("master-admin-campuses"),
            {"name": "New Campus", "code": "NEW", "city": "Bengaluru"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        campus_id = created.data["id"]

        updated = self.client.put(
            reverse("master-admin-campus-detail", args=[campus_id]),
            {"name": "Updated Campus", "code": "UPD", "city": "Mysuru"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["code"], "UPD")

        deleted = self.client.delete(
            reverse("master-admin-campus-detail", args=[campus_id])
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(Campus.all_objects.get(pk=campus_id).is_active)
        self.assertTrue(
            ActionHistory.objects.filter(action="deactivate_campus").exists()
        )

    def test_master_admin_can_filter_and_deactivate_then_restore_user(self):
        user = self.User.objects.create_user(
            email="directory-student@example.com",
            password="testpass123",
            role=self.User.Role.STUDENT,
        )
        response = self.client.get(
            reverse("master-admin-users"), {"search": "directory-student"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], user.email)

        updated = self.client.patch(
            reverse("master-admin-user-detail", args=[user.pk]),
            {"first_name": "Directory", "role": self.User.Role.TEACHER},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["role"], self.User.Role.TEACHER)

        deleted = self.client.delete(
            reverse("master-admin-user-detail", args=[user.pk])
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(self.User.all_objects.get(pk=user.pk).is_active)

        restored = self.client.post(
            reverse("master-admin-user-detail", args=[user.pk])
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(self.User.all_objects.get(pk=user.pk).is_active)

    def test_master_admin_cannot_deactivate_self(self):
        response = self.client.delete(
            reverse("master-admin-user-detail", args=[self.admin.pk])
        )
        self.assertEqual(response.status_code, 400)
