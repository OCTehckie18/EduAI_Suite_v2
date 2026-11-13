import re
import secrets
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from sales.channel import encrypt_secret
from sales.models import Campus


class Command(BaseCommand):
    help = (
        "Register (or update) a college in the owner console. With --generate-key it makes a fresh channel key, stores it "
        "encrypted here, and writes VENDOR_CHANNEL_SECRET into the college's own .env file (--write-env). The key is never printed."
    )

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--api-url", default="")
        parser.add_argument("--landing-url", default="")
        parser.add_argument("--admin-url", default="")
        parser.add_argument("--teacherbuddy-url", default="")
        parser.add_argument("--edugames-url", default="")
        parser.add_argument("--status", default="active", choices=[c[0] for c in Campus.Status.choices])
        parser.add_argument("--plan", default="standard", choices=[c[0] for c in Campus.Plan.choices])
        parser.add_argument("--generate-key", action="store_true")
        parser.add_argument("--write-env", help="Path to the college's backend .env to receive VENDOR_CHANNEL_SECRET.")

    def handle(self, *args, **o):
        if o["generate_key"] and not o["write_env"]:
            raise CommandError("--generate-key needs --write-env, so the key reaches the college without being printed.")
        campus, created = Campus.objects.get_or_create(slug=o["slug"], defaults={"college_name": o["name"]})
        campus.college_name = o["name"]
        for field in ("api_url", "landing_url", "admin_url", "teacherbuddy_url", "edugames_url"):
            if o[field]:
                setattr(campus, field, o[field])
        campus.status, campus.plan = o["status"], o["plan"]
        if o["generate_key"]:
            key = secrets.token_urlsafe(32)
            env = Path(o["write_env"])
            text = env.read_text(encoding="utf-8") if env.exists() else ""
            line = f"VENDOR_CHANNEL_SECRET={key}"
            if re.search(r"^VENDOR_CHANNEL_SECRET=.*$", text, flags=re.M):
                text = re.sub(r"^VENDOR_CHANNEL_SECRET=.*$", lambda _: line, text, flags=re.M)
            else:
                text = text.rstrip("\n") + ("\n" if text else "") + line + "\n"
            env.write_text(text, encoding="utf-8")
            campus.channel_secret_enc = encrypt_secret(key)
        campus.save()
        self.stdout.write(f"{'Added' if created else 'Updated'} '{campus.college_name}' ({campus.slug})."
                          + (f" Key written to {o['write_env']}; restart that backend to pick it up." if o["generate_key"] else ""))
