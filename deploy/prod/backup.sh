#!/bin/sh
# Backs up the database and the uploaded files. Run it from deploy/prod (a nightly cron job is typical):
#   ./backup.sh /var/backups/eduai
# Restore: see README.md.
set -eu
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

$COMPOSE exec -T db pg_dump -U eduai -d eduai_suite --format=custom > "$DEST/db-$STAMP.dump"
# Uploads live in volumes; tar them through the web container.
$COMPOSE exec -T web tar -C /app -cf - uploads media local_uploads | gzip > "$DEST/files-$STAMP.tar.gz"

# Keep the last 14 days
find "$DEST" -name 'db-*.dump' -mtime +14 -delete
find "$DEST" -name 'files-*.tar.gz' -mtime +14 -delete
echo "Backup written to $DEST ($STAMP)"
