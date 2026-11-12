from unittest.mock import patch

from django.core.cache import caches
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from . import cache, modules, rules, terms
from .models import UniversityProfile

LOCMEM = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "settings": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "test-university-settings"},
}


@override_settings(CACHES=LOCMEM)
class SettingsCacheTests(TestCase):
    def setUp(self):
        caches["settings"].clear()
        UniversityProfile.load()

    def tearDown(self):
        caches["settings"].clear()

    def test_settings_are_read_once_then_served_from_the_cache(self):
        with self.assertNumQueries(1):
            rules.current()
        with self.assertNumQueries(0):
            rules.current()
            terms.current()
            modules.switched_off()

    def test_saving_the_profile_shows_the_change_at_once(self):
        self.assertEqual(modules.switched_off(), set())
        profile = UniversityProfile.load()
        profile.modules = {"trello": False}
        profile.save(update_fields=["modules", "updated_at"])
        self.assertIn("trello", modules.switched_off())

    def test_a_change_straight_in_the_database_shows_after_the_cache_is_dropped(self):
        terms.current()
        UniversityProfile.objects.filter(pk=1).update(terms={"school": {"singular": "Faculty", "plural": "Faculties"}})
        self.assertEqual(terms.get("school"), "School")  # still the cached words
        cache.forget()
        self.assertEqual(terms.get("school"), "Faculty")

    def test_a_cache_outage_falls_back_to_the_database(self):
        UniversityProfile.objects.filter(pk=1).update(rules={"exam": {"auto_submit_on_violation": False}})
        with patch.object(cache, "_store", side_effect=RuntimeError("redis down")):
            self.assertIsInstance(rules.current(), dict)
            self.assertEqual(cache.stored("terms"), {})
            cache.forget()  # must not raise either

    def test_logos_are_never_cached(self):
        profile = UniversityProfile.load()
        profile.logo_data = b"x" * 1000
        profile.save()
        self.assertNotIn("logo_data", cache.snapshot())
        self.assertNotIn("logo_data", repr(caches["settings"].get(cache.KEY)))


@override_settings(CACHES=LOCMEM)
class RequestCostTests(TestCase):
    """A plain request used to read the university profile every time (the time zone middleware)."""

    def test_a_request_costs_no_settings_query_once_cached(self):
        caches["settings"].clear()
        UniversityProfile.load()
        self.client.get("/api/v1/health/")
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.client.get("/api/v1/health/").status_code, 200)
        # only the health check's own database ping remains; the profile is no longer read
        self.assertEqual([q["sql"] for q in queries.captured_queries], ["SELECT 1"])
        caches["settings"].clear()
