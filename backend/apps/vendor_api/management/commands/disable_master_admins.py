from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.vendor_api.models import VendorActionLog


class Command(BaseCommand):
    help = (
        "Disable Master Admin accounts on this installation so the owner can assign new ones through the locked channel. "
        "Nothing is deleted: a disabled account can be enabled again from the owner console. Without --yes it only lists."
    )

    def add_arguments(self, parser):
        parser.add_argument("--identifier", action="append", default=[], help="Email, employee number or register number. Repeatable.")
        parser.add_argument("--all", action="store_true", help="Every active Master Admin.")
        parser.add_argument("--yes", action="store_true", help="Actually disable them.")

    def handle(self, *args, identifier, all, yes, **options):
        User = get_user_model()
        admins = User.objects.filter(role=User.Role.MASTER_ADMIN)
        if all == bool(identifier):
            raise CommandError("Give either --all or at least one --identifier.")
        if identifier:
            query = Q()
            for value in identifier:
                query |= Q(email__iexact=value) | Q(emp_no__iexact=value) | Q(register_no__iexact=value)
            admins = admins.filter(query)
        found = list(admins)
        if not found:
            raise CommandError("No matching active Master Admin.")
        for user in found:
            self.stdout.write(f"  {user.email}")
        if not yes:
            self.stdout.write(f"{len(found)} account(s) would be disabled. Run again with --yes to do it.")
            return
        for user in found:
            user.is_active = False
            user.save(update_fields=["is_active"])
            VendorActionLog.objects.create(action="disable", target_email=user.email, detail="disabled from the server by the installer")
        self.stdout.write(f"Disabled {len(found)} account(s). Enable them again from the owner console if needed.")
