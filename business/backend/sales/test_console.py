from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from . import channel
from .models import AdminAction, Campus

ADMINS = [{"id": 7, "email": "dean@uni.edu", "name": "Dean", "active": True, "last_login": None, "created_at": "2026-01-01T00:00:00Z"}]
SUMMARY = {"version": "1.0", "admins": 1, "teachers": 4, "students": 90, "email_configured": True}


class ConsoleBase(TestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user(username="owner", password="1234", is_staff=True, is_superuser=True)
        self.outsider = get_user_model().objects.create_user(username="intern", password="whatever-12", is_staff=False)
        self.campus = Campus.objects.create(slug="alpha", college_name="Alpha University", api_url="http://alpha.test")
        self.client = APIClient()

    def sign_in(self):
        res = self.client.post("/api/staff/login/", {"username": "owner", "password": "1234"}, format="json")
        self.assertEqual(res.status_code, 200)

    def give_key(self):
        self.client.patch(f"/api/staff/campuses/alpha/", {"channel_secret": "s3cret-key"}, format="json")
        self.campus.refresh_from_db()


class LoginTests(ConsoleBase):
    def test_only_staff_can_sign_in_and_everything_else_needs_it(self):
        self.assertEqual(self.client.get("/api/staff/admins/").status_code, 403)
        bad = self.client.post("/api/staff/login/", {"username": "owner", "password": "nope"}, format="json")
        self.assertEqual(bad.status_code, 401)
        notstaff = self.client.post("/api/staff/login/", {"username": "intern", "password": "whatever-12"}, format="json")
        self.assertEqual(notstaff.status_code, 401)
        self.sign_in()
        self.assertEqual(self.client.get("/api/staff/admins/").status_code, 200)
        self.client.post("/api/staff/logout/")
        self.assertEqual(self.client.get("/api/staff/admins/").status_code, 403)

    def test_repeated_wrong_passwords_are_throttled(self):
        codes = [self.client.post("/api/staff/login/", {"username": "owner", "password": f"x{i}"}, format="json").status_code for i in range(8)]
        self.assertIn(429, codes)
        self.assertEqual(self.client.post("/api/staff/login/", {"username": "owner", "password": "1234"}, format="json").status_code, 429)

    def test_create_owner_command_is_idempotent(self):
        from django.core.management import call_command

        call_command("create_owner", username="omkaar", password="1234")
        call_command("create_owner", username="omkaar", password="1234")
        users = get_user_model().objects.filter(username="omkaar")
        self.assertEqual(users.count(), 1)
        self.assertTrue(users[0].check_password("1234") and users[0].is_staff)


class SecretTests(ConsoleBase):
    def test_the_key_is_stored_encrypted_and_never_returned(self):
        self.sign_in()
        res = self.client.patch("/api/staff/campuses/alpha/", {"channel_secret": "s3cret-key"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("s3cret-key", res.content.decode())
        self.assertNotIn("channel_secret", res.json())
        self.assertTrue(res.json()["has_channel"])
        self.campus.refresh_from_db()
        self.assertNotIn("s3cret-key", self.campus.channel_secret_enc)
        self.assertEqual(channel.decrypt_secret(self.campus.channel_secret_enc), "s3cret-key")
        listing = self.client.get("/api/staff/campuses/").content.decode()
        self.assertNotIn("s3cret-key", listing)
        self.assertNotIn(self.campus.channel_secret_enc, listing)


class AdminActionTests(ConsoleBase):
    def setUp(self):
        super().setUp()
        self.sign_in()
        self.give_key()

    @mock.patch("sales.channel.call")
    def test_listing_is_live_and_remembered(self, call):
        call.side_effect = lambda campus, method, path, data=None: ADMINS if path == "admins/" else SUMMARY
        body = self.client.get("/api/staff/campuses/alpha/admins/").json()
        self.assertEqual((body["stale"], body["admins"][0]["email"]), (False, "dean@uni.edu"))
        self.campus.refresh_from_db()
        self.assertEqual((self.campus.admins_snapshot, self.campus.summary_snapshot["students"]), (ADMINS, 90))
        everyone = self.client.get("/api/staff/admins/").json()["admins"]
        self.assertEqual([(a["campus_slug"], a["email"]) for a in everyone], [("alpha", "dean@uni.edu")])

    @mock.patch("sales.channel.call")
    def test_an_unreachable_college_shows_the_last_list_marked_stale(self, call):
        self.campus.admins_snapshot = ADMINS
        self.campus.save()
        call.side_effect = channel.ChannelError("Could not reach the college (ConnectionError).")
        body = self.client.get("/api/staff/campuses/alpha/admins/").json()
        self.assertTrue(body["stale"])
        self.assertIn("Could not reach", body["error"])
        self.assertEqual(body["admins"], ADMINS)

    @mock.patch("sales.channel.call")
    def test_actions_are_forwarded_and_logged_with_who_did_them(self, call):
        self.campus.admins_snapshot = ADMINS
        self.campus.save()
        call.return_value = {"ok": True}
        self.assertEqual(self.client.post("/api/staff/campuses/alpha/admins/7/disable/", {}, format="json").status_code, 200)
        self.assertEqual(self.client.post("/api/staff/campuses/alpha/admins/7/bogus/", {}, format="json").status_code, 404)
        sent = [c.args[1:3] for c in call.call_args_list if c.args[2].startswith("admins/7")]
        self.assertEqual(sent, [("POST", "admins/7/disable/")])
        row = AdminAction.objects.get()
        self.assertEqual((row.staff_username, row.action, row.target_email, row.result), ("owner", "disable", "dean@uni.edu", "ok"))
        log = self.client.get("/api/staff/actions/").json()
        self.assertEqual(log[0]["college_name"], "Alpha University")

    @mock.patch("sales.channel.call")
    def test_the_last_admin_guard_is_passed_through_as_a_refusal(self, call):
        call.side_effect = channel.ChannelError("This is the last active Master Admin. Confirm to disable it anyway.", 409)
        res = self.client.post("/api/staff/campuses/alpha/admins/7/disable/", {}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(AdminAction.objects.get().result, "refused")
        call.side_effect = None
        call.return_value = {"ok": True}
        self.client.post("/api/staff/campuses/alpha/admins/7/disable/", {"force": True}, format="json")
        posts = [c for c in call.call_args_list if c.args[1] == "POST"]
        self.assertEqual(posts[-1].args[3], {"force": True})

    @mock.patch("sales.channel.call")
    def test_invite_returns_the_link_when_the_college_cannot_email(self, call):
        call.side_effect = lambda campus, method, path, data=None: (
            {"id": 9, "email": "new@uni.edu", "emailed": False, "set_password_link": "http://x/set-password?token=abc"} if method == "POST" else ADMINS if path == "admins/" else SUMMARY)
        res = self.client.post("/api/staff/campuses/alpha/admins/", {"email": "New@Uni.edu"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertIn("token=abc", res.json()["set_password_link"])
        self.assertEqual(AdminAction.objects.get().detail, "link returned to the owner")

    def test_no_key_means_a_clear_message_not_a_crash(self):
        self.campus.channel_secret_enc = ""
        self.campus.save()
        body = self.client.get("/api/staff/campuses/alpha/admins/").json()
        self.assertTrue(body["stale"])
        self.assertIn("no locked channel", body["error"])

    def test_nothing_works_for_a_signed_out_visitor(self):
        anon = APIClient()
        for path in ("/api/staff/campuses/alpha/admins/", "/api/staff/actions/", "/api/staff/campuses/"):
            self.assertEqual(anon.get(path).status_code, 403, path)
        self.assertEqual(anon.post("/api/staff/campuses/alpha/admins/7/disable/", {}, format="json").status_code, 403)


class AddCampusCommandTests(TestCase):
    def run_command(self, *args):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command("add_campus", *args, stdout=out)
        return out.getvalue()

    def test_it_registers_a_college_and_hands_the_key_to_its_env_without_printing_it(self):
        import tempfile, pathlib
        env = pathlib.Path(tempfile.mkdtemp()) / ".env"
        env.write_text("A=1\n", encoding="utf-8")
        out = self.run_command("--slug", "uni", "--name", "Uni", "--api-url", "http://x.test", "--generate-key", "--write-env", str(env))
        key = [l for l in env.read_text().splitlines() if l.startswith("VENDOR_CHANNEL_SECRET=")][0].split("=", 1)[1]
        self.assertNotIn(key, out)
        campus = Campus.objects.get(slug="uni")
        self.assertEqual(channel.decrypt_secret(campus.channel_secret_enc), key)
        self.assertTrue(campus.has_channel)
        self.run_command("--slug", "uni", "--name", "Uni", "--generate-key", "--write-env", str(env))  # idempotent: replaces, never duplicates
        self.assertEqual(env.read_text().count("VENDOR_CHANNEL_SECRET="), 1)
        self.assertEqual(Campus.objects.count(), 1)
