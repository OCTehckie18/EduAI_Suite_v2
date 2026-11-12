from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import User

from . import signals
from .models import GoogleCalendarLink


class SignalCostTests(TestCase):
    def setUp(self):
        cache.delete(signals.ANY_LINKS_KEY)

    def tearDown(self):
        cache.delete(signals.ANY_LINKS_KEY)

    def test_nobody_connected_costs_one_query_then_none(self):
        with CaptureQueriesContext(connection) as first:
            signals.queue_sync({1, 2, 3})
        with CaptureQueriesContext(connection) as second:
            signals.queue_sync({1, 2, 3})
        self.assertEqual((len(first), len(second)), (1, 0))

    def test_connecting_google_calendar_is_noticed_at_once(self):
        signals.queue_sync({1})  # remembers "nobody connected"
        user = User.objects.create_user(email="a@x.com", password="x", role="TEACHER")
        GoogleCalendarLink.objects.create(user=user, refresh_token="x")
        self.assertTrue(signals._anyone_connected(GoogleCalendarLink.objects.all()))
