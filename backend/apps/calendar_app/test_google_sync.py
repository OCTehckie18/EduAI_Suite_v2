from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, Enrollment
from apps.exams.models import Exam
from apps.institution.models import Batch, Campus, Department, Program, School

from . import crypto, google_client, sync
from .feed import build_feed
from .google_client import Conflict, GoogleApiError, GoogleAuthError, NotFound
from .models import CalendarEvent, CalendarSyncRequest, GoogleCalendarItem, GoogleCalendarLink

User = get_user_model()
KEY = Fernet.generate_key().decode()
SETTINGS = dict(
    GOOGLE_CLIENT_ID="client-id", GOOGLE_CLIENT_SECRET="client-secret", CALENDAR_TOKEN_KEY=KEY,
    GOOGLE_CALENDAR_REDIRECT_URI="https://api.example.edu/api/v1/calendar/google/callback",
    FRONTEND_URL="https://portal.example.edu", CORS_ALLOWED_ORIGINS=["https://portal.example.edu", "https://teach.example.edu"],
)


class FakeApi:
    """Stands in for Google: remembers calendars and events, and can be told to fail."""

    def __init__(self):
        self.calendars = {}
        self.calls = []
        self.fail_auth = False
        self.fail_api = False
        self.revoked = []
        self.next_calendar = 0

    def _guard(self):
        if self.fail_auth:
            raise GoogleAuthError("invalid_grant")
        if self.fail_api:
            raise GoogleApiError("boom", 500)

    def exchange_code(self, code):
        return {"access_token": "access", "refresh_token": "refresh-secret"} if code != "norefresh" else {"access_token": "access"}

    def access_token(self, refresh_token):
        self._guard()
        return "access"

    def revoke(self, token):
        self.revoked.append(token)

    def create_calendar(self, access, name, tz):
        self.next_calendar += 1
        cid = f"cal-{self.next_calendar}"
        self.calendars[cid] = {"name": name, "events": {}}
        self.calls.append(("create_calendar", name))
        return cid

    def delete_calendar(self, access, cid):
        self.calendars.pop(cid, None)
        self.calls.append(("delete_calendar", cid))

    def insert_event(self, access, cid, body):
        self._guard()
        if cid not in self.calendars:
            raise NotFound("no calendar", 404)
        if body["id"] in self.calendars[cid]["events"]:
            raise Conflict("exists", 409)
        self.calendars[cid]["events"][body["id"]] = body
        self.calls.append(("insert", body["summary"]))
        return body["id"]

    def patch_event(self, access, cid, event_id, body):
        self._guard()
        if cid not in self.calendars or event_id not in self.calendars[cid]["events"]:
            raise NotFound("no event", 404)
        self.calendars[cid]["events"][event_id] = {**body, "id": event_id}
        self.calls.append(("patch", body["summary"]))

    def delete_event(self, access, cid, event_id):
        if cid not in self.calendars or event_id not in self.calendars[cid]["events"]:
            raise NotFound("no event", 404)
        del self.calendars[cid]["events"][event_id]
        self.calls.append(("delete", event_id))

    def titles(self, cid):
        return sorted(e["summary"] for e in self.calendars[cid]["events"].values())


@override_settings(**SETTINGS)
class GoogleBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="Central", code="C", city="B")
        school = School.objects.create(name="Sci", code="S", campus=campus)
        department = Department.objects.create(name="CS", code="CS", school=school)
        program = Program.objects.create(name="BCA", code="BCA", department=department, degree_level="UG", duration_years=3)
        batch = Batch.objects.create(name="2025", program=program, start_year=2025, end_year=2028, academic_year="2025-26")
        self.teacher = User.objects.create_user(email="t@x.com", password="x", role="TEACHER", first_name="Tina", last_name="T")
        self.other_teacher = User.objects.create_user(email="t2@x.com", password="x", role="TEACHER")
        self.student = User.objects.create_user(email="s@x.com", password="x", role="STUDENT")
        self.outsider = User.objects.create_user(email="o@x.com", password="x", role="STUDENT")
        self.course = Classroom.objects.create(name="Maths", subject_code="M1", teacher=self.teacher, department=department, program=program, batch=batch)
        self.other_course = Classroom.objects.create(name="Physics", subject_code="P1", teacher=self.other_teacher, department=department, program=program, batch=batch)
        Enrollment.objects.create(classroom=self.course, student=self.student)
        Enrollment.objects.create(classroom=self.other_course, student=self.outsider)
        self.api = FakeApi()

    def connect(self, user, calendar=True):
        link = GoogleCalendarLink.objects.create(user=user, refresh_token=crypto.encrypt("refresh-secret"))
        if calendar:
            link.calendar_id = self.api.create_calendar("a", "EduAI", "UTC")
            link.save()
        return link

    def event(self, title, days=1, **extra):
        start = timezone.now() + timedelta(days=days)
        return CalendarEvent.objects.create(title=title, start_time=start, end_time=start + timedelta(hours=1), **extra)


class ConnectFlowTests(GoogleBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)

    def test_the_consent_url_asks_for_the_narrow_scope_and_a_refresh_token(self):
        body = self.client.get(reverse("calendar-google-connect"), {"return_to": "https://teach.example.edu/calendar"}).json()
        url = urlparse(body["url"])
        query = parse_qs(url.query)
        self.assertEqual(url.netloc, "accounts.google.com")
        self.assertEqual(query["scope"], ["https://www.googleapis.com/auth/calendar.app.created"])
        self.assertEqual((query["access_type"], query["prompt"], query["client_id"]), (["offline"], ["consent"], ["client-id"]))
        state = google_client.read_state(query["state"][0])
        self.assertEqual((state["u"], state["r"]), (self.teacher.pk, "https://teach.example.edu/calendar"))

    def test_a_return_address_outside_our_portals_is_refused(self):
        response = self.client.get(reverse("calendar-google-connect"), {"return_to": "https://evil.example.com/steal"})
        self.assertEqual(response.status_code, 400)

    def test_without_google_set_up_the_user_is_told_so(self):
        with override_settings(GOOGLE_CLIENT_SECRET=""):
            self.assertEqual(self.client.get(reverse("calendar-google-connect")).status_code, 503)

    def test_connect_needs_a_signed_in_user(self):
        self.assertIn(APIClient().get(reverse("calendar-google-connect")).status_code, (401, 403))

    def callback(self, **params):
        return APIClient().get(reverse("calendar-google-callback"), params)

    def good_state(self, user=None, return_to="https://teach.example.edu/calendar"):
        return google_client.make_state((user or self.teacher).pk, return_to)

    def test_a_tampered_or_expired_state_is_refused(self):
        for state in ("garbage", self.good_state() + "x"):
            response = self.callback(code="c", state=state)
            self.assertEqual(response.status_code, 302)
            self.assertIn("reason=state", response["Location"])
        old = signing.dumps({"u": self.teacher.pk, "r": "https://teach.example.edu/calendar"}, salt=google_client.STATE_SALT)
        with mock.patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 3600):
            self.assertIn("reason=state", self.callback(code="c", state=old)["Location"])
        self.assertFalse(GoogleCalendarLink.objects.exists())

    def test_the_callback_stores_an_encrypted_token_and_creates_the_calendar_once(self):
        with mock.patch.object(google_client, "GoogleApi", return_value=self.api):
            first = self.callback(code="good", state=self.good_state())
            self.callback(code="good", state=self.good_state())  # connecting again must not make a second calendar
        self.assertIn("google=connected", first["Location"])
        self.assertTrue(first["Location"].startswith("https://teach.example.edu/calendar"))
        link = GoogleCalendarLink.objects.get()
        self.assertNotIn("refresh-secret", link.refresh_token)
        self.assertEqual(crypto.decrypt(link.refresh_token), "refresh-secret")
        self.assertEqual(len([c for c in self.api.calls if c[0] == "create_calendar"]), 1)
        self.assertTrue(CalendarSyncRequest.objects.filter(user=self.teacher).exists())

    def test_a_refusal_or_missing_refresh_token_is_reported_and_nothing_is_stored(self):
        with mock.patch.object(google_client, "GoogleApi", return_value=self.api):
            denied = self.callback(error="access_denied", state=self.good_state())
            missing = self.callback(code="norefresh", state=self.good_state())
        self.assertIn("reason=denied", denied["Location"])
        self.assertIn("reason=no_refresh_token", missing["Location"])
        self.assertFalse(GoogleCalendarLink.objects.exists())

    def test_the_status_never_exposes_a_token(self):
        self.connect(self.teacher)
        body = self.client.get(reverse("calendar-google-status")).json()
        self.assertTrue(body["connected"])
        self.assertNotIn("refresh", str(body).lower().replace("needs_reconnect", ""))
        self.assertFalse(self.client.get(reverse("calendar-google-status")).json().get("refresh_token"))

    def test_the_encryption_key_is_required_outside_development(self):
        with override_settings(CALENDAR_TOKEN_KEY="", DEBUG=False):
            with self.assertRaises(Exception):
                crypto.encrypt("x")


class ReconcileTests(GoogleBase):
    def test_new_changed_and_removed_items_are_inserted_patched_and_deleted(self):
        link = self.connect(self.student)
        Enrollment.objects.filter(student=self.student).first()
        first = self.event("Study group", student_email=self.student.email)
        second = self.event("Meeting", student_email=self.student.email, days=2)
        counts = sync.sync_user(link, self.api)
        self.assertEqual(counts, {"inserted": 2, "patched": 0, "deleted": 0, "unchanged": 0})
        self.assertEqual(self.api.titles(link.calendar_id), ["Meeting", "Study group"])
        first.title = "Study group (moved)"
        first.save()
        second.delete()
        counts = sync.sync_user(link, self.api)
        self.assertEqual(counts, {"inserted": 0, "patched": 1, "deleted": 1, "unchanged": 0})
        self.assertEqual(self.api.titles(link.calendar_id), ["Study group (moved)"])

    def test_running_it_twice_changes_nothing(self):
        link = self.connect(self.student)
        self.event("Study group", student_email=self.student.email)
        sync.sync_user(link, self.api)
        before = list(self.api.calls)
        counts = sync.sync_user(link, self.api)
        self.assertEqual(counts, {"inserted": 0, "patched": 0, "deleted": 0, "unchanged": 1})
        self.assertEqual(self.api.calls, before)

    def test_a_retry_after_a_crash_never_creates_a_duplicate(self):
        link = self.connect(self.student)
        self.event("Study group", student_email=self.student.email)
        sync.sync_user(link, self.api)
        GoogleCalendarItem.objects.all().delete()  # we lost track of what was sent (a crash before saving)
        sync.sync_user(link, self.api)
        self.assertEqual(self.api.titles(link.calendar_id), ["Study group"])

    def test_an_event_deleted_in_google_by_hand_comes_back(self):
        link = self.connect(self.student)
        self.event("Study group", student_email=self.student.email)
        sync.sync_user(link, self.api)
        self.api.calendars[link.calendar_id]["events"].clear()
        GoogleCalendarItem.objects.update(content_hash="stale")
        sync.sync_user(link, self.api)
        self.assertEqual(self.api.titles(link.calendar_id), ["Study group"])

    def test_a_calendar_deleted_in_google_is_recreated(self):
        link = self.connect(self.student)
        event = self.event("Study group", student_email=self.student.email)
        sync.sync_user(link, self.api)
        self.api.calendars.clear()
        event.title = "Study group (moved)"  # a change is what makes us notice the calendar is gone
        event.save()
        with self.assertRaises(GoogleApiError):
            sync.sync_user(link, self.api)
        link.refresh_from_db()
        self.assertEqual(link.calendar_id, "")
        sync.sync_user(link, self.api)
        link.refresh_from_db()
        self.assertEqual(self.api.titles(link.calendar_id), ["Study group (moved)"])

    def test_a_user_only_receives_their_own_events(self):
        link = self.connect(self.student)
        self.event("Mine", student_email=self.student.email)
        self.event("Someone else's", student_email=self.outsider.email)
        self.event("Other class", course_id=self.other_course.pk)
        self.event("My class", course_id=self.course.pk)
        sync.sync_user(link, self.api)
        self.assertEqual(self.api.titles(link.calendar_id), ["Mine", "My class"])

    def test_items_outside_the_window_are_not_sent(self):
        link = self.connect(self.student)
        self.event("Far future", student_email=self.student.email, days=500)
        self.event("Long ago", student_email=self.student.email, days=-90)
        self.event("Soon", student_email=self.student.email, days=3)
        sync.sync_user(link, self.api)
        self.assertEqual(self.api.titles(link.calendar_id), ["Soon"])

    def test_all_day_items_use_google_dates_and_timed_ones_get_a_default_length(self):
        link = self.connect(self.student)
        day = (timezone.now() + timedelta(days=4)).replace(hour=0, minute=0, second=0, microsecond=0)
        CalendarEvent.objects.create(title="Holiday", start_time=day, is_all_day=True, student_email=self.student.email)
        CalendarEvent.objects.create(title="Call", start_time=day + timedelta(hours=10), student_email=self.student.email)
        sync.sync_user(link, self.api)
        events = {e["summary"]: e for e in self.api.calendars[link.calendar_id]["events"].values()}
        self.assertIn("date", events["Holiday"]["start"])
        self.assertEqual(events["Holiday"]["end"]["date"], (timezone.localtime(day).date() + timedelta(days=1)).isoformat())
        self.assertIn("dateTime", events["Call"]["start"])

    def test_exams_are_dated_by_their_open_and_close_times(self):
        opens = timezone.now() + timedelta(days=2)
        exam = Exam.objects.create(course=self.course, title="Midterm", status="published", opens_at=opens, closes_at=opens + timedelta(hours=3), time_limit=60)
        item = next(e for e in build_feed(self.student) if e["id"] == f"exam_{exam.pk}")
        self.assertEqual(timezone.localtime(opens).isoformat(), item["start"])
        self.assertEqual(timezone.localtime(opens + timedelta(hours=3)).isoformat(), item["end"])
        only_close = Exam.objects.create(course=self.course, title="Quiz", status="published", closes_at=opens, time_limit=45)
        item = next(e for e in build_feed(self.student) if e["id"] == f"exam_{only_close.pk}")
        self.assertEqual(item["start"], timezone.localtime(opens - timedelta(minutes=45)).isoformat())


class OutboxTests(GoogleBase):
    def run_commit(self, fn):
        with self.captureOnCommitCallbacks(execute=True):
            fn()

    def queued(self):
        return set(CalendarSyncRequest.objects.values_list("user_id", flat=True))

    def test_a_class_change_queues_only_that_classs_connected_people(self):
        for user in (self.teacher, self.student, self.outsider, self.other_teacher):
            self.connect(user, calendar=False)
        self.run_commit(lambda: Exam.objects.create(course=self.course, title="Quiz", status="published"))
        self.assertEqual(self.queued(), {self.teacher.pk, self.student.pk})

    def test_people_who_have_not_connected_are_never_queued(self):
        self.connect(self.teacher, calendar=False)
        self.run_commit(lambda: Exam.objects.create(course=self.course, title="Quiz", status="published"))
        self.assertEqual(self.queued(), {self.teacher.pk})

    def test_an_institution_wide_event_queues_everyone_connected(self):
        for user in (self.student, self.outsider):
            self.connect(user, calendar=False)
        self.run_commit(lambda: CalendarEvent.objects.create(title="Holiday", start_time=timezone.now() + timedelta(days=3)))
        self.assertEqual(self.queued(), {self.student.pk, self.outsider.pk})

    def test_many_changes_queue_one_sync_per_user(self):
        self.connect(self.student, calendar=False)
        for n in range(5):
            self.run_commit(lambda n=n: self.event(f"E{n}", student_email=self.student.email))
        self.assertEqual(CalendarSyncRequest.objects.filter(user=self.student).count(), 1)

    def test_enrolling_and_appointments_queue_the_right_user(self):
        self.connect(self.outsider, calendar=False)
        self.run_commit(lambda: Enrollment.objects.create(classroom=self.course, student=self.outsider))
        self.assertEqual(self.queued(), {self.outsider.pk})

    def test_the_worker_sends_queued_changes_and_clears_the_outbox(self):
        link = self.connect(self.student, calendar=False)
        self.run_commit(lambda: self.event("Study group", student_email=self.student.email))
        result = sync.process_outbox(self.api)
        self.assertEqual(result, {"synced": 1, "failed": 0, "skipped": 0})
        link.refresh_from_db()
        self.assertEqual(self.api.titles(link.calendar_id), ["Study group"])
        self.assertFalse(CalendarSyncRequest.objects.exists())
        self.assertIsNotNone(link.last_synced_at)

    def test_a_revoked_permission_marks_the_link_and_stops_retrying(self):
        link = self.connect(self.student)
        self.run_commit(lambda: self.event("Study group", student_email=self.student.email))
        self.api.fail_auth = True
        result = sync.process_outbox(self.api)
        link.refresh_from_db()
        self.assertEqual((result["failed"], link.status), (1, "revoked"))
        self.assertFalse(CalendarSyncRequest.objects.exists())
        self.run_commit(lambda: self.event("Another", student_email=self.student.email))  # not queued while revoked
        self.assertFalse(CalendarSyncRequest.objects.exists())

    def test_a_google_outage_backs_off_instead_of_failing_the_link(self):
        link = self.connect(self.student)
        self.run_commit(lambda: self.event("Study group", student_email=self.student.email))
        self.api.fail_api = True
        sync.process_outbox(self.api)
        request = CalendarSyncRequest.objects.get()
        link.refresh_from_db()
        self.assertEqual((request.attempts, link.status), (1, "error"))
        self.assertGreater(request.next_attempt_at, timezone.now())
        self.assertEqual(sync.process_outbox(self.api), {"synced": 0, "failed": 0, "skipped": 0})  # not due yet
        self.api.fail_api = False
        request.next_attempt_at = timezone.now() - timedelta(seconds=1)
        request.save()
        self.assertEqual(sync.process_outbox(self.api)["synced"], 1)
        link.refresh_from_db()
        self.assertEqual(link.status, "connected")

    def test_a_deactivated_user_is_disconnected_by_the_worker(self):
        self.connect(self.student)
        CalendarSyncRequest.objects.create(user=self.student)
        self.student.delete()  # soft delete: the account is now inactive
        sync.process_outbox(self.api)
        self.assertFalse(GoogleCalendarLink.objects.filter(user=self.student).exists())

    def test_the_command_runs_one_pass_and_a_full_reconcile(self):
        self.connect(self.student)
        self.event("Study group", student_email=self.student.email)
        with mock.patch.object(sync, "GoogleApi", return_value=self.api):
            call_command("sync_google_calendars", "--all")
        self.assertEqual(len(self.api.calendars), 1)
        self.assertTrue(any(c[0] == "insert" for c in self.api.calls))
        with mock.patch.object(sync, "GoogleApi", return_value=self.api):
            call_command("sync_google_calendars")


class EndpointTests(GoogleBase):
    def test_sync_now_and_disconnect(self):
        link = self.connect(self.student)
        self.event("Study group", student_email=self.student.email)
        client = APIClient()
        client.force_authenticate(self.student)
        with mock.patch.object(sync, "GoogleApi", return_value=self.api):
            done = client.post(reverse("calendar-google-sync-now"))
            self.assertEqual((done.status_code, done.json()["inserted"]), (200, 1))
            gone = client.delete(reverse("calendar-google-disconnect"))
        self.assertEqual((gone.status_code, gone.json()["connected"]), (200, False))
        self.assertFalse(GoogleCalendarLink.objects.exists())
        self.assertFalse(GoogleCalendarItem.objects.exists())
        self.assertEqual(self.api.calendars, {})  # the EduAI calendar was deleted in Google
        self.assertEqual(self.api.revoked, ["refresh-secret"])

    def test_sync_now_without_a_connection_and_after_revocation(self):
        client = APIClient()
        client.force_authenticate(self.student)
        self.assertEqual(client.post(reverse("calendar-google-sync-now")).status_code, 409)
        self.connect(self.student)
        self.api.fail_auth = True
        with mock.patch.object(sync, "GoogleApi", return_value=self.api):
            response = client.post(reverse("calendar-google-sync-now"))
        self.assertEqual(response.status_code, 409)
        self.assertTrue(client.get(reverse("calendar-google-status")).json()["needs_reconnect"])

    def test_disconnect_still_works_when_google_cannot_be_reached(self):
        self.connect(self.student)
        self.api.fail_api = True
        client = APIClient()
        client.force_authenticate(self.student)
        with mock.patch.object(sync, "GoogleApi", return_value=self.api):
            self.assertEqual(client.delete(reverse("calendar-google-disconnect")).status_code, 200)
        self.assertFalse(GoogleCalendarLink.objects.exists())

    def test_one_user_cannot_touch_anothers_connection(self):
        self.connect(self.student)
        client = APIClient()
        client.force_authenticate(self.outsider)
        self.assertEqual(client.post(reverse("calendar-google-sync-now")).status_code, 409)
        client.delete(reverse("calendar-google-disconnect"))
        self.assertTrue(GoogleCalendarLink.objects.filter(user=self.student).exists())
