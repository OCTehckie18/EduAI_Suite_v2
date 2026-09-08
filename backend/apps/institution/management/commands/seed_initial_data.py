from pathlib import Path

from django.core import serializers
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.institution.models import Campus


class Command(BaseCommand):
    help = "Load the bundled Christ University hierarchy once for local development."

    def handle(self, *args, **options):
        if Campus.all_objects.exists():
            self.stdout.write(self.style.NOTICE("Institution seed data already exists."))
            return

        fixture = Path(__file__).resolve().parents[4] / "fixtures" / "christ_university_initial_data.json"
        if not fixture.exists():
            self.stdout.write(self.style.WARNING(f"Seed fixture not found: {fixture}"))
            return

        with fixture.open(encoding="utf-8") as stream:
            for obj in serializers.deserialize("json", stream):
                timestamp = timezone.now()
                if hasattr(obj.object, "created_at"):
                    obj.object.created_at = timestamp
                if hasattr(obj.object, "updated_at"):
                    obj.object.updated_at = timestamp
                obj.save()
        self.stdout.write(self.style.SUCCESS("Loaded Christ University institution seed data."))
