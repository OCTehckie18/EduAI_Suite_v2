# EduAI Suite v2 Architecture

**Document status:** Architecture baseline for product review  
**Product:** EduAI Suite v2  
**Last updated:** 2026-09-20  
**Source requirements:** [PRD.md](PRD.md)  
**Architecture owner:** Engineering team

## 1. Purpose

This document defines how EduAI Suite v2 is structured, how requests and state move through the system, where responsibilities belong, how the account, note, and assignment workflows are implemented, and which rules protect long-term maintainability.

The architecture must support an education platform with:

- Multiple role-specific web portals.
- Multi-campus and academic-hierarchy scoping.
- Authentication, onboarding, and role-aware routing.
- Classroom, assignment, submission, assessment, and analytics domains.
- Personal and future shared learning content.
- AI and document-processing integrations.
- Background jobs and generated files.
- Live classroom and game communication.
- Strong privacy, authorization, data-integrity, and audit requirements.

Architecture answers **how** the product works. The product behavior, user outcomes, non-goals, and acceptance criteria are defined in [PRD.md](PRD.md).

## 2. Architectural Summary

EduAI Suite uses a multi-frontend, modular monolith architecture with asynchronous and real-time extensions.

- The three React and Vite applications are independently buildable portals.
- Django is the primary HTTP application and domain boundary.
- Django REST Framework exposes versioned APIs for browser clients and integrations.
- PostgreSQL is the production relational system of record; SQLite remains a development fallback.
- Redis supports channel messaging and Celery broker/result workloads.
- Daphne serves the ASGI application for HTTP and future WebSocket traffic.
- Celery handles work that should not block an HTTP request, including AI, document, report, and other long-running operations.
- Storage services own uploaded and generated files rather than embedding file contents in database rows.
- The server is authoritative for identity, authorization, academic scope, assignment state, completion state, and official records.
- Frontends own presentation state and interaction state, but they do not own business truth.

```text
+----------------------+  +----------------------+  +----------------------+
| Teacher Portal       |  | Student Portal       |  | Master Admin Portal  |
| apps/teacherbuddy    |  | apps/edugames        |  | apps/eduai           |
| React + TypeScript   |  | React + TypeScript   |  | React + TypeScript   |
+----------+-----------+  +----------+-----------+  +----------+-----------+
           |                         |                         |
           +------------- HTTPS / REST / WebSocket ------------+
                                     |
                         +-----------v-----------+
                         | Django ASGI runtime   |
                         | Django + DRF          |
                         +-----------+-----------+
                                     |
          +--------------------------+--------------------------+
          |                          |                          |
+---------v----------+    +----------v---------+    +-------------v---------+
| Domain apps        |    | Cross-cutting      |    | Async and real-time  |
| accounts           |    | core, auth, policy |    | Channels, Celery     |
| institution        |    | pagination, audit |    | WebSocket consumers  |
| classrooms         |    | exceptions        |    | background tasks     |
| assignments        |    +----------+---------+    +-----------+-----------+
| notes              |               |                          |
| exams, games, ...  |               +------------+-------------+
+---------+----------+                            |
          |                                       |
+---------v----------+       +--------------------v-------------------+
| PostgreSQL         |       | Redis, object storage, AI providers   |
| system of record   |       | queues, channel layer, file artifacts |
+--------------------+       +----------------------------------------+
```

## 3. Current Repository Shape

The repository currently contains:

```text
EduAI_Suite_v2/
├── apps/
│   ├── eduai/                         # Master admin portal
│   ├── edugames/                      # Student portal and games
│   └── teacherbuddy/                  # Teacher portal
├── backend/
│   ├── apps/
│   │   ├── accounts/
│   │   ├── ai_chat/
│   │   ├── analytics/
│   │   ├── announcements/
│   │   ├── appointments/
│   │   ├── assignments/
│   │   ├── calendar_app/
│   │   ├── classrooms/
│   │   ├── core/
│   │   ├── exams/
│   │   ├── games/
│   │   ├── institution/
│   │   ├── lessons/
│   │   ├── mail/
│   │   ├── master_admin/
│   │   ├── omr/
│   │   ├── quizzes/
│   │   ├── reports/
│   │   ├── slido/
│   │   └── trello_app/
│   ├── config/
│   │   ├── settings/
│   │   ├── asgi.py
│   │   ├── celery.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── services/
│   │   ├── groq_service.py
│   │   ├── storage_service.py
│   │   ├── supabase_storage_service.py
│   │   └── word_service.py
│   ├── manage.py
│   ├── requirements.txt
│   └── db.sqlite3                    # Development fallback database
├── docs/
├── docker-compose.yml
├── DESIGN.md
├── IMPLEMENTATION_PLAN.md
└── README.md
```

The architecture should evolve from this shape without creating a second backend or a second source of truth for the same domain.

## 4. Architectural Goals

### 4.1 Primary goals

- Keep business capabilities modular and discoverable.
- Make authorization and academic scope explicit at the backend boundary.
- Keep frontend applications independently deployable while sharing compatible contracts.
- Preserve server authority over academic and user-owned data.
- Support synchronous HTTP, asynchronous jobs, and real-time events without mixing their responsibilities.
- Make external provider failure recoverable and observable.
- Allow gradual migration from legacy route aliases and incomplete features.
- Keep development possible with local services and safe fallback configuration.

### 4.2 Quality attributes

| Quality | Architectural response |
| --- | --- |
| Security | Server-side authentication, object-level authorization, scoped queries, redacted logs, secret isolation |
| Privacy | Data minimization, role and campus scope, personal-note isolation, no private content in telemetry |
| Reliability | Transactions, idempotency, durable state, retry boundaries, explicit failure states |
| Maintainability | Domain app boundaries, service modules, typed frontend clients, ADRs, contract tests |
| Performance | Pagination, indexed queries, async jobs, caching only where correctness permits |
| Accessibility | Semantic portal components, consistent states, keyboard and responsive support |
| Operability | Health checks, correlation IDs, structured logs, metrics, worker and WebSocket visibility |
| Evolvability | Versioned APIs, stable event contracts, feature flags, migration and rollback plans |

## 5. Bounded Contexts and Ownership

Each bounded context owns its business rules, persistent models, API views, serializers, and tests. A context may depend on cross-cutting utilities, but it should not reach directly into another context's private implementation.

### 5.1 Accounts and identity

**Location:** `backend/apps/accounts/`

Owns:

- User identity and account lifecycle.
- Google identity verification and password fallback.
- JWT or approved session token behavior.
- Profile completion and onboarding state.
- Role and account status.
- Authentication and authorization primitives.

Does not own:

- Classroom enrollment decisions beyond user relationships required for identity.
- Assignment or note business rules.
- Frontend route rendering.

### 5.2 Institution

**Location:** `backend/apps/institution/`

Owns:

- Campus, school, department, program, batch, and section hierarchy.
- Hierarchy validation and active/inactive lifecycle.
- Scope references used by users, classrooms, assignments, and analytics.

Does not own:

- User login.
- Classroom membership business rules.
- Student completion records.

### 5.3 Classrooms and enrollment

**Location:** `backend/apps/classrooms/`

Owns:

- Classroom creation and ownership.
- Academic scope of a classroom.
- Enrollment and enrollment state.
- Bulk enrollment inputs and validation.
- Eligibility queries used by assignment and learning features.

Does not own:

- Assignment content.
- Student grades.
- Personal note visibility.

### 5.4 Assignments and submissions

**Location:** `backend/apps/assignments/`

Owns:

- Assignment definitions.
- Draft, published, closed, archived, and deleted states.
- Assignment scope and creator authorization.
- Student completion records.
- Submission records when the submission feature is enabled.
- Assignment-specific state transitions and idempotency.

Does not own:

- Authentication.
- Classroom membership creation.
- Generic file storage implementation.
- Analytics presentation, although it emits or exposes data for analytics.

### 5.5 Notes

**Target location:** `backend/apps/notes/`

The repository does not currently show a first-class notes app in the existing implementation plan. The note capability proposed by the PRD should be introduced as a bounded context rather than placed inside accounts, classrooms, or a frontend-only store.

Owns:

- Note creation, retrieval, update, soft deletion, and restoration policy.
- Personal ownership and future explicit sharing modes.
- Note visibility and note-specific lifecycle.
- Note version or stale-update protection.
- Optional references to permitted academic context.

Does not own:

- User authentication.
- Classroom membership.
- Assignment completion.
- AI provider calls. AI assistance should consume an approved note service boundary later.

### 5.6 Core platform

**Location:** `backend/apps/core/`

Owns cross-cutting behavior:

- Soft-delete base model and managers.
- Common pagination.
- Exception normalization.
- Health checks.
- Audit or action history primitives.
- Shared permissions only when they are genuinely generic.
- Correlation and request metadata helpers.

Core must not become a dumping ground for domain behavior. A rule that applies only to assignments belongs in assignments.

### 5.7 Master administration

**Location:** `backend/apps/master_admin/`

Owns:

- Cross-campus governance views.
- Recycle-bin and restore operations under explicit permission.
- Administrative aggregate views.
- Privileged audit and support actions.

It must call domain-approved services rather than mutate unrelated models through broad unstructured queries.

### 5.8 Other domain contexts

The existing backend also contains announcements, appointments, exams, quizzes, OMR, games, lessons, calendar, mail, Trello, reports, analytics, Slido, and AI chat. Each should follow the same ownership model:

- Domain app owns domain rules.
- `services/` owns carefully bounded integrations or reusable infrastructure adapters.
- `core/` owns only cross-cutting behavior.
- Frontends consume contracts rather than importing backend assumptions.

## 6. Frontend Architecture

### 6.1 Portal responsibilities

#### `apps/teacherbuddy`

Primary audience: teachers and authorized staff.

Responsibilities:

- Classroom and course management.
- Assignment authoring and teacher views of completion.
- Lesson, appointment, analytics, communication, and planning surfaces.
- Teacher-specific navigation and role-aware route guards.

#### `apps/edugames`

Primary audience: students and live learning participants.

Responsibilities:

- Student dashboard and classroom access.
- Assignment viewing and completion.
- Exams, quizzes, games, appointments, analytics, lessons, and AI chat where enabled.
- Live game and interactive-session client behavior.

#### `apps/eduai`

Primary audience: master administrators and governance users.

Responsibilities:

- Cross-campus overview.
- Hierarchy and user governance.
- Recycle-bin and restore workflows.
- Operational or administrative controls.

### 6.2 Recommended frontend layers

Each portal should converge toward the following structure:

```text
src/
├── app/                         # Application bootstrap and providers
│   ├── App.tsx
│   ├── providers/
│   └── routes/
├── features/                   # User-facing vertical slices
│   ├── auth/
│   ├── notes/
│   ├── assignments/
│   ├── classrooms/
│   └── .../
├── layouts/                    # Role and shell layouts
├── shared/
│   ├── components/             # Reusable visual components
│   ├── hooks/                  # Generic hooks only
│   ├── utils/                  # Pure utilities
│   └── types/                  # Shared client-side types
├── services/                   # API and WebSocket adapters
│   ├── httpClient.ts
│   ├── authClient.ts
│   ├── notesClient.ts
│   └── assignmentsClient.ts
├── store/                      # Client state and session state
├── lib/                        # Configuration and integration helpers
├── assets/
├── index.css
└── main.tsx
```

The current repository has feature, layout, shared, store, router, and utility directories in the larger portals. New code should fit those patterns rather than creating a competing top-level convention.

### 6.3 Frontend layer rules

- Route components coordinate page composition; they do not contain database logic.
- Feature components own feature-specific interaction and presentation.
- API clients own HTTP request construction, typed responses, and normalized errors.
- WebSocket adapters own connection, reconnection, subscription, and protocol handling.
- Stores own client state and cached server state only when the chosen data strategy requires it.
- Shared components contain visual behavior with no domain-specific authorization assumptions.
- A component must not decide that a user is authorized solely because a button is visible.
- Client-side route guards improve UX but never replace backend authorization.
- Query invalidation or state reconciliation must happen after confirmed mutation responses.
- Timers, polling intervals, sockets, and event listeners must be cleaned up on unmount.

## 7. Backend Architecture

### 7.1 Request layers

A normal HTTP request should follow this direction:

```text
Browser
  -> Portal API client
  -> HTTP request with authentication context
  -> Django middleware
  -> DRF authentication
  -> URL router
  -> View or ViewSet
  -> Permission and scope checks
  -> Serializer input validation
  -> Domain service or model operation
  -> Transaction and database
  -> Serializer output
  -> Normalized response
  -> Browser state reconciliation
```

The exact number of service layers may vary. The invariant is that authorization, validation, domain mutation, and representation remain understandable and testable.

### 7.2 Backend app structure

A domain app should generally converge toward:

```text
backend/apps/<domain>/
├── __init__.py
├── admin.py
├── apps.py
├── models.py                  # Persistent domain state
├── managers.py                # Query managers where needed
├── permissions.py             # Domain-specific permission rules
├── serializers.py             # API representation and boundary validation
├── services.py                # Multi-model domain operations
├── selectors.py               # Read/query composition where useful
├── tasks.py                   # Background work owned by this domain
├── consumers.py               # WebSocket behavior, only for live domains
├── urls.py
├── views.py                   # HTTP orchestration, kept thin
├── migrations/
└── tests/
    ├── test_models.py
    ├── test_services.py
    ├── test_permissions.py
    ├── test_api.py
    └── test_contracts.py
```

Existing apps may not all have this exact layout. New work should move incrementally toward it without broad unrelated rewrites.

### 7.3 View responsibility

Views and ViewSets should:

- Authenticate and identify the request.
- Select the route operation.
- Invoke permission and scope checks.
- Validate input through serializers.
- Call a domain service for multi-step mutations.
- Return the documented response and status code.

Views should not:

- Contain large business workflows.
- Trust user IDs, campus IDs, or ownership values supplied by the client.
- Call external AI or storage providers directly when an adapter exists.
- Silently return HTTP 200 for a failed operation.
- Reimplement another domain's permission logic.

### 7.4 Service responsibility

Domain services are appropriate when an operation:

- Mutates multiple records.
- Needs a transaction.
- Has a state transition.
- Calls an external provider.
- Needs idempotency or retry handling.
- Is shared by HTTP, background, and WebSocket entry points.

A service should receive validated, typed inputs and return a domain result or a documented domain exception. It should not depend on a request object unless the request context is explicitly required for authorization or audit metadata.

## 8. Account and Authentication Architecture

### 8.1 Identity model

The backend uses a custom user model configured through `AUTH_USER_MODEL = 'accounts.User'`. The user concept includes:

- Email or verified external identity.
- Registration number for students where applicable.
- Employee number for teachers where applicable.
- Role.
- Academic hierarchy relationships.
- Profile-completion state.
- Active or inactive account state.

### 8.2 Authentication flow

```text
User
  -> Portal login or account activation UI
  -> Auth client
  -> /api/v1/auth/... endpoint
  -> Provider token or username/password verification
  -> Account lookup or creation
  -> Profile and scope evaluation
  -> Access and refresh token response
  -> Current-user profile request
  -> Role-aware route selection
```

The backend must determine role, profile state, and academic scope. The browser may cache a representation for rendering, but it must refresh or reject stale authorization state.

### 8.3 Token and session rules

- Access-token lifetime, refresh lifetime, storage, and rotation must be defined in `SECURITY.md` and `DECISIONS.md`.
- Tokens must never be logged.
- The client must handle expiration without infinite retry loops.
- A failed refresh must clear protected client state and return the user to authentication.
- Role or account deactivation must invalidate effective access according to the chosen token strategy.
- APIs must return consistent authentication and authorization errors.

### 8.4 Onboarding state machine

```text
[No account]
      |
      v
[Identity verified]
      |
      +--> [Existing active account] --> [Authenticated]
      |
      +--> [Incomplete profile] -------> [Onboarding]
      |                                      |
      |                                      v
      |                                [Pending approval]
      |                                      |
      |                                      v
      |                                [Authenticated]
      |
      +--> [Rejected or suspended] --> [Access denied]
```

No protected note, classroom, or assignment data should be exposed in `Onboarding`, `Pending approval`, `Rejected`, or `Suspended` states.

## 9. Notes Architecture

### 9.1 Ownership

Notes belong to an explicit owner. The initial architecture defaults to personal notes:

```text
User 1 ---- owns ---- many Note
Note 0..1 ---- references ---- Classroom
Note 0..1 ---- references ---- Assignment
```

A classroom relationship is context, not permission. A student enrolled in a classroom must not automatically see another user's personal note.

### 9.2 Note service boundary

The note domain should expose operations conceptually equivalent to:

- `list_owned_notes(user, filters)`
- `get_note_for_user(user, note_id)`
- `create_note(user, validated_input)`
- `update_note(user, note_id, validated_input, expected_version)`
- `soft_delete_note(user, note_id)`
- `restore_note(actor, note_id)` when approved

All operations must derive ownership and authorization from the authenticated actor and server-side relationships.

### 9.3 Note lifecycle

```text
[Not created]
      |
      v
[Active] <---- update ----> [Active]
      |
      v
[Soft deleted]
      |
      +---- restore, if permitted ----> [Active]
```

The active list and standard note lookup should exclude soft-deleted records. A deleted note must not cascade into assignments, submissions, classrooms, or official academic records.

### 9.4 Note mutation flow

```text
Notes page
  -> notesClient.create/update/delete
  -> authenticated API request
  -> Notes view
  -> note permission and owner check
  -> serializer validation
  -> note service
  -> transaction
  -> database
  -> response with authoritative note state
  -> query/store reconciliation
```

### 9.5 Stale update protection

The initial implementation should choose one of:

- Version number supplied by the client and checked atomically.
- Last-updated timestamp supplied by the client and checked atomically.
- A deliberate last-write-wins policy documented as acceptable for personal notes.

Silent overwrite should not be introduced accidentally. The chosen policy belongs in `DECISIONS.md` and must be tested.

## 10. Assignment Architecture

### 10.1 Assignment concepts

An assignment is a teacher-authored definition of academic work. A student completion record is a separate state associated with one student and one assignment.

```text
Teacher 1 ---- creates ---- many Assignment
Classroom 1 ---- contains ---- many Assignment
Student 1 ---- has ---- many AssignmentCompletion
Assignment 1 ---- has ---- many AssignmentCompletion
```

Future submission and grading records should remain separate from completion:

```text
Assignment
  +-- Completion: student progress assertion
  +-- Submission: student-provided work
  +-- Grade: authorized evaluation
  +-- Feedback: teacher or approved workflow response
```

### 10.2 Assignment state machine

```text
[Draft]
   |
   +---- edit ----> [Draft]
   |
   +---- publish -> [Published]
                       |
                       +---- close ----> [Closed]
                       |
                       +---- archive --> [Archived]
   |
   +---- delete under policy --> [Soft deleted]
```

A published assignment may have restrictions on later edits. Those restrictions must protect student history and be decided before implementation.

### 10.3 Completion state machine

```text
[Not started]
      |
      v
[Completion requested]
      |
      +---- validation failure --> [Not started]
      |
      +---- confirmed ----------> [Completed]
                                      |
                                      +--> [Submitted] in a later release
                                      |
                                      +--> [Graded] in a later release
                                      |
                                      +--> [Returned or needs revision]
```

`Completed` is not `Graded`. The API, database, UI labels, analytics, and tests must preserve this distinction.

### 10.4 Assignment creation flow

```text
Teacher portal
  -> assignment form
  -> assignmentsClient
  -> POST /api/v1/assignments/...
  -> authentication
  -> teacher role and classroom ownership check
  -> serializer validation
  -> assignment service
  -> transaction and optional attachment registration
  -> assignment response
  -> teacher list/detail reconciliation
```

### 10.5 Completion flow

```text
Student portal
  -> Mark complete
  -> assignmentsClient
  -> POST completion command
  -> authentication
  -> enrollment and assignment visibility check
  -> idempotency and state validation
  -> transaction
  -> completion response
  -> student state update
  -> teacher view refresh or event
```

Repeated completion commands must resolve to one stable record. A client-provided student ID must not be trusted to select the affected student.

## 11. API Architecture

### 11.1 API entry point

The canonical API prefix is `/api/v1/`. The existing router also contains legacy aliases such as `/assignments/`, `/submissions/`, `/courses/`, and other non-versioned paths. New features must use `/api/v1/`.

Legacy aliases should be treated as compatibility surfaces:

- Do not add new behavior only to a legacy path.
- Document any alias that remains necessary.
- Add contract tests for both canonical and intentionally supported aliases.
- Deprecate aliases through a recorded decision and migration plan rather than removing them casually.

### 11.2 Resource-oriented endpoint conventions

Recommended shapes:

```text
GET    /api/v1/notes/
POST   /api/v1/notes/
GET    /api/v1/notes/{id}/
PATCH  /api/v1/notes/{id}/
DELETE /api/v1/notes/{id}/
POST   /api/v1/notes/{id}/restore/

GET    /api/v1/assignments/
POST   /api/v1/assignments/
GET    /api/v1/assignments/{id}/
PATCH  /api/v1/assignments/{id}/
POST   /api/v1/assignments/{id}/publish/
POST   /api/v1/assignments/{id}/close/

GET    /api/v1/assignments/{id}/completion/
POST   /api/v1/assignments/{id}/completion/
PATCH  /api/v1/assignments/{id}/completion/
```

Exact paths may change through an ADR. The principles remain:

- Use nouns for resources.
- Use explicit action endpoints for state transitions that are not ordinary edits.
- Keep status codes and error bodies stable.
- Use pagination for potentially large lists.
- Return server-assigned IDs and timestamps.
- Return a normalized validation and permission error shape.

### 11.3 HTTP response semantics

Recommended semantics:

- `200 OK`: successful read or idempotent update.
- `201 Created`: new resource created.
- `202 Accepted`: asynchronous work accepted and tracked.
- `204 No Content`: successful operation with no response body where appropriate.
- `400 Bad Request`: malformed or invalid input.
- `401 Unauthorized`: missing or invalid authentication.
- `403 Forbidden`: authenticated but not allowed.
- `404 Not Found`: resource does not exist or is intentionally not disclosed.
- `409 Conflict`: stale update, duplicate, or state conflict.
- `413 Content Too Large`: upload limit exceeded.
- `415 Unsupported Media Type`: unsupported file or request type.
- `429 Too Many Requests`: rate limit.
- `500 Internal Server Error`: unexpected server failure.
- `502/503`: provider or dependency failure where the distinction is meaningful.

Do not encode a failed AI, storage, or database operation as a successful HTTP response with an error string in an otherwise successful content field.

### 11.4 API error shape

The API should converge on an error response such as:

```json
{
  "error": {
    "code": "ASSIGNMENT_NOT_VISIBLE",
    "message": "This assignment is not available to the current user.",
    "field_errors": {},
    "request_id": "correlation-id"
  }
}
```

Messages must be safe for the user's authority level. The response should not reveal whether a private object exists when that would create an information leak.

### 11.5 API client boundary

Each portal should call the backend through a small typed client layer:

```text
Feature component
  -> feature hook or action
  -> typed domain client
  -> shared HTTP client
  -> fetch
```

The shared HTTP client should centralize:

- Base URL resolution.
- Authentication headers.
- Refresh behavior if approved.
- Request IDs where supported.
- JSON parsing.
- Timeout and abort behavior.
- Error normalization.

Feature clients should not repeat token handling or manually parse every status code.

## 12. WebSocket and Real-Time Architecture

### 12.1 Current state

The repository includes Channels, `channels-redis`, and Daphne dependencies. The current `backend/config/asgi.py` routes HTTP through Django and explicitly leaves WebSocket routing as a planned phase. Frontend Vite configurations enable WebSocket proxying, and game clients include reconnect and REST polling fallback behavior.

This is an important distinction: a frontend WebSocket hook does not make the backend WebSocket route operational. A production-ready real-time path requires ASGI routing, authentication, consumers, server-side state transitions, channel-layer configuration, and tests.

### 12.2 Target topology

```text
Browser WebSocket
  -> Vite proxy in development or edge/load balancer in production
  -> Daphne ASGI server
  -> ProtocolTypeRouter
  -> Authenticated WebSocket middleware
  -> URLRouter
  -> Domain consumer
  -> Permission and session validation
  -> Domain service
  -> Database transaction
  -> Channel layer broadcast
  -> Connected authorized clients
```

### 12.3 Command and event separation

WebSocket messages should distinguish:

- **Commands:** client requests, such as `join`, `submit_word`, `start_game`, or `mark_complete`.
- **Events:** server-confirmed facts, such as `player_joined`, `word_submitted`, or `assignment_completed`.
- **Snapshots:** authoritative state sent on initial connection or recovery.
- **Errors:** rejected commands with a stable error code.
- **Keepalive messages:** ping and pong, not domain events.

The client must not treat a command as completed until the server emits a confirmation or returns a confirmed response.

### 12.4 Connection lifecycle

```text
[Disconnected]
      |
      v
[Connecting]
      |
      +---- success ----> [Connected]
      |                       |
      |                       +---- command/event flow
      |                       |
      |                       +---- temporary failure -> [Reconnecting]
      |                                                        |
      |                                                        +-- success -> [Connected]
      |                                                        |
      |                                                        +-- exhausted -> [Polling or degraded mode]
      |
      +---- failure ------> [Reconnecting]
```

Every consumer must:

- Authenticate the connection.
- Validate the session and participant scope.
- Validate every command.
- Prevent duplicate commands where the operation is retryable.
- Close or downgrade cleanly when the session ends.
- Avoid broadcasting private data to unauthorized connections.

### 12.5 REST fallback

Polling is acceptable as a degradation path for selected read-oriented real-time features, but it must not implement a second set of business rules. The REST path and WebSocket path should call the same domain service or read model wherever possible.

For game synchronization, the current client hook retries WebSocket connections and falls back to REST polling. The target architecture should preserve that resilience while ensuring:

- Polling does not create duplicate writes.
- WebSocket and polling snapshots use compatible shapes.
- A reconnect does not replay stale events as new events.
- Timers and socket cleanup cannot trigger reconnect after unmount.

## 13. Asynchronous Work Architecture

### 13.1 When to use background jobs

Use Celery for work that is:

- Long-running or provider-dependent.
- Likely to exceed an HTTP timeout.
- CPU-heavy or document-processing heavy.
- Retryable without duplicating side effects.
- Better represented as queued, running, succeeded, or failed.

Examples include report generation, document conversion, AI generation, bulk enrollment processing, OMR processing, and large export creation.

### 13.2 Task flow

```text
HTTP request
  -> validate and create durable job record
  -> enqueue Celery task in Redis
  -> return 202 with job ID
  -> worker loads job and source data
  -> perform bounded operation
  -> store artifact or result
  -> update job state transactionally
  -> notify or expose status to client
```

### 13.3 Task rules

- A task must have a timeout and bounded retry policy.
- Retries must be idempotent or use a durable deduplication key.
- A task must not log secrets or private document contents.
- A provider failure must be distinguishable from invalid user input.
- The user must be able to see queued, processing, success, and failure states where the operation is user-visible.
- Generated files must be linked to an owner and source request.
- Failed tasks must be diagnosable through a request or job identifier.

### 13.4 Celery and database consistency

Do not enqueue a task that depends on a database record before the transaction creating that record is committed. Use an after-commit mechanism or an outbox-like pattern when necessary.

## 14. Data Architecture

### 14.1 Systems of record

| Data | System of record | Notes |
| --- | --- | --- |
| Users and roles | PostgreSQL | Authentication state and academic scope are server-owned |
| Institution hierarchy | PostgreSQL | Source for campus and academic scoping |
| Classrooms and enrollment | PostgreSQL | Source for eligibility |
| Notes | PostgreSQL | Body and lifecycle metadata; files should use storage |
| Assignments and completion | PostgreSQL | Official workflow state |
| Uploaded and generated files | Object or media storage | Database stores metadata and ownership |
| Queue state | Celery and Redis plus durable job record where user-visible | Redis alone must not be the only source for critical history |
| WebSocket transient presence | Redis/channel layer | Reconstructable, not official academic history |
| AI provider output | Domain-owned result/artifact record | Provider is not the product system of record |
| Analytics | Derived read models or query layer | Must retain lineage to source records |

### 14.2 Relational integrity

The database should enforce where practical:

- Unique identity fields.
- Unique enrollment per classroom and student.
- Unique completion per assignment and student.
- Valid foreign-key relationships.
- Valid active-state transitions through service logic.
- Indexes for owner, classroom, scope, status, due date, and updated timestamp.

Application logic must still enforce authorization and complex business rules; database constraints are not a substitute for permission checks.

### 14.3 Soft-delete architecture

The existing project rules favor a shared `SoftDeleteModel` and active-object managers. The architecture should preserve:

- Normal queries return active records.
- Administrative or audit queries use an explicit all-objects path.
- Delete actions record inactive state and deletion metadata.
- Restore is an explicit permission-controlled action.
- Related records have documented behavior when a parent is deleted.
- Hard deletion is reserved for approved retention or privacy operations and must not be assumed by ordinary `DELETE` endpoints.

### 14.4 Transactions

Use transactions for:

- Account activation and hierarchy assignment.
- Classroom creation with initial enrollment where applicable.
- Assignment publication when related state changes together.
- Completion creation or update.
- Soft-delete and related audit history.
- Job creation followed by enqueue coordination.

Keep external provider calls outside long database transactions. Persist the intent or job first, call the provider, and update the result with explicit failure handling.

## 15. Storage Architecture

### 15.1 Storage boundary

The repository includes local media and upload paths plus storage service modules. All file-producing or file-consuming domains should use a storage adapter rather than directly constructing filesystem paths.

```text
Domain service
  -> storage adapter
  -> local filesystem in development
  -> approved object or Supabase-compatible storage in deployment
```

### 15.2 File metadata

For every uploaded or generated file, store or derive:

- Owner and authorization scope.
- Source domain and related record.
- Storage key.
- Original display name, safely encoded.
- MIME type and detected type.
- Size.
- Checksum where useful.
- Created timestamp.
- Processing state.
- Retention and deletion state.

### 15.3 File safety

File validation, upload limits, filename handling, malware or content scanning, and private download authorization are security concerns documented in `SECURITY.md`. No frontend should receive an unrestricted storage path when a signed or authorized download mechanism is required.

## 16. AI Integration Architecture

### 16.1 Provider boundary

The existing `backend/services/groq_service.py` indicates a provider adapter approach. AI providers must remain behind a service boundary:

```text
Domain app
  -> AI use-case service
  -> provider adapter
  -> Groq or future provider
  -> normalized result or provider error
```

A domain app should not import an SDK throughout views, serializers, and models.

### 16.2 AI rules

- Prompts are assembled by a domain-owned use case.
- Sensitive content is minimized and redacted before provider calls.
- Generated output is stored with provenance when it becomes user-visible or operationally important.
- AI output is not an official grade, attendance fact, or academic record without human review.
- Provider failure is observable and returns a meaningful status.
- Rate limits, cost, timeout, and retry policy are explicit.
- AI-generated files and narratives are linked to the source request and requesting user.

The foundation notes release should not send personal note content to an AI provider unless a separate product and security decision approves it.

## 17. Deployment Architecture

### 17.1 Local and preview topology

The existing `docker-compose.yml` defines:

- PostgreSQL 16 container.
- Redis 7 container.
- Django backend served by Daphne on port 8000.
- Celery worker.
- `eduai` on port 5175.
- `edugames` on port 5174.
- `teacherbuddy` on port 5173.
- Persistent volumes for database, Redis, media, uploads, and local uploads.

```text
Developer browser
   | 5173 / 5174 / 5175
   v
Vite portal containers
   | /api and WebSocket proxy
   v
Daphne backend :8000
   |                    \
   v                     v
PostgreSQL :5432       Redis :6379
                            |
                            +--> Channels layer
                            +--> Celery broker/results
                                      |
                                      v
                                Celery worker
```

### 17.2 Production topology

The production deployment should preserve logical roles while allowing managed services:

```text
Users
  -> HTTPS edge or load balancer
  -> static frontend hosting or portal containers
  -> API and WebSocket routing
  -> ASGI application replicas
  -> PostgreSQL managed database
  -> Redis managed service
  -> Celery worker replicas
  -> private object storage
  -> external identity and AI providers
```

The edge must support WebSocket upgrade and route WebSocket traffic to ASGI-capable instances. A WSGI-only deployment is insufficient for live features.

### 17.3 Configuration

Environment-specific configuration must provide:

- Django secret and debug state.
- Allowed hosts and CORS origins.
- Database URL.
- Redis URL.
- JWT or session settings.
- Google OAuth identifiers and secret where used.
- AI provider key.
- Storage credentials and bucket configuration.
- Frontend API and WebSocket base URLs.
- Celery broker and result settings.
- Logging, tracing, and error-reporting configuration.

Secrets must not be committed to the repository or embedded in frontend bundles.

### 17.4 Deployment order

For a compatible release:

1. Provision or verify database, Redis, storage, and secret configuration.
2. Apply backward-compatible database migrations.
3. Deploy backend and ASGI workers.
4. Deploy Celery workers and scheduled tasks.
5. Deploy frontends with compatible API configuration.
6. Run health, readiness, and smoke checks.
7. Enable feature flags or traffic gradually.
8. Monitor errors, latency, queues, database health, and user outcomes.

## 18. Observability Architecture

### 18.1 Correlation

Every user-impacting request or job should be traceable through a request or correlation ID. Where safe, carry the identifier through:

- Frontend action.
- HTTP request.
- Domain service.
- Database or task operation.
- Provider call.
- WebSocket event.
- User-visible error.

Do not put access tokens or private note content in correlation metadata.

### 18.2 Logs

Use structured logs for:

- Authentication outcome.
- Permission denial.
- Domain mutation outcome.
- Queue enqueue, start, retry, and failure.
- WebSocket connect, disconnect, command rejection, and fallback.
- Storage upload and download outcome.
- Provider latency and failure category.

Logs should include role and safe scope identifiers when necessary for diagnosis, but must redact secrets and sensitive academic content.

### 18.3 Metrics

At minimum:

- HTTP request volume, latency, and error rate.
- Login and onboarding success/failure.
- Note create, update, delete, and conflict outcomes.
- Assignment creation, publication, visibility, and completion outcomes.
- Duplicate or idempotent request rate.
- WebSocket connections, reconnects, fallback polling, and rejected commands.
- Celery queue depth, age, retries, and failures.
- Database, Redis, storage, and provider health.
- Frontend crashes and route-level errors.

### 18.4 Health checks

Health endpoints should distinguish:

- Process is alive.
- Application is ready to serve.
- Database is reachable.
- Redis is reachable when required.
- Worker or queue is operational where the deployment depends on it.

A health response must not expose credentials or internal topology unnecessarily.

## 19. Failure and Recovery Architecture

### 19.1 HTTP failure

- Normalize backend errors.
- Preserve safe user input in forms.
- Do not claim a mutation succeeded until the server confirms it.
- Use bounded retries only for safe or idempotent operations.
- Provide a request ID for support.

### 19.2 Database failure

- Fail closed for writes.
- Do not partially report a successful academic mutation.
- Roll back transactions.
- Alert operations.
- Retry only where the operation is safe and the transaction has ended.

### 19.3 Redis failure

- WebSocket and queue behavior must degrade visibly.
- Critical academic state remains in PostgreSQL.
- Do not use transient presence or channel state as the source of official history.
- Queue-dependent workflows show pending or unavailable state rather than fabricated completion.

### 19.4 External provider failure

- Store request intent and provider status where the action is user-visible.
- Return `502` or `503` where appropriate.
- Provide retry or support guidance.
- Avoid infinite retries and repeated charges.

### 19.5 Browser disconnect

- Preserve local form input where privacy allows.
- Reconcile after reconnect.
- Distinguish unconfirmed from confirmed mutation.
- Prevent duplicate completion, submission, or game commands.

## 20. Security Architecture Boundaries

Detailed controls belong in `SECURITY.md`, but the architecture requires these boundaries:

- Browser is an untrusted client.
- API authentication identifies the actor but does not by itself authorize every object.
- Domain services enforce ownership, enrollment, campus, classroom, and role scope.
- Database queries must be scoped before serialization.
- WebSocket connections are authenticated and commands are authorized.
- Storage downloads are authorized independently of frontend visibility.
- Worker tasks validate ownership and job state rather than trusting serialized client input.
- Provider secrets exist only in server-side configuration.
- Administrative operations are audited.

## 21. Testing Architecture

The architecture must be testable at each boundary.

### 21.1 Unit tests

- Permission predicates.
- Scope selectors.
- State transitions.
- Serializers and validators.
- Idempotency logic.
- API error normalization.
- Frontend reducers, hooks, and pure utilities.

### 21.2 Integration tests

- Authenticated API requests.
- Database relationships and constraints.
- Account onboarding.
- Note ownership and soft deletion.
- Assignment publication and enrollment scope.
- Completion creation and duplicate requests.
- Storage adapters and task boundaries.

### 21.3 Contract tests

- REST request and response shapes.
- Error status and error body.
- Versioned route behavior.
- WebSocket command, event, snapshot, and error messages.
- Frontend API client compatibility.

### 21.4 End-to-end tests

- Account activation and login.
- Role-aware portal routing.
- Note create, edit, and delete.
- Teacher assignment creation and publication.
- Student assignment completion.
- Logout, expiry, unauthorized access, and network failure recovery.

## 22. Architectural Rules

1. UI components must not contain database or provider logic.
2. Backend views must not become the home for large domain workflows.
3. Database operations belong in the owning domain or an explicitly named service.
4. Authentication identifies the actor; authorization decides the action.
5. All object and academic-scope checks run server-side.
6. New APIs use `/api/v1/` and documented response semantics.
7. Legacy routes are compatibility surfaces, not places for new behavior.
8. A client-provided user, owner, campus, or student ID is never trusted for authorization.
9. Completion, submission, grade, and feedback remain separate concepts.
10. A WebSocket command is not a confirmed event until the server accepts it.
11. REST fallback and WebSocket paths share domain rules.
12. Critical writes are transactional and retry-safe.
13. User-visible background work has a durable status.
14. External providers are called through adapters.
15. Private data is excluded from logs and analytics by default.
16. Soft deletion and restore behavior is explicit and consistent.
17. Shared frontend components remain domain-agnostic.
18. Frontend state is reconciled from server responses after mutation.
19. Timers, listeners, polling, sockets, and tasks are cleaned up.
20. Every architectural change that affects a boundary is recorded in `DECISIONS.md`.
21. Every requirement is traceable to code, tests, and release evidence.
22. A shortcut that weakens privacy, authorization, data integrity, or observability requires explicit risk acceptance.

## 23. Recommended Implementation Sequence

The architecture should be implemented in dependency order:

1. Confirm the authentication and onboarding contract.
2. Confirm institution and classroom scope selectors.
3. Establish the shared frontend HTTP client and error shape.
4. Add the notes bounded context with ownership and soft-delete rules.
5. Stabilize assignment creation, publication, and completion as separate states.
6. Add contract and end-to-end coverage across teacher and student portals.
7. Add observability for the new workflows.
8. Complete security review and preview deployment.
9. Add real-time or asynchronous extensions only where the product requires them.
10. Migrate legacy aliases or incomplete behavior through explicit decisions.

Do not begin with a frontend-only notes page that stores business state locally. Do not implement assignment completion as an unverified client toggle. Do not add WebSocket UI behavior before the ASGI and backend consumer path is operational.

## 24. Migration and Compatibility Strategy

EduAI currently exposes a mixture of versioned and legacy URL patterns and has features at different migration stages. The architecture should support incremental change:

### Expand

- Add the new model, endpoint, event, or service without removing the old behavior.
- Keep data writes compatible with both representations where necessary.

### Migrate

- Move consumers to the canonical `/api/v1/` contract.
- Backfill or reconcile data with validation reports.
- Compare old and new behavior for representative scenarios.

### Contract verification

- Run frontend builds and API contract tests.
- Run authorization and data-integrity tests.
- Compare important response fields and state transitions.
- Verify logs, metrics, and support workflows.

### Contract removal

- Record deprecation and owner.
- Notify consumers.
- Measure remaining traffic.
- Remove only after an approved migration window and rollback plan.

## 25. Architecture Decision Checklist

Before approving a change, answer:

- Which bounded context owns this behavior?
- Does the change add a new source of truth?
- Which users, campuses, classrooms, or records can it affect?
- Is the operation synchronous, asynchronous, or real-time?
- What is authoritative state?
- What happens on retry, timeout, reconnect, and duplicate request?
- What data is logged, stored, exported, or sent to a provider?
- What are the API and event contracts?
- How are old clients supported?
- What tests prove authorization and data integrity?
- How will operators detect and recover from failure?
- Does the change require an ADR, migration, feature flag, or rollback plan?

## 26. Handoff to Other Documents

- `PRD.md` defines what and why.
- `ARCHITECTURE.md` defines how the system is divided and connected.
- `DESIGN.md` should define the visual and interaction system for these architecture boundaries.
- `TEST_PLAN.md` should map requirements and boundaries to executable validation.
- `SECURITY.md` should define concrete controls for identity, authorization, data, files, providers, and operations.
- `DECISIONS.md` should record permanent choices such as note visibility, token storage, completion semantics, WebSocket adoption, and soft-delete behavior.
- `MEMORY.md` should record current implementation state and the next active task.

## 27. Final Architectural Principle

The platform should be modular in code, explicit in authority, durable in data, predictable in the browser, and observable in production. A portal may present the experience, but the owning backend domain decides whether the action is valid. A provider may generate content or carry a message, but it does not become the system of record. A client may request a transition, but only confirmed server state becomes EduAI truth.
