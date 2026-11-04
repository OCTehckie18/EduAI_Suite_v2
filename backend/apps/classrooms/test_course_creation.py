from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Classroom

User = get_user_model()


def build_department(code):
    campus, _ = Campus.objects.get_or_create(code="CEN", defaults={"name": "Central", "city": "Bengaluru"})
    school = School.objects.create(name=f"School {code}", code=f"S{code}", campus=campus)
    department = Department.objects.create(name=f"Department {code}", code=code, school=school)
    program = Program.objects.create(
        name=f"Program {code}", code=f"P{code}", department=department, degree_level="UG", duration_years=3
    )
    batch = Batch.objects.create(name="2026-29", program=program, start_year=2026, end_year=2029, academic_year="2026-27")
    section_a = Section.objects.create(name="A", batch=batch)
    section_b = Section.objects.create(name="B", batch=batch)
    return department, program, batch, section_a, section_b


class CourseCreationTests(APITestCase):
    def setUp(self):
        self.dept, self.program, self.batch, self.section_a, self.section_b = build_department("CSE")
        self.other_dept, self.other_program, self.other_batch, self.other_section, _ = build_department("LAW")
        self.teacher = User.objects.create_user(email="t@x.com", role="TEACHER", department=self.dept)
        self.master = User.objects.create_user(email="m@x.com", role="MASTER_ADMIN")
        self.client.force_authenticate(self.teacher)

    def create(self, **extra):
        return self.client.post("/api/v1/courses/", {"code": "C1", "name": "Intro", **extra}, format="json")

    def test_creating_a_course_with_no_class_is_a_clear_400_not_a_server_error(self):
        for payload in ({}, {"batch": "2026-A"}, {"batch_id": 9999}):
            response = self.create(**payload)
            self.assertEqual(response.status_code, 400, payload)
            self.assertIn("Choose the class", response.json()["detail"])
        self.assertEqual(Classroom.objects.count(), 0)

    def test_creating_in_an_empty_institution_does_not_crash(self):
        Batch.all_objects.all().hard_delete()
        self.assertEqual(self.create(batch_id=self.batch.pk).status_code, 400)

    def test_department_and_program_are_derived_from_the_class(self):
        response = self.create(batch_id=self.batch.pk, department_id=self.other_dept.pk, program_id=self.other_program.pk)
        self.assertEqual(response.status_code, 201, response.content)
        classroom = Classroom.objects.get()
        self.assertEqual((classroom.department_id, classroom.program_id, classroom.batch_id), (self.dept.pk, self.program.pk, self.batch.pk))
        self.assertEqual(classroom.teacher_id, self.teacher.pk)
        self.assertIsNone(classroom.section_id)  # the course covers every section unless one is chosen

    def test_a_section_can_be_chosen_but_must_belong_to_the_class(self):
        ok = self.create(batch_id=self.batch.pk, section_id=self.section_b.pk)
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(Classroom.objects.get().section_id, self.section_b.pk)
        wrong = self.create(batch_id=self.batch.pk, section_id=self.other_section.pk, code="C2")
        self.assertEqual(wrong.status_code, 400)
        self.assertIn("does not belong", wrong.json()["detail"])

    def test_teachers_can_only_use_classes_from_their_own_department(self):
        response = self.create(batch_id=self.other_batch.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn("own department", response.json()["detail"])
        self.assertEqual(Classroom.objects.count(), 0)

    def test_a_teacher_without_a_department_is_asked_to_finish_their_profile(self):
        self.client.force_authenticate(User.objects.create_user(email="new@x.com", role="TEACHER"))
        response = self.create(batch_id=self.batch.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn("profile", response.json()["detail"])

    def test_older_clients_can_still_send_the_class_name(self):
        response = self.create(batch="2026-29")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Classroom.objects.get().batch_id, self.batch.pk)

    def test_master_admin_must_name_the_teacher(self):
        self.client.force_authenticate(self.master)
        self.assertEqual(self.create(batch_id=self.other_batch.pk).status_code, 400)
        response = self.create(batch_id=self.other_batch.pk, teacher=self.teacher.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Classroom.objects.get().department_id, self.other_dept.pk)

    def test_changing_a_course_class_follows_the_same_rules(self):
        self.create(batch_id=self.batch.pk)
        classroom = Classroom.objects.get()
        denied = self.client.put(f"/api/v1/courses/{classroom.pk}", {"batch_id": self.other_batch.pk}, format="json")
        self.assertEqual(denied.status_code, 400)
        classroom.refresh_from_db()
        self.assertEqual(classroom.batch_id, self.batch.pk)

    def test_options_list_only_the_teachers_department(self):
        body = self.client.get("/api/v1/courses/options/").json()
        self.assertEqual(body["department"]["id"], self.dept.pk)
        self.assertEqual([p["id"] for p in body["programs"]], [self.program.pk])
        batch = body["programs"][0]["batches"][0]
        self.assertEqual(batch["id"], self.batch.pk)
        self.assertEqual([s["name"] for s in batch["sections"]], ["A", "B"])

    def test_options_are_for_teachers_and_admins_only(self):
        self.client.force_authenticate(User.objects.create_user(email="s@x.com", role="STUDENT"))
        self.assertEqual(self.client.get("/api/v1/courses/options/").status_code, 403)
        self.client.force_authenticate(self.master)
        self.assertEqual(len(self.client.get("/api/v1/courses/options/").json()["programs"]), 2)


class AssigningADepartmentTests(APITestCase):
    def setUp(self):
        self.dept, self.program, self.batch, *_ = build_department("CSE")
        self.master = User.objects.create_user(email="m@x.com", role="MASTER_ADMIN")
        self.teacher = User.objects.create_user(email="t@x.com", role="TEACHER")
        self.client.force_authenticate(self.master)

    def test_master_admin_assigns_a_teachers_department_and_they_can_then_create_courses(self):
        response = self.client.patch(f"/api/v1/master-admin/users/{self.teacher.pk}/", {"department": self.dept.pk}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["department"]["id"], self.dept.pk)
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.department_id, self.teacher.school_id, self.teacher.campus_id),
                         (self.dept.pk, self.dept.school_id, self.dept.school.campus_id))
        self.client.force_authenticate(self.teacher)
        created = self.client.post("/api/v1/courses/", {"code": "C1", "name": "Intro", "batch_id": self.batch.pk}, format="json")
        self.assertEqual(created.status_code, 201, created.content)

    def test_unknown_departments_are_rejected_and_none_clears_it(self):
        self.assertEqual(self.client.patch(f"/api/v1/master-admin/users/{self.teacher.pk}/", {"department": 9999}, format="json").status_code, 400)
        self.client.patch(f"/api/v1/master-admin/users/{self.teacher.pk}/", {"department": self.dept.pk}, format="json")
        self.client.patch(f"/api/v1/master-admin/users/{self.teacher.pk}/", {"department": None}, format="json")
        self.teacher.refresh_from_db()
        self.assertIsNone(self.teacher.department_id)

    def test_new_users_can_be_created_with_a_department(self):
        response = self.client.post(
            "/api/v1/master-admin/users/",
            {"email": "n@x.com", "password": "Str0ng!pass9", "role": "TEACHER", "department": self.dept.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(User.objects.get(email="n@x.com").department_id, self.dept.pk)
