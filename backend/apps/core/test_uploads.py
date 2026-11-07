import shutil
from pathlib import Path

from django.conf import settings
from django.test import TestCase


class UploadServingTests(TestCase):
    def test_a_stored_path_opens_under_both_prefixes_and_can_be_framed(self):
        folder = Path(settings.UPLOADS_ROOT) / "_test_serving"
        folder.mkdir(parents=True, exist_ok=True)
        try:
            (folder / "abc_work.pdf").write_bytes(b"%PDF-1.4 test")
            for prefix in ("/uploads", "/api/v1/uploads"):
                res = self.client.get(f"{prefix}/_test_serving/abc_work.pdf")
                self.assertEqual(res.status_code, 200, prefix)
                self.assertEqual(res["Content-Type"], "application/pdf")
                self.assertEqual(res["X-Frame-Options"], "SAMEORIGIN")
            self.assertEqual(self.client.get("/api/v1/uploads/_test_serving/missing.pdf").status_code, 404)
            self.assertIn(self.client.get("/api/v1/uploads/../../manage.py").status_code, (400, 404))
        finally:
            shutil.rmtree(folder, ignore_errors=True)
