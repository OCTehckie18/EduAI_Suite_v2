# EduAI Suite business website

The EduAI Suite company's own product website and the small backend behind its "Request a demo" form.

This folder is a project of its own. It does not import anything from `backend/` or `apps/`, it never calls a university's API, and it has its own database, email account and admin users. Colleges each get their own separate installation of the university code; this site is where they first hear about it.

```
business/
  backend/   Django 5.1 + DRF: demo requests and campus records (port 8100)
  site/      Vite + React 19 + Tailwind v4: the product website (port 5180)
  docker-compose.yml
```

## Run it with Docker

```bash
cd business
docker compose up --build
```

- Website: http://localhost:5180
- Backend: http://localhost:8100/api/health/
- Django admin: http://localhost:8100/admin/ (create a user with `docker compose exec backend python manage.py createsuperuser`)

Postgres runs inside the compose network only, with no host port. In this mode emails are printed to the backend's log instead of being sent.

## Run it without Docker

Backend:

```bash
cd business/backend
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                           # then edit, or just set DJANGO_DEBUG=True
DJANGO_DEBUG=True python manage.py migrate
DJANGO_DEBUG=True python manage.py runserver 8100
```

Without `DATABASE_URL` the backend uses a local SQLite file, `business.sqlite3`.

Site:

```bash
cd business/site
npm ci
npm run dev        # http://localhost:5180, /api is passed on to http://127.0.0.1:8100
```

## Tests

```bash
cd business/backend && DJANGO_DEBUG=True python manage.py test
cd business/site && npx tsc -b && npm run build && npm test
```

CI runs both (`.github/workflows/ci.yml`, jobs `business-backend` and `business-site`) only when something under `business/` changes.

## Backend API

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/api/demo-requests/` | Anyone | Save a demo request and email the sales team |
| GET | `/api/staff/demo-requests/?status=new` | Staff | List demo requests |
| GET, PATCH | `/api/staff/demo-requests/<id>/` | Staff | Read one, change `status` and `notes` |
| GET, POST, PATCH, DELETE | `/api/staff/campuses/`, `/api/staff/campuses/<slug>/` | Staff | Colleges we run installations for (used by Phase 5) |
| GET | `/api/health/` | Anyone | Health check |

The public form:

- needs `name`, `role`, `institution`, `work_email` and `consent: true`; `city`, `approx_students`, `phone` and `message` are optional;
- is limited per IP address by `DEMO_REQUEST_RATE` (default `5/hour`);
- has a hidden `website` field. If a bot fills it in, the request gets a normal 201 answer but nothing is saved or emailed;
- emails `SALES_EMAIL` through the `SALES_SMTP_*` account. If the email fails, the request is still saved and the error is logged.

Staff endpoints use Django session sign-in and need `is_staff`. Until Phase 5 adds a dashboard, the sales team can use the Django admin.

## Settings

See [`backend/.env.example`](backend/.env.example) and [`site/.env.example`](site/.env.example). The main ones:

| Variable | Where | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | backend | Postgres address. Leave unset for SQLite. |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | backend | Usual Django settings. A secret key is required unless debug is on. |
| `CORS_ALLOWED_ORIGINS` | backend | Websites allowed to post the form. |
| `SALES_EMAIL`, `SALES_FROM_EMAIL`, `SALES_SMTP_*` | backend | Where demo requests go and how they are sent. |
| `VITE_BUSINESS_API_URL` | site | Backend address. Leave empty to post to `/api` on the same site. |
| `VITE_SALES_EMAIL` | site | Shown in the footer and as a fallback when the form cannot send. |

## Deploying the site

`site/vercel.json` builds the site and passes `/api/*` on to the backend. Change its `destination` to your real backend address before the first deploy, or set `VITE_BUSINESS_API_URL` and add the site's address to the backend's `CORS_ALLOWED_ORIGINS`.

## Copy rules for the site

- Brand it as EduAI Suite only. Never name a customer college.
- No made-up numbers, customer logos or testimonials. The screens are illustrations with sample data.
- Pricing says "Contact us"; quotes and invoices are handled offline.
- Check every change at phone width (375px), in light and dark mode, and with reduced motion turned on.
