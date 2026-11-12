from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase


class ThrottleProxyTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_rotating_a_forged_forwarded_for_does_not_dodge_the_login_limit(self):
        # The edge proxy appends the real address last; whatever the caller put in front is theirs to forge.
        from django.conf import settings
        self.assertEqual(settings.REST_FRAMEWORK["NUM_PROXIES"], 1)
        codes = []
        for i in range(15):
            res = self.client.post(
                reverse("password-login"), {"username": "nobody@example.com", "password": "x"},
                format="json", HTTP_X_FORWARDED_FOR=f"10.9.8.{i}, 203.0.113.7", REMOTE_ADDR="172.18.0.2",
            )
            codes.append(res.status_code)
        self.assertIn(429, codes)
