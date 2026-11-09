from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Campus, DemoRequest

URL = "/api/demo-requests/"


def payload(**overrides):
    data = {
        "name": "Priya Nair",
        "role": "Registrar",
        "institution": "Sample College of Engineering",
        "city": "Pune",
        "approx_students": 4200,
        "work_email": "Priya@SampleCollege.edu",
        "phone": "+91 98765 43210",
        "message": "We would like to see the exam features.",
        "consent": True,
    }
    data.update(overrides)
    return data


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    SALES_EMAIL="sales@test.example",
    DEFAULT_FROM_EMAIL="EduAI Suite <no-reply@test.example>",
    DEMO_REQUEST_RATE="100/hour",
)
class DemoRequestCreateTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_saves_the_request_and_emails_sales(self):
        response = self.client.post(URL, payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        demo = DemoRequest.objects.get()
        self.assertEqual(response.json(), {"ok": True, "id": demo.pk})
        self.assertEqual(demo.status, DemoRequest.Status.NEW)
        self.assertEqual(demo.work_email, "priya@samplecollege.edu")
        self.assertTrue(demo.consent)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["sales@test.example"])
        self.assertEqual(email.from_email, "EduAI Suite <no-reply@test.example>")
        self.assertIn("Sample College of Engineering", email.subject)
        self.assertIn("Registrar", email.body)
        self.assertIn("4200", email.body)

    def test_optional_fields_can_be_left_out(self):
        data = payload()
        for key in ("city", "approx_students", "phone", "message"):
            data.pop(key)
        response = self.client.post(URL, data, format="json")
        self.assertEqual(response.status_code, 201, response.content)

    def test_consent_is_required(self):
        for value in (False, None):
            data = payload(consent=value) if value is not None else {k: v for k, v in payload().items() if k != "consent"}
            response = self.client.post(URL, data, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("consent", response.json())
        self.assertFalse(DemoRequest.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_validation_errors(self):
        cases = {
            "work_email": payload(work_email="not-an-email"),
            "name": payload(name=" "),
            "institution": payload(institution=""),
            "role": payload(role=""),
            "phone": payload(phone="call me maybe"),
            "approx_students": payload(approx_students=0),
        }
        for field, data in cases.items():
            with self.subTest(field=field):
                response = self.client.post(URL, data, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
        self.assertFalse(DemoRequest.objects.exists())

    def test_staff_fields_cannot_be_set_from_the_form(self):
        self.client.post(URL, payload(status="won", notes="vip"), format="json")
        demo = DemoRequest.objects.get()
        self.assertEqual(demo.status, "new")
        self.assertEqual(demo.notes, "")

    def test_honeypot_is_accepted_silently_but_not_saved(self):
        response = self.client.post(URL, payload(website="http://spam.example"), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(DemoRequest.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_email_failure_still_keeps_the_request(self):
        with mock.patch("sales.views.send_mail", side_effect=OSError("smtp down")):
            with self.assertLogs("sales", level="ERROR"):
                response = self.client.post(URL, payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(DemoRequest.objects.count(), 1)

    @override_settings(DEMO_REQUEST_RATE="2/hour")
    def test_throttled_after_the_limit(self):
        codes = [self.client.post(URL, payload(), format="json").status_code for _ in range(3)]
        self.assertEqual(codes, [201, 201, 429])
        self.assertEqual(DemoRequest.objects.count(), 2)

    def test_only_post_is_allowed(self):
        self.assertEqual(self.client.get(URL).status_code, 405)

    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5180"])
    def test_cors_allows_the_product_site(self):
        response = self.client.options(URL, HTTP_ORIGIN="http://localhost:5180", HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5180")


class StaffEndpointTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user("sales", "sales@test.example", "pw-12345-x", is_staff=True)
        self.someone = User.objects.create_user("someone", "x@test.example", "pw-12345-x")
        self.demo = DemoRequest.objects.create(name="A", role="Dean", institution="One College", work_email="a@one.edu", consent=True)
        DemoRequest.objects.create(name="B", role="IT", institution="Two College", work_email="b@two.edu", consent=True, status="won")
        self.client = APIClient()

    def test_anonymous_and_non_staff_are_refused(self):
        for url in ("/api/staff/demo-requests/", "/api/staff/campuses/"):
            self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(self.someone)
        for url in ("/api/staff/demo-requests/", "/api/staff/campuses/"):
            self.assertEqual(self.client.get(url).status_code, 403)

    def test_staff_lists_and_filters_demo_requests(self):
        self.client.force_authenticate(self.staff)
        body = self.client.get("/api/staff/demo-requests/").json()
        self.assertEqual(body["count"], 2)
        body = self.client.get("/api/staff/demo-requests/?status=won").json()
        self.assertEqual([row["institution"] for row in body["results"]], ["Two College"])

    def test_staff_updates_only_status_and_notes(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/demo-requests/{self.demo.pk}/",
            {"status": "demo_booked", "notes": "Call on Monday", "institution": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.demo.refresh_from_db()
        self.assertEqual(self.demo.status, "demo_booked")
        self.assertEqual(self.demo.notes, "Call on Monday")
        self.assertEqual(self.demo.institution, "One College")

    def test_staff_rejects_unknown_status(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(f"/api/staff/demo-requests/{self.demo.pk}/", {"status": "maybe"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_staff_campus_create_and_read(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/staff/campuses/",
            {"slug": "one-college", "college_name": "One College", "plan": "pilot", "seat_limit": 3000, "status": "trial", "demo_request": self.demo.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Campus.objects.get().demo_request, self.demo)
        self.assertEqual(self.client.get("/api/staff/campuses/one-college/").json()["seat_limit"], 3000)


class HealthTests(TestCase):
    def test_health(self):
        self.assertEqual(APIClient().get("/api/health/").json(), {"status": "ok"})
