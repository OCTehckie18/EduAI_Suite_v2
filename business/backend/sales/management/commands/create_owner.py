from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create (or update the password of) an owner account for the console. Idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--password", required=True)

    def handle(self, *args, username, password, **options):
        if not username.strip():
            raise CommandError("A username is required.")
        # Deliberately bypasses the password-strength validators: the owner chooses their own password.
        user, created = get_user_model().objects.get_or_create(
            username=username, defaults={"is_staff": True, "is_superuser": True},
        )
        user.is_staff = user.is_superuser = True
        user.set_password(password)
        user.save()
        self.stdout.write(f"{'Created' if created else 'Updated'} owner '{username}'.")
