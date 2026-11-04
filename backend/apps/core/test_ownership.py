from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.accounts.testing import default_section
from apps.announcements.models import Announcement
from apps.appointments.models import Appointment
from apps.assignments.models import Assignment, Submission
from apps.classrooms.models import Classroom, Enrollment
from apps.lessons.models import Lesson

User = get_user_model()


class OwnershipBase(APITestCase):
    def setUp(self):
        section = default_section()
        batch = section.batch
        program = batch.program
        department = program.department
        self.owner = User.objects.create_user(email="owner@x.com", first_name="Olga", last_name="Owner", role="TEACHER", department=department)
        self.rival = User.objects.create_user(email="rival@x.com", first_name="Rita", last_name="Rival", role="TEACHER", department=department)
        self.master = User.objects.create_user(email="m@x.com", role="MASTER_ADMIN")
        self.alice = User.objects.create_user(email="alice@x.com", first_name="Alice", last_name="Able", role="STUDENT")
        self.bob = User.objects.create_user(email="bob@x.com", first_name="Bob", last_name="Baker", role="STUDENT")
        self.outsider = User.objects.create_user(email="out@x.com", first_name="Out", last_name="Sider", role="STUDENT")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.owner, department=department, program=program, batch=batch)
        self.other_course = Classroom.objects.create(name="Law", subject_code="L1", teacher=self.rival, department=department, program=program, batch=batch)
        for student in (self.alice, self.bob):
            Enrollment.objects.create(classroom=self.course, student=student)
        self.assignment = Assignment.objects.create(course=self.course, title="HW", max_points=50)

    def as_user(self, user):
        self.client.force_authenticate(user)


class AnnouncementOwnershipTests(OwnershipBase):
    def test_only_the_courses_teacher_can_post_and_delete(self):
        url = f"/api/v1/announcements/{self.course.pk}"
        self.as_user(self.rival)
        self.assertEqual(self.client.post(url, {"title": "Spam", "body": "x"}, format="json").status_code, 403)
        self.as_user(self.alice)
        self.assertEqual(self.client.post(url, {"title": "Spam", "body": "x"}, format="json").status_code, 403)
        self.as_user(self.owner)
        created = self.client.post(url, {"title": "Hello", "body": "x"}, format="json")
        self.assertEqual(created.status_code, 201)
        note_id = created.json()["id"]
        self.as_user(self.rival)
        self.assertEqual(self.client.delete(f"/api/v1/announcements/detail/{note_id}").status_code, 403)
        self.as_user(self.alice)
        self.assertEqual(self.client.delete(f"/api/v1/announcements/detail/{note_id}").status_code, 403)
        self.assertTrue(Announcement.objects.filter(pk=note_id).exists())
        self.as_user(self.owner)
        self.assertEqual(self.client.delete(f"/api/v1/announcements/detail/{note_id}").status_code, 204)

    def test_announcements_are_visible_only_to_the_course_members(self):
        Announcement.objects.create(course=self.course, title="Exam", body="Friday", time="now")
        url = f"/api/v1/announcements/{self.course.pk}"
        for user in (self.owner, self.alice, self.master):
            self.as_user(user)
            self.assertEqual(self.client.get(url).status_code, 200, user.email)
        for user in (self.rival, self.outsider):
            self.as_user(user)
            self.assertEqual(self.client.get(url).status_code, 403, user.email)


class AssignmentOwnershipTests(OwnershipBase):
    def test_only_the_courses_teacher_manages_assignments(self):
        list_url = f"/api/v1/assignments/{self.course.pk}"
        for user in (self.alice, self.rival):
            self.as_user(user)
            self.assertEqual(self.client.post(list_url, {"title": "X", "max_points": 10}, format="json").status_code, 403, user.email)
            self.assertEqual(self.client.put(f"/api/v1/assignments/detail/{self.assignment.pk}", {"title": "Hacked"}, format="json").status_code, 403)
            self.assertEqual(self.client.delete(f"/api/v1/assignments/detail/{self.assignment.pk}").status_code, 403)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.title, "HW")
        self.as_user(self.owner)
        self.assertEqual(self.client.put(f"/api/v1/assignments/detail/{self.assignment.pk}", {"title": "HW 2", "max_points": 60}, format="json").status_code, 200)

    def test_assignment_lists_are_limited_to_course_members(self):
        url = f"/api/v1/assignments/{self.course.pk}"
        self.as_user(self.alice)
        self.assertEqual(self.client.get(url).status_code, 200)
        for user in (self.outsider, self.rival):
            self.as_user(user)
            self.assertEqual(self.client.get(url).status_code, 403)

    def test_invalid_points_are_a_400_not_a_crash(self):
        self.as_user(self.owner)
        url = f"/api/v1/assignments/{self.course.pk}"
        self.assertEqual(self.client.post(url, {"title": "X", "max_points": "abc"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"title": "X", "max_points": -5}, format="json").status_code, 400)

    def test_students_submit_as_themselves_and_only_enrolled_students_can(self):
        url = f"/api/v1/submissions/{self.assignment.pk}"
        self.as_user(self.alice)
        response = self.client.post(url, {"student_name": "Bob Baker"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["student_name"], "Alice Able")
        for user in (self.outsider, self.owner, self.rival):
            self.as_user(user)
            self.assertEqual(self.client.post(url, {"student_name": "x"}).status_code, 403, user.email)

    def test_students_only_see_their_own_submissions_and_cannot_touch_classmates_work(self):
        mine = Submission.objects.create(assignment=self.assignment, student_name="Alice Able")
        theirs = Submission.objects.create(assignment=self.assignment, student_name="Bob Baker")
        url = f"/api/v1/submissions/{self.assignment.pk}"
        self.as_user(self.alice)
        self.assertEqual([s["id"] for s in self.client.get(url).json()], [mine.pk])
        self.assertEqual(self.client.delete(f"/api/v1/submissions/detail/{theirs.pk}").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/submissions/assignment/{self.assignment.pk}/student/Bob%20Baker").status_code, 403)
        self.assertTrue(Submission.objects.filter(pk=theirs.pk).exists())
        self.assertEqual(self.client.delete(f"/api/v1/submissions/assignment/{self.assignment.pk}/student/Alice%20Able").status_code, 204)
        self.as_user(self.owner)
        self.assertEqual([s["id"] for s in self.client.get(url).json()], [theirs.pk])
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.as_user(self.rival)
        self.assertEqual(self.client.get(url).status_code, 403)

    def test_only_the_teacher_can_grade_and_grades_are_validated(self):
        sub = Submission.objects.create(assignment=self.assignment, student_name="Alice Able")
        url = f"/api/v1/submissions/grade/{sub.pk}"
        for user in (self.alice, self.rival):
            self.as_user(user)
            self.assertEqual(self.client.put(url, {"grade": 50}).status_code, 403, user.email)
        self.as_user(self.owner)
        for bad in ("abc", -1, 51, "nan", "inf"):
            self.assertEqual(self.client.put(url, {"grade": bad}).status_code, 400, bad)
        sub.refresh_from_db()
        self.assertIsNone(sub.grade)
        ok = self.client.put(url, {"grade": 42.5})
        self.assertEqual((ok.status_code, ok.json()["grade"]), (200, 42.5))


class LessonOwnershipTests(OwnershipBase):
    def setUp(self):
        super().setUp()
        self.draft = Lesson.objects.create(course=self.course, title="Draft", topic="T", created_by=self.owner.pk)
        self.posted = Lesson.objects.create(course=self.course, title="Posted", topic="T", created_by=self.owner.pk, posted_at="2026-01-01T00:00:00Z")

    def test_students_cannot_create_edit_delete_or_post(self):
        self.as_user(self.alice)
        self.assertEqual(self.client.post("/api/v1/lessons/", {"course_id": self.course.pk, "topic": "T"}, format="json").status_code, 403)
        self.assertEqual(self.client.put(f"/api/v1/lessons/{self.posted.pk}", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/lessons/{self.posted.pk}").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/lessons/{self.draft.pk}/post").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/lessons/generate", {"topic": "x"}, format="json").status_code, 403)

    def test_other_teachers_cannot_touch_the_lesson(self):
        self.as_user(self.rival)
        self.assertEqual(self.client.put(f"/api/v1/lessons/{self.draft.pk}", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/lessons/{self.draft.pk}/post").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/lessons/", {"course_id": self.course.pk, "topic": "T"}, format="json").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.draft.pk}").status_code, 403)

    def test_creation_needs_a_course_and_the_author_is_the_caller(self):
        self.as_user(self.owner)
        self.assertEqual(self.client.post("/api/v1/lessons/", {"topic": "T"}, format="json").status_code, 400)
        response = self.client.post("/api/v1/lessons/", {"course_id": self.course.pk, "topic": "T", "created_by": 999}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Lesson.objects.get(pk=response.json()["id"]).created_by, self.owner.pk)

    def test_students_only_ever_see_posted_lessons_of_their_courses(self):
        self.as_user(self.alice)
        titles = [l["title"] for l in self.client.get("/api/v1/lessons/").json()]
        self.assertEqual(titles, ["Posted"])
        self.assertEqual(self.client.get("/api/v1/lessons/?status=draft").json(), [{**l} for l in self.client.get("/api/v1/lessons/").json()])
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.draft.pk}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.posted.pk}").status_code, 200)
        self.as_user(self.outsider)
        self.assertEqual(self.client.get("/api/v1/lessons/").json(), [])
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.posted.pk}").status_code, 403)

    def test_teachers_see_their_own_lessons_only_and_posting_twice_does_not_duplicate(self):
        self.as_user(self.owner)
        self.assertEqual(len(self.client.get("/api/v1/lessons/").json()), 2)
        self.as_user(self.rival)
        self.assertEqual(self.client.get("/api/v1/lessons/").json(), [])
        self.as_user(self.owner)
        before = Announcement.objects.count()
        self.client.post(f"/api/v1/lessons/{self.draft.pk}/post")
        self.client.post(f"/api/v1/lessons/{self.draft.pk}/post")
        self.assertEqual(Announcement.objects.count(), before + 1)


class AppointmentOwnershipTests(OwnershipBase):
    def setUp(self):
        super().setUp()
        self.appointment = Appointment.objects.create(
            student_name="Alice Able", student_email="alice@x.com", teacher_name="Olga Owner", status="pending", agenda="Help",
        )

    def test_only_the_appointments_teacher_can_change_its_status(self):
        url = f"/api/v1/appointments/{self.appointment.pk}/status"
        for user in (self.alice, self.bob, self.rival):
            self.as_user(user)
            self.assertEqual(self.client.patch(url, {"status": "approved"}, format="json").status_code, 403, user.email)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, "pending")
        self.as_user(self.owner)
        self.assertEqual(self.client.patch(url, {"status": "bogus"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"status": "approved"}, format="json").status_code, 200)

    def test_listings_are_private(self):
        self.as_user(self.alice)
        self.assertEqual(len(self.client.get("/api/v1/appointments/").json()), 1)
        self.as_user(self.bob)
        self.assertEqual(self.client.get("/api/v1/appointments/").json(), [])
        self.as_user(self.rival)
        self.assertEqual(self.client.get("/api/v1/appointments/").json(), [])
        self.assertEqual(self.client.get("/api/v1/appointments/teacher/Olga%20Owner").status_code, 403)
        self.as_user(self.bob)
        self.assertEqual(self.client.get("/api/v1/appointments/student/Alice%20Able").status_code, 403)
        self.as_user(self.alice)
        self.assertEqual(len(self.client.get("/api/v1/appointments/student/Alice%20Able").json()), 1)
        self.as_user(self.owner)
        self.assertEqual(len(self.client.get("/api/v1/appointments/teacher/Olga%20Owner").json()), 1)

    def test_booking_uses_the_callers_identity_and_a_full_teacher_name(self):
        self.as_user(self.bob)
        response = self.client.post("/api/v1/appointments/", {
            "student_name": "Alice Able", "student_email": "alice@x.com", "teacher_name": "Olga Owner", "agenda": "x", "time_slot": "t",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        booked = Appointment.objects.get(pk=response.json()["id"])
        self.assertEqual((booked.student_email, booked.student_name), ("bob@x.com", "Bob Baker"))
        self.assertEqual(self.client.post("/api/v1/appointments/", {"teacher_name": "Olga"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/appointments/", {}, format="json").status_code, 400)
        self.as_user(self.owner)
        self.assertEqual(self.client.post("/api/v1/appointments/", {"teacher_name": "Rita Rival"}, format="json").status_code, 403)


class CourseListScopeTests(OwnershipBase):
    def test_each_role_only_sees_its_own_courses_and_students_never_get_the_join_code(self):
        def ids(user):
            self.as_user(user)
            return {c["id"] for c in self.client.get("/api/v1/courses/").json()}

        self.assertEqual(ids(self.owner), {self.course.pk})
        self.assertEqual(ids(self.rival), {self.other_course.pk})
        self.assertEqual(ids(self.alice), {self.course.pk})
        self.assertEqual(ids(self.outsider), set())
        self.assertEqual(ids(self.master), {self.course.pk, self.other_course.pk})
        self.as_user(self.owner)
        self.assertTrue(self.client.get("/api/v1/courses/").json()[0]["enrollment_code"])
        self.as_user(self.alice)
        self.assertIsNone(self.client.get("/api/v1/courses/").json()[0]["enrollment_code"])
        self.assertIsNone(self.client.get(f"/api/v1/courses/{self.course.pk}").json()["enrollment_code"])
