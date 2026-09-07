from django.test import TestCase
from django.db import models
from apps.core.models import SoftDeleteModel

class TestDummyModel(SoftDeleteModel):
    name = models.CharField(max_length=100)

    class Meta:
        app_label = 'core'

class SoftDeleteModelTestCase(TestCase):
    def setUp(self):
        # Create dummy table manually if needed or run with managed model
        pass

    def test_soft_delete_attributes(self):
        """Verify SoftDeleteModel has is_active, deleted_at, and timestamps."""
        fields = [f.name for f in SoftDeleteModel._meta.fields]
        self.assertIn('is_active', fields)
        self.assertIn('deleted_at', fields)
        self.assertIn('created_at', fields)
        self.assertIn('updated_at', fields)

    def test_health_check_endpoint(self):
        """Verify GET /api/v1/health/ returns 200 OK."""
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'healthy')
