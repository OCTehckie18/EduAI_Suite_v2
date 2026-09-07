from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Batch, Campus, Department, Program, School, Section


class InstitutionModelTests(APITestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name="Central Campus", code="CENTRAL", city="Bengaluru")
        self.school = School.objects.create(name="School of Sciences", code="SOS", campus=self.campus)
        self.department = Department.objects.create(name="Computer Science", code="CSE", school=self.school)
        self.program = Program.objects.create(
            name="B.Tech Computer Science", code="BTECH-CSE", department=self.department,
            degree_level=Program.DegreeLevel.UG, duration_years=4,
        )
        self.batch = Batch.objects.create(
            name="2025-29", program=self.program, start_year=2025, end_year=2029,
            academic_year="2025-26",
        )
        self.section = Section.objects.create(name="A", batch=self.batch, max_capacity=60)

    def test_deleting_campus_soft_deletes_entire_hierarchy(self):
        self.campus.delete()

        for model in (Campus, School, Department, Program, Batch, Section):
            self.assertEqual(model.objects.count(), 0)
            self.assertEqual(model.all_objects.count(), 1)
            self.assertFalse(model.all_objects.get().is_active)

    def test_restore_endpoint_reactivates_record(self):
        self.campus.delete()
        admin = get_user_model().objects.create_superuser(
            username="test-admin", email="admin@example.com", password="test-password"
        )
        self.client.force_authenticate(user=admin)
        response = self.client.post(reverse("campus-restore", args=[self.campus.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Campus.objects.filter(pk=self.campus.pk).exists())


class InstitutionApiTests(APITestCase):
    def test_create_and_filter_hierarchy(self):
        campus_response = self.client.post(
            reverse("campus-list"),
            {"name": "Kengeri Campus", "code": "KENGERI", "city": "Bengaluru"},
            format="json",
        )
        self.assertEqual(campus_response.status_code, 201)
        campus_id = campus_response.data["id"]
        school_response = self.client.post(
            reverse("school-list"),
            {"name": "School of Business", "code": "SOB", "campus": campus_id},
            format="json",
        )
        self.assertEqual(school_response.status_code, 201)

        response = self.client.get(reverse("school-list"), {"campus_id": campus_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["campus_detail"]["code"], "KENGERI")
