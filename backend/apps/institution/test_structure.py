from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from rest_framework.test import APITestCase

from .models import Batch, Campus, Department, Program, School, Section

User = get_user_model()


def tree():
    campus = Campus.objects.create(name="Central", code="CEN", city="Bengaluru")
    school = School.objects.create(name="Sciences", code="SCI", campus=campus)
    department = Department.objects.create(name="Computer Science", code="CSE", school=school)
    program = Program.objects.create(
        name="BCA", code="BCA", department=department, degree_level=Program.DegreeLevel.UG, duration_years=3
    )
    return campus, school, department, program


class ClassAndSectionRulesTests(APITestCase):
    def setUp(self):
        self.campus, self.school, self.department, self.program = tree()
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def create_class(self, name="2026-29"):
        response = self.client.post(
            "/api/v1/institution/batches/",
            {"name": name, "program": self.program.pk, "start_year": 2026, "end_year": 2029, "academic_year": "2026-27"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return Batch.objects.get(pk=response.json()["id"])

    def test_a_new_class_always_starts_with_section_a(self):
        batch = self.create_class()
        self.assertEqual(list(batch.sections.values_list("name", flat=True)), ["A"])

    def test_the_last_section_of_a_class_cannot_be_removed(self):
        batch = self.create_class()
        only = batch.sections.get()
        response = self.client.delete(f"/api/v1/institution/sections/{only.pk}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("at least one section", response.json()["detail"])
        self.assertTrue(Section.objects.filter(pk=only.pk).exists())

    def test_one_of_several_sections_can_be_removed(self):
        batch = self.create_class()
        extra = Section.objects.create(batch=batch, name="B")
        self.assertEqual(self.client.delete(f"/api/v1/institution/sections/{extra.pk}/").status_code, 200)
        self.assertEqual(batch.sections.count(), 1)

    def test_restoring_a_class_brings_its_sections_back(self):
        batch = self.create_class()
        Section.objects.create(batch=batch, name="B")
        self.assertEqual(self.client.delete(f"/api/v1/institution/batches/{batch.pk}/").status_code, 200)
        self.assertEqual(Section.objects.filter(batch=batch).count(), 0)
        self.assertEqual(self.client.post(f"/api/v1/institution/batches/{batch.pk}/restore/").status_code, 200)
        self.assertEqual(sorted(batch.sections.values_list("name", flat=True)), ["A", "B"])

    def test_a_class_restored_without_removed_sections_still_gets_one(self):
        batch = self.create_class()
        section = batch.sections.get()
        batch.delete()
        # The section was removed long before the class (not part of the same removal).
        Section.all_objects.filter(pk=section.pk).update(deleted_at="2000-01-01T00:00:00Z")
        self.assertEqual(self.client.post(f"/api/v1/institution/batches/{batch.pk}/restore/").status_code, 200)
        self.assertEqual(batch.sections.count(), 1)

    def test_child_counts_are_returned_for_every_level(self):
        batch = self.create_class()
        Section.objects.create(batch=batch, name="B")
        student = User.objects.create_user(email="s@x.com", role="STUDENT", section=batch.sections.get(name="A"))
        self.assertTrue(student.pk)

        def row(path):
            body = self.client.get(path).json()
            return (body["results"] if isinstance(body, dict) else body)[0]

        self.assertEqual(row("/api/v1/institution/campuses/")["child_count"], 1)
        self.assertEqual(row("/api/v1/institution/schools/")["child_count"], 1)
        self.assertEqual(row("/api/v1/institution/departments/")["child_count"], 1)
        self.assertEqual(row("/api/v1/institution/programs/")["child_count"], 1)
        self.assertEqual(row("/api/v1/institution/batches/")["child_count"], 2)
        sections = {s["name"]: s["child_count"] for s in self.client.get("/api/v1/institution/sections/").json()["results"]}
        self.assertEqual(sections, {"A": 1, "B": 0})

    def test_validation_errors_come_back_as_readable_messages(self):
        response = self.client.post(
            "/api/v1/institution/batches/",
            {"name": "bad", "program": self.program.pk, "start_year": 2030, "end_year": 2026, "academic_year": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("End year", response.json()["detail"])
        duplicate = self.client.post("/api/v1/institution/schools/", {"name": "Dup", "code": "SCI", "campus": self.campus.pk}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("unique set", duplicate.json()["detail"])
        self.school.delete()
        revived = self.client.post("/api/v1/institution/schools/", {"name": "Dup", "code": "SCI", "campus": self.campus.pk}, format="json")
        self.assertEqual(revived.status_code, 400)
        self.assertIn("recycle bin", revived.json()["detail"])

    def test_non_admins_get_a_readable_forbidden_message(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", role="TEACHER"))
        response = self.client.post("/api/v1/institution/schools/", {"name": "N", "code": "N", "campus": self.campus.pk}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.json()["detail"])


class DefaultSectionMigrationTests(TransactionTestCase):
    migrate_from = [("institution", "0001_initial")]
    migrate_to = [("institution", "0002_default_sections")]

    def tearDown(self):
        # Put every app back at its latest migration, so later tests see the full schema (for example new User columns).
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_existing_classes_without_sections_get_section_a(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        OldCampus, OldSchool = old_apps.get_model("institution", "Campus"), old_apps.get_model("institution", "School")
        OldDept, OldProgram = old_apps.get_model("institution", "Department"), old_apps.get_model("institution", "Program")
        OldBatch, OldSection = old_apps.get_model("institution", "Batch"), old_apps.get_model("institution", "Section")
        campus = OldCampus.objects.create(name="C", code="C", city="X")
        school = OldSchool.objects.create(name="S", code="S", campus=campus)
        department = OldDept.objects.create(name="D", code="D", school=school)
        program = OldProgram.objects.create(name="P", code="P", department=department, degree_level="UG", duration_years=3)
        bare = OldBatch.objects.create(name="bare", program=program, start_year=2026, end_year=2029, academic_year="x")
        kept = OldBatch.objects.create(name="kept", program=program, start_year=2026, end_year=2029, academic_year="x")
        OldSection.objects.create(batch=kept, name="Z")

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        new_apps = executor.loader.project_state(self.migrate_to).apps
        Section = new_apps.get_model("institution", "Section")
        self.assertEqual(list(Section.objects.filter(batch_id=bare.pk).values_list("name", flat=True)), ["A"])
        self.assertEqual(list(Section.objects.filter(batch_id=kept.pk).values_list("name", flat=True)), ["Z"])
