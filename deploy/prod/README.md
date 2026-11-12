# Production installation (one university)

This folder runs one university's EduAI Suite on a single server with Docker. It starts:

| Service | What it does |
|---|---|
| `db` | PostgreSQL 16, data kept in a volume |
| `redis` | Cache, rate limits and live-game messages |
| `migrate` | Runs once at every start: database migrations and static files |
| `web` | The HTTP API, served by gunicorn (several processes, several threads each) |
| `realtime` | Live games over websockets, served by daphne |
| `calendar_worker` | Sends calendar changes to Google calendars |
| `edge` | nginx: serves the four websites and sends `/api`, `/ws` and `/uploads` to the backend |
| `caddy` (optional) | Automatic HTTPS, started with `--profile tls` |

The four websites are chosen by host name, for example `campus.example.edu` (landing page),
`admin.example.edu` (Master Admin), `teach.example.edu` (TeacherBuddy) and `play.example.edu` (EduGames).
They all share the one backend, database and uploads of this university.

The development file `docker-compose.yml` in the repository root is unchanged and is for development only.

## First start

1. A server with Docker (Compose v2), 4 CPU cores and 8 GB of memory is a good start for a few thousand students.
2. Point four DNS names at the server.
3. In this folder:

   ```bash
   cp .env.example .env
   ```

   Fill in every value (the file explains how to generate the secrets). The Google client id is built into
   the TeacherBuddy and EduGames pages, so change it only with a rebuild (step 4).
4. Start everything:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d --build
   ```

   For automatic HTTPS add `--profile tls` (ports 80 and 443 must be free, so set `EDGE_PORT=8080` in `.env`).
   Otherwise put your own TLS terminator in front of the edge; it must send `X-Forwarded-Proto: https`.
5. In Google Cloud, add the four `https://` addresses as authorised JavaScript origins of the OAuth client.
6. Create the first Master Admin:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec web python manage.py createsuperuser
   ```

   Then sign in on the admin address and set up the university (University, Structure, rosters).

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

`migrate` runs first; the API and live games restart afterwards. Take a backup before an upgrade.

## Backups

`./backup.sh /var/backups/eduai` writes a database dump and a copy of the uploads and keeps 14 days. Run it from
cron every night, and copy the folder off the server.

Restore (this replaces the current data):

```bash
docker compose -f docker-compose.prod.yml --env-file .env stop web realtime calendar_worker
docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_restore -U eduai -d eduai_suite --clean --if-exists < db-YYYYMMDD-HHMMSS.dump
gunzip -c files-YYYYMMDD-HHMMSS.tar.gz | docker compose -f docker-compose.prod.yml --env-file .env exec -T web tar -C /app -xf -
docker compose -f docker-compose.prod.yml --env-file .env start web realtime calendar_worker
```

## Sizing

The defaults are written in `.env.example` under "Sizing". Rules of thumb:

- `WEB_CONCURRENCY x DB_POOL_MAX` must stay below `POSTGRES_MAX_CONNECTIONS`. With the defaults on 4 cores that is
  9 x 10 = 90 of 200.
- More students at once: raise `WEB_CONCURRENCY` (one per core pair), then the database `shared_buffers`.
- Live games use the `realtime` service. If rooms are large and busy, raise `CHANNEL_CAPACITY`.
- Watch `docker compose logs web` for slow requests and `docker stats` for memory.

## Not included

- Monitoring and alerting (add your own, for example by watching the `/api/v1/health/` address).
- A second server or a database replica. One server covers one university; when it no longer does, move the
  database to a managed service by changing `DATABASE_URL` and setting `DATABASE_SSL_REQUIRE=True`.
- Settings that are built into the websites (the Google client id and the portal addresses) need a rebuild to change.
