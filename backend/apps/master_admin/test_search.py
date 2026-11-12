from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.models import AdmittedStaff, AdmittedStudent
from apps.core.models import ActionHistory
from apps.institution.models import Batch, Campus, Department, Program, School, Section

User = get_user_model()
URL = "/api/v1/master-admin/search/"


class MasterAdminSearchTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)
        campus = Campus.objects.create(name="Bengaluru Central", code="BLR")
        school = School.objects.create(campus=campus, name="Sciences", code="SCI")
        self.dept = Department.objects.create(school=school, name="Computer Science", code="CS")
        program = Program.objects.create(department=self.dept, name="MCA Data Science", code="MCADS", duration_years=2)
        batch = Batch.objects.create(program=program, name="2025", start_year=2025, end_year=2027)
        section = Section.objects.create(batch=batch, name="B")
        AdmittedStudent.objects.create(register_no="2547237", email="priya@x.com", name="Priya Nair", section=section)
        AdmittedStaff.objects.create(emp_no="EMP-77", email="rao@x.com", name="Dr Rao", department=self.dept)
        User.objects.create_user(email="priya@x.com", password="pw", role="STUDENT", first_name="Priya", last_name="Nair", register_no="2547237")

    def search(self, q):
        response = self.client.get(URL, {"q": q})
        self.assertEqual(response.status_code, 200)
        return {group["key"]: group["results"] for group in response.json()["groups"]}

    def test_finds_people_rosters_and_structure_by_any_keyword(self):
        found = self.search("priya")
        self.assertEqual(found["users"][0]["tab"], "users")
        self.assertEqual(found["roster"][0]["subtitle"], "2547237 · priya@x.com")
        self.assertIn("users", self.search("2547237"))
        self.assertEqual(self.search("emp-77")["teachers"][0]["tab"], "approvals")
        structure = self.search("data science")["structure"]
        self.assertEqual(structure[0]["subtitle"], "Program · MCADS")
        self.assertIn("structure", self.search("BLR"))

    def test_recent_admin_actions_are_searchable_but_open_nothing(self):
        ActionHistory.objects.create(feature="master_admin", action="update_university_rules", user_id=str(self.master.pk))
        ActionHistory.objects.create(feature="quiz", action="update_university_rules")
        results = self.search("university rules")["actions"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Update university rules")
        self.assertIsNone(results[0]["tab"])

    def test_short_or_unmatched_queries_return_nothing(self):
        self.assertEqual(self.client.get(URL, {"q": "p"}).json()["groups"], [])
        self.assertEqual(self.client.get(URL).json()["groups"], [])
        self.assertEqual(self.search("zzzzzz"), {})

    def test_each_group_is_capped(self):
        for i in range(12):
            User.objects.create_user(email=f"bulk{i}@x.com", password="pw", role="STUDENT")
        self.assertEqual(len(self.search("bulk")["users"]), 5)

    def test_only_master_admin(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.client.get(URL, {"q": "priya"}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL, {"q": "priya"}).status_code, (401, 403))
