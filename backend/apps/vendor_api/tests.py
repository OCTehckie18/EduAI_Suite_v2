import json
import time
import uuid

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import VendorActionLog
from .signing import sign

SECRET = "test-channel-secret"
LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
          "settings": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
User = get_user_model()


@override_settings(VENDOR_CHANNEL_SECRET=SECRET, CACHES=LOCMEM)
class ChannelTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(email="a@uni.edu", password="Pass-12345", role="MASTER_ADMIN", is_staff=True)
        self.teacher = User.objects.create_user(email="t@uni.edu", password="Pass-12345", role="TEACHER")

    def call(self, method, path, data=None, secret=SECRET, timestamp=None):
        body = json.dumps(data).encode() if data is not None else b""
        ts = str(timestamp or int(time.time()))
        nonce = uuid.uuid4().hex
        headers = {"HTTP_X_VENDOR_TIMESTAMP": ts, "HTTP_X_VENDOR_NONCE": nonce, "HTTP_X_VENDOR_SIGNATURE": sign(secret, method, path, body, ts, nonce)}
        return getattr(self.client, method.lower())(path, data=body, content_type="application/json", **headers)

    def test_a_signed_request_is_answered_and_a_wrong_key_is_refused(self):
        self.assertEqual(self.call("GET", "/api/v1/vendor/admins/").status_code, 200)
        self.assertEqual(self.call("GET", "/api/v1/vendor/admins/", secret="other").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/vendor/admins/").status_code, 403)

    def test_a_stale_or_replayed_request_is_refused(self):
        self.assertEqual(self.call("GET", "/api/v1/vendor/summary/", timestamp=int(time.time()) - 3600).status_code, 403)
        ts = str(int(time.time()))
        nonce = uuid.uuid4().hex
        headers = {"HTTP_X_VENDOR_TIMESTAMP": ts, "HTTP_X_VENDOR_NONCE": nonce, "HTTP_X_VENDOR_SIGNATURE": sign(SECRET, "GET", "/api/v1/vendor/summary/", b"", ts, nonce)}
        self.assertEqual(self.client.get("/api/v1/vendor/summary/", **headers).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/vendor/summary/", **headers).status_code, 403)

    def test_a_body_changed_in_flight_is_refused(self):
        ts = str(int(time.time()))
        nonce = uuid.uuid4().hex
        signature = sign(SECRET, "POST", "/api/v1/vendor/admins/", b'{"email": "x@uni.edu"}', ts, nonce)
        res = self.client.post("/api/v1/vendor/admins/", data=b'{"email": "evil@uni.edu"}', content_type="application/json",
                               HTTP_X_VENDOR_TIMESTAMP=ts, HTTP_X_VENDOR_NONCE=nonce, HTTP_X_VENDOR_SIGNATURE=signature)
        self.assertEqual(res.status_code, 403)
        self.assertFalse(User.all_objects.filter(email="evil@uni.edu").exists())

    def test_two_identical_requests_in_the_same_second_both_work(self):
        # A fresh nonce each time, so a page that fires the same GET twice is not mistaken for a replay.
        self.assertEqual(self.call("GET", "/api/v1/vendor/admins/").status_code, 200)
        self.assertEqual(self.call("GET", "/api/v1/vendor/admins/").status_code, 200)

    @override_settings(VENDOR_CHANNEL_SECRET="")
    def test_with_no_secret_the_channel_does_not_exist(self):
        self.assertEqual(self.call("GET", "/api/v1/vendor/admins/").status_code, 404)

    def test_it_lists_only_master_admins(self):
        rows = self.call("GET", "/api/v1/vendor/admins/").json()
        self.assertEqual([r["email"] for r in rows], ["a@uni.edu"])
        summary = self.call("GET", "/api/v1/vendor/summary/").json()
        self.assertEqual((summary["admins"], summary["teachers"], summary["students"]), (1, 1, 0))

    def test_invite_creates_a_master_admin_whose_link_sets_a_password_once(self):
        res = self.call("POST", "/api/v1/vendor/admins/", {"email": "New@Uni.edu", "first_name": "Nia"})
        self.assertEqual(res.status_code, 201, res.content)
        link = res.json()["set_password_link"]  # no mail server in tests
        token = link.split("token=")[1]
        user = User.objects.get(email="new@uni.edu")
        self.assertEqual((user.role, user.has_usable_password()), ("MASTER_ADMIN", False))
        api = APIClient()
        self.assertEqual(api.post("/api/v1/vendor/set-password/", {"token": token, "password": "short"}, format="json").status_code, 400)
        self.assertEqual(api.post("/api/v1/vendor/set-password/", {"token": token, "password": "Brand-new-1"}, format="json").status_code, 200)
        self.assertEqual(api.post("/api/v1/auth/login/", {"username": "new@uni.edu", "password": "Brand-new-1"}, format="json").status_code, 200)
        self.assertEqual(api.post("/api/v1/vendor/set-password/", {"token": token, "password": "Another-one-2"}, format="json").status_code, 400)
        self.assertEqual(self.call("POST", "/api/v1/vendor/admins/", {"email": "new@uni.edu"}).status_code, 409)

    def test_a_forged_set_password_token_is_refused(self):
        res = APIClient().post("/api/v1/vendor/set-password/", {"token": "nonsense", "password": "Brand-new-1"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_disable_blocks_sign_in_and_kills_existing_tokens(self):
        second = User.objects.create_user(email="b@uni.edu", password="Pass-12345", role="MASTER_ADMIN", is_staff=True)
        api = APIClient()
        tokens = api.post("/api/v1/auth/login/", {"username": "b@uni.edu", "password": "Pass-12345"}, format="json").json()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(api.get("/api/v1/auth/me/").status_code, 200)
        self.assertEqual(self.call("POST", f"/api/v1/vendor/admins/{second.pk}/disable/").status_code, 200)
        self.assertIn(api.get("/api/v1/auth/me/").status_code, (401, 403))
        anon = APIClient()
        self.assertEqual(anon.post("/api/v1/auth/login/", {"username": "b@uni.edu", "password": "Pass-12345"}, format="json").status_code, 401)
        self.assertEqual(self.call("POST", f"/api/v1/vendor/admins/{second.pk}/enable/").status_code, 200)
        self.assertEqual(anon.post("/api/v1/auth/login/", {"username": "b@uni.edu", "password": "Pass-12345"}, format="json").status_code, 200)

    def test_the_last_active_admin_needs_an_explicit_confirmation(self):
        url = f"/api/v1/vendor/admins/{self.admin.pk}/disable/"
        self.assertEqual(self.call("POST", url).status_code, 409)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())
        self.assertEqual(self.call("POST", url, {"force": True}).status_code, 200)
        self.assertFalse(User.objects.filter(pk=self.admin.pk).exists())

    def test_a_reset_link_works_and_other_roles_cannot_be_targeted(self):
        res = self.call("POST", f"/api/v1/vendor/admins/{self.admin.pk}/reset-link/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("token=", res.json()["set_password_link"])
        self.assertEqual(self.call("POST", f"/api/v1/vendor/admins/{self.teacher.pk}/disable/").status_code, 404)
        self.assertTrue(User.objects.filter(pk=self.teacher.pk).exists())

    def test_every_action_is_recorded_and_the_university_admin_can_read_it(self):
        self.call("POST", "/api/v1/vendor/admins/", {"email": "n@uni.edu"})
        self.call("POST", f"/api/v1/vendor/admins/{self.admin.pk}/disable/")  # refused: shown as refused
        self.assertEqual(list(VendorActionLog.objects.order_by("id").values_list("action", "result")), [("invite", "ok"), ("disable", "ok")])
        api = APIClient()
        api.force_authenticate(self.teacher)
        self.assertEqual(api.get("/api/v1/vendor/actions/").status_code, 403)
        api.force_authenticate(User.objects.get(email="n@uni.edu"))
        self.assertEqual(len(api.get("/api/v1/vendor/actions/").json()), 2)


class DisableCommandTests(TestCase):
    def setUp(self):
        self.a = User.objects.create_user(email="a@uni.edu", password="x", role="MASTER_ADMIN", emp_no="E1")
        self.b = User.objects.create_user(email="b@uni.edu", password="x", role="MASTER_ADMIN")
        self.t = User.objects.create_user(email="t@uni.edu", password="x", role="TEACHER")

    def run_command(self, *args):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command("disable_master_admins", *args, stdout=out)
        return out.getvalue()

    def test_without_yes_it_only_lists(self):
        self.assertIn("would be disabled", self.run_command("--all"))
        self.assertEqual(User.objects.filter(role="MASTER_ADMIN").count(), 2)

    def test_it_disables_by_employee_number_and_keeps_the_account(self):
        self.run_command("--identifier", "e1", "--yes")
        self.assertFalse(User.objects.filter(pk=self.a.pk).exists())
        self.assertTrue(User.all_objects.filter(pk=self.a.pk, is_active=False).exists())
        self.assertTrue(User.objects.filter(pk=self.b.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.t.pk).exists())  # other roles are never touched
        self.assertEqual(VendorActionLog.objects.count(), 1)
