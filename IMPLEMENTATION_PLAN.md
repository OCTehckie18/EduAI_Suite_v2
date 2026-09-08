# EduAI Suite v2 — Master Architecture & Portable Implementation Plan

> **System Transition Notice**: Phase 1 is **COMPLETED**. This document is completely self-contained and serves as the master blueprint to continue development across any machine or environment.

---

## Project Status Dashboard

| Phase | Description | Scope | Status |
|---|---|---|---|
| **Phase 1** | New Repo, Django 5.1, Docker, Core Soft-Delete, Master Admin Scaffold | Full-Stack Core | **COMPLETED** |
| **Phase 2** | Academic Hierarchy Models & Soft-Delete CRUD (`institution`) | Backend Core | **COMPLETED** |
| **Phase 3** | Custom User Model, Dual Auth (OAuth + Password), Onboarding (`accounts`) | Backend Core | In Progress |
| **Phase 4** | Classrooms, Excel/CSV Bulk Enrollment, Section Scoping (`classrooms`) | Academic Backbone | Pending |
| **Phase 5** | Assignments, Submissions, Announcements, Appointments | Core Deliverables | Pending |
| **Phase 6** | Exams, AI Quizzes, OpenCV OMR, Slido WebSockets, EduGames | Evaluation & Live | Pending |
| **Phase 7** | Lesson Plans (DOCX), Calendar Sync, Mail, Trello, Report Cards | Tools & Analytics | Pending |
| **Phase 8** | Master Admin Dedicated APIs & `apps/eduai` Full UI Integration | Master Governance | Pending |
| **Phase 9** | Django JWT & Full Frontend Integration (`teacherbuddy`, `edugames`) | Frontend Wiring | Pending |

---

## Environment Setup on a New System

When cloning or moving `EduAI_Suite_v2` to another machine:

```bash
# 1. Clone repository
git clone <YOUR_REPO_URL> EduAI_Suite_v2
cd EduAI_Suite_v2

# 2. Python & Backend Setup (Python 3.11+)
cd backend
pip install -r requirements.txt
python manage.py check
python manage.py migrate

# 3. Verify Health Check
python manage.py test apps.core

# 4. Frontend Setup
# Frontends: apps/eduai (Master Admin), apps/teacherbuddy, apps/edugames
cd ../apps/eduai && npm install && npm run build
cd ../teacherbuddy && npm install
cd ../edugames && npm install
```

---

## Core Technical Rules (Strictly Enforced)

1. **Universal Soft Delete (Dr. Alwin Joseph CU Policy)**:
   * **No hard row deletions**. Every model inherits from `SoftDeleteModel` (`apps.core.models.SoftDeleteModel`).
   * `DELETE` calls update `is_active = False` and record `deleted_at = timezone.now()`.
   * Standard queries automatically filter `is_active = True`. Master Admin / auditing queries use `all_objects` or `?include_inactive=true`.
   * All ViewSets inherit `SoftDeleteModelViewSet` providing a dedicated `POST /{id}/restore/` action.
2. **Dual Authentication & Onboarding Lifecycle**:
   * **Primary**: Google OAuth (`@christuniversity.in` / Google account).
   * **First Login**: Directs to Profile Onboarding to enter hierarchy (`register_no` / `emp_no`, Campus, School, Department, Program, Batch, Section) and set password.
   * **Secondary / Fallback**: Username (`register_no` / `emp_no` / `email`) + Password login from second session onwards.
3. **Tech Stack Integrity**:
   * **Frontends**: React 19 + **Tailwind CSS v4** + Vite 8 + TypeScript + Lucide React + Framer Motion.
   * **Backend**: Django 5.1 + DRF 3.17 + PostgreSQL 16 (or SQLite dev fallback) + Redis 7 Channels.

---

## Detailed Implementation Roadmap (Phases 2 – 9)

### Phase 2: Academic Hierarchy & Soft-Delete CRUD (`institution` app)
* **Goal**: Build the multi-campus hierarchy tree with cascading soft-delete and Christ University seed data.
* **App Directory**: `backend/apps/institution/`

#### Models (`models.py` inheriting `SoftDeleteModel`):
* `Campus`: `name`, `code` (unique), `city`, `state`, `address`, `is_active`.
* `School`: `name`, `code`, `campus` (FK `Campus`, `on_delete=models.CASCADE`), `is_active`.
* `Department`: `name`, `code`, `school` (FK `School`), `is_active`.
* `Program`: `name`, `code`, `department` (FK `Department`), `degree_level` (`UG`, `PG`, `PHD`), `duration_years`, `is_active`.
* `Batch`: `name` (e.g. "2025-27"), `program` (FK `Program`), `start_year`, `end_year`, `academic_year`, `is_active`.
* `Section`: `name` (e.g. "A", "B"), `batch` (FK `Batch`), `max_capacity`, `is_active`.
* *Constraint*: Unique together `(program, name)` on Batch, `(batch, name)` on Section.

#### Serializers & ViewSets:
* Serializers with nested read and flat ID write for fast dropdown cascading in frontends.
* Inherit `SoftDeleteModelViewSet`:
  * Deactivating a Campus flags all its Schools/Departments without row drops.
  * Hierarchical filtering: `/api/v1/institution/departments/?school_id=...&campus_id=...`.

#### Seed Data:
* Create `backend/fixtures/christ_university_initial_data.json`:
  * Campuses: Central Campus, Kengeri Campus, BGR Campus, Pune Lavasa Campus, Delhi NCR Campus.
  * Sample Schools & Departments (School of Sciences -> Computer Science, Data Science; School of Business, etc.).

#### Verification:
```bash
python manage.py makemigrations institution
python manage.py migrate
python manage.py loaddata fixtures/christ_university_initial_data.json
python manage.py test apps.institution
```

---

### Phase 3: User Accounts, Dual Auth & Profiles (`accounts` app)
* **Goal**: Custom User model supporting Google OAuth + Username/Password, onboarding lifecycle, and role permissions.
* **App Directory**: `backend/apps/accounts/`

#### Model (`models.py`):
* `User` inheriting `AbstractBaseUser`, `PermissionsMixin`, and `SoftDeleteModel`:
  * `email` (unique, indexed).
  * `register_no` (null=True, blank=True, unique=True for Students).
  * `emp_no` (null=True, blank=True, unique=True for Teachers).
  * `role`: `MASTER_ADMIN`, `CAMPUS_ADMIN`, `TEACHER`, `STUDENT`.
  * `first_name`, `last_name`, `avatar_url`, `phone_number`.
  * Hierarchy links:
    * Student: Single FK to `Campus`, `School`, `Department`, `Program`, `Batch`, `Section`.
    * Teacher: Single FK to `Campus`, `School`, `Department`; Many-to-Many to `Program` and `Batch`.
  * Status flags: `is_profile_complete` (boolean), `is_staff`, `is_superuser`, `is_active`.

#### Endpoints:
1. `POST /api/v1/auth/google/`:
   * Body: `{ "id_token": "..." }`.
   * Verifies Google token, finds or creates user, generates JWT tokens. Returns `{ "access", "refresh", "is_profile_complete", "user" }`.
2. `POST /api/v1/auth/login/`:
   * Body: `{ "username": "...", "password": "..." }` (accepts `register_no`, `emp_no`, or `email`).
   * Authenticates and returns JWT tokens.
3. `POST /api/v1/auth/profile/setup/`:
   * Authenticated endpoint for onboarding.
   * Validates hierarchy constraints, sets user password, sets `is_profile_complete = True`.
4. `GET /api/v1/auth/me/`: Current user profile with full hierarchy details.

#### Verification:
```bash
python manage.py makemigrations accounts
python manage.py migrate
python manage.py test apps.accounts
```

---

### Phase 4: Classrooms & Bulk Enrollment (`classrooms` app)
* **Goal**: Classroom creation, section scoping, and Excel/CSV bulk student enrollment.
* **App Directory**: `backend/apps/classrooms/`

#### Models:
* `Classroom`: `name`, `subject_code`, `teacher` (FK `User`), `department` (FK `Department`), `program` (FK `Program`), `batch` (FK `Batch`), `section` (FK `Section`, nullable), `enrollment_code` (unique), `is_active`.
* `Enrollment`: `classroom` (FK `Classroom`), `student` (FK `User`), `enrolled_at`, `is_active`.

#### Services:
* `GET /api/v1/classrooms/enrollment/template/`: Generates `.xlsx` template with columns `[Register No, Student Name, Student Email, Section]`.
* `POST /api/v1/classrooms/{id}/enroll/upload/`:
  * Parses Excel/CSV.
  * For existing students: enrolls them.
  * For non-registered emails: provisions placeholder student account tagged to the classroom's program/batch/section, and enrolls them.

#### Verification:
```bash
python manage.py makemigrations classrooms
python manage.py migrate
python manage.py test apps.classrooms
```

---

### Phase 5: Core Academic Deliverables
* **App Directories**:
  * `backend/apps/assignments/`: `Assignment`, `AssignmentAttachment`, `Submission`, `SubmissionAttachment`. Grading rubrics and feedback.
  * `backend/apps/announcements/`: `Announcement` (scoped to classroom, department, or campus).
  * `backend/apps/appointments/`: `TeacherOfficeHourSlot`, `AppointmentBooking` (states: PENDING, APPROVED, REJECTED).
* **Storage**: Local / Christ server media handler for assignment PDFs and document attachments.

---

### Phase 6: Assessment & Interactive Evaluation
* **App Directories**:
  * `backend/apps/exams/`: `Exam`, `ExamQuestion`, `StudentExamAttempt`, `ExamResult`. Marks recording and grade bounds.
  * `backend/apps/quizzes/`: AI quiz generation via Groq API, timed quiz attempts, instant scoring.
  * `backend/apps/omr/`: Printable PDF OMR answer sheet generation, OpenCV scanner service (bubble detection, thresholding, automated scoring, result publishing).
  * `backend/apps/slido/`: Live Q&A, interactive polling, word clouds, Django Channels WebSocket consumers.
  * `backend/apps/games/`: Educational mini-games, score tracking, leaderboards.

---

### Phase 7: Planning, Productivity & Analytics
* **App Directories**:
  * `backend/apps/lessons/`: Lesson plans, topic breakdowns, Groq LLM lesson generator, `.docx` export using `python-docx`.
  * `backend/apps/calendar_app/`: Timetable events, Google Calendar OAuth sync.
  * `backend/apps/mail/`: Internal student-teacher messaging, inbox/sent folders, bulk mailer.
  * `backend/apps/trello_app/`: Kanban boards, lists, cards, task status transitions.
  * `backend/apps/reports/`: Christ University student performance report cards in `.docx` and `.pdf` formats.
  * `backend/apps/analytics/`: Aggregated performance metrics, attendance trends, grade distribution, teacher/student dashboard endpoints.
  * `backend/apps/ai_chat/`: Groq-powered syllabus assistant.

---

### Phase 8: Master Admin Portal (`apps/eduai` & `apps.master_admin`)
* **Backend**: `backend/apps/master_admin/`:
  * `GET /api/v1/master-admin/overview/`: Cross-campus aggregated KPIs.
  * `GET /api/v1/master-admin/recycle-bin/`: Universal soft-delete archive querying `AllObjectsManager` for all deactivated records.
  * `POST /api/v1/master-admin/recycle-bin/{content_type}/{id}/restore/`: Global one-click restore.
* **Frontend**: `apps/eduai`:
  * Connect Vite + React 19 + Tailwind CSS v4 UI to master-admin endpoints.
  * Multi-campus governance, hierarchy visualizer, and live Recycle Bin.

---

### Phase 9: Frontend Integration & Supabase Removal
* In `apps/teacherbuddy` and `apps/edugames`:
  * Uninstall `@supabase/supabase-js` and remove all `supabase.ts` references.
  * Update `useAuthStore.ts` for Django JWT dual-auth.
  * Add the Account Setup / Onboarding page.
  * Align API clients to `/api/v1/...` DRF routes.
  * End-to-end integration validation across all 3 apps.

---

## Test Execution Guide (Across All Phases)

```bash
# In backend/
pytest --verbose

# Run per-app test suites
python manage.py test apps.core
python manage.py test apps.institution
python manage.py test apps.accounts
python manage.py test apps.classrooms
python manage.py test apps.assignments
python manage.py test apps.exams
python manage.py test apps.omr
python manage.py test apps.master_admin
```
