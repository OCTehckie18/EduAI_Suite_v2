# EduAI Suite v2 Product and Engineering Lifecycle

## Purpose

This document defines a complete, evidence-driven path from an initial idea to a monitored production product and the next iteration. It is written for EduAI Suite v2, not for a generic software project. It connects product discovery, educational outcomes, architecture, design, implementation, security, deployment, quality assurance, and operational learning into one repeatable system.

The lifecycle is intentionally gated. Each stage has a purpose, questions to answer, artifacts to produce, decision criteria, and a handoff to the next stage. A team may move quickly through a stage when the evidence is already strong, but it should not silently skip the decision that stage owns.

## Repository Context

Codebase-memory analysis of the indexed `D-EduAI_Suite_v2` project reports:

- 2,416 indexed nodes and 6,906 relationships.
- 173 Python files and 121 TypeScript files, plus CSS, JavaScript, HTML, and YAML.
- A Django and Django REST Framework backend in `backend/`.
- Three Vite and React frontends:
  - `apps/teacherbuddy`: teacher portal.
  - `apps/edugames`: student learning and games portal.
  - `apps/eduai`: master administration portal.
- Backend packages and infrastructure for Django, DRF, PostgreSQL-compatible database configuration, Redis, Django Channels, Daphne, Celery, Groq, Google authentication, file processing, and storage.
- REST routes for health, authentication-related workflows, classrooms, enrollment, exams, appointments, lessons, calendar, mail, reports, and other academic features.
- WebSocket paths for live quiz and interactive learning experiences.
- Existing graph entry points for student dashboards, authentication, analytics, exams, games, AI chat, classroom workflows, and game synchronization.
- Existing migration and application tests, including authentication and dashboard route checks.

This structure means product decisions must account for role-based workflows, privacy-sensitive educational records, asynchronous AI and document processing, live classroom interactions, multiple web clients, and backend/frontend contract compatibility.

## Current Known Risk Register

The repository memory contains a prior FastAPI-to-Django gap audit. Its load-bearing risks should influence discovery, prioritization, and release gates:

- Mail filtering currently contains a hardcoded or non-functional path.
- Trello synchronization lacks some creator and permission protections and orphan cleanup.
- AI report generation and related report workflows are incomplete compared with the earlier implementation.
- Slido file upload validation is incomplete.
- Some analytics and engagement values are synthetic rather than sourced from a real attendance model.
- AI chat failure paths may return HTTP 200 responses containing error text instead of meaningful error status codes.
- Exam score semantics changed from raw points to percentages and require a migration decision.
- Posted lesson update/delete protections are incomplete.
- OpenCV OMR workflows, exports, manual verification, and uncertainty tracking are incomplete.
- Some Slido word-cloud, grading, session-control, Q&A, and WebSocket workflows are incomplete.
- Google Calendar OAuth and synchronization are incomplete.
- Some exam import, document extraction, and attempt-resumption flows are incomplete.
- Assignment submission progress recalculation and analytics bulk import behavior need explicit validation.
- Game flows need validation for missing students and minimum player counts.

These are not merely implementation tickets. They are evidence that the lifecycle must include behavioral parity checks, data-trust checks, authorization testing, and explicit product decisions about which legacy behavior remains part of the product contract.

## Lifecycle Overview

```text
IDEA
  -> RESEARCH
  -> DEFINE THE USER
  -> PRD
  -> CHOOSE TECH STACK
  -> ARCHITECTURE
  -> DESIGN
  -> PROJECT RULES
  -> TASK BREAKDOWN
  -> SETUP
  -> DEVELOPMENT
  -> TESTING
  -> SECURITY REVIEW
  -> CODE REVIEW
  -> PREVIEW DEPLOYMENT
  -> QA TESTING
  -> PRODUCTION DEPLOY
  -> MONITORING
  -> ITERATION
```

The arrows are not only chronological. They are feedback links:

- Research can invalidate an idea.
- User definition can change the PRD.
- Architecture can constrain design and scope.
- Testing and security can send work back to development.
- Preview and QA can block production deployment.
- Monitoring turns production behavior into research for the next iteration.

## 1. IDEA

### Objective - Idea

Turn an observed educational problem or opportunity into a concise, testable problem statement without prematurely deciding the feature or technology.

## Questions

- What educational or administrative problem exists?
- Who experiences it, and how often?
- What is the cost of leaving it unresolved?
- Is the problem about learning outcomes, teacher workload, institutional governance, student engagement, data visibility, or operational reliability?
- What evidence already exists?
- What is the smallest useful outcome that could prove or disprove the idea?

## EduAI Application

An idea should be expressed in educational terms before it becomes a screen or endpoint. Examples:

- Teachers need a reliable way to run live, turn-based classroom activities without losing state when a student's WebSocket connection fails.
- Students need immediate, understandable feedback on assessments while preserving a trustworthy attempt history.
- Campus administrators need cross-campus visibility without exposing records outside their authority boundary.
- Teachers need AI-generated lesson or report assistance, but the generated material must be reviewable and must not silently fabricate attendance or performance data.

The graph shows existing surfaces for games, analytics, reports, AI chat, classrooms, exams, and administration. A new idea must state whether it extends one of these surfaces, replaces a legacy behavior, or creates a new bounded capability.

## Required Artifact: Idea Brief

The idea brief should contain:

1. Problem statement.
2. Target outcome.
3. Suspected users.
4. Evidence and source of evidence.
5. Constraints, including privacy, campus policy, academic integrity, and integration constraints.
6. Non-goals.
7. Smallest experiment.
8. Decision date and decision owner.

### Exit Gate - Idea

Proceed only when the team can state the problem without naming a solution. Reject, defer, or revise the idea when the problem is anecdotal, the user is unknown, or success cannot be observed.

## 2. RESEARCH

### Objective - Research

Replace assumptions with evidence from users, existing behavior, comparable products, data, and the current codebase.

## Research Streams

### User and domain research

- Interview teachers, students, campus administrators, and support staff.
- Observe the current workflow in a real class or administrative setting.
- Record workarounds, delays, failure recovery, and trust concerns.
- Identify differences between campuses, departments, programs, batches, and sections.
- Capture accessibility, device, network, language, and timetable constraints.

### Product research

- Compare existing EduAI behavior with the desired workflow.
- Identify legacy behavior that users depend on, even if it is inconvenient.
- Separate parity requirements from intentional redesign.
- Measure the time and error rate of the existing workflow.

### Codebase research

Use codebase-memory to answer structural questions before changing code:

- What modules define the capability?
- Which routes and frontend entry points expose it?
- Which functions are high fan-in or high fan-out?
- What services, models, storage systems, queues, or WebSockets does it touch?
- Which tests already cover the behavior?
- Which frontends consume the API contract?
- What is the impact radius of a change?

For this repository, useful anchors include the three frontend `App` entry points, feature pages under `apps/*/src/features`, API clients under `src/shared/utils`, Django apps under `backend/apps`, service modules under `backend/services`, and the ASGI/Celery configuration under `backend/config`.

### Data research

- Identify the system of record for every metric.
- Distinguish observed data from derived data and generated content.
- Document data freshness, missingness, correction, retention, and audit requirements.
- Explicitly investigate any synthetic or fallback values.

This is essential for analytics. A dashboard must not represent fabricated attendance or engagement values as institutional fact.

## Research Artifact

Produce a research brief with:

- Research questions.
- Participants and sample rationale.
- Observations and direct quotes where permitted.
- Current-state workflow.
- Pain points and frequency.
- Alternatives considered.
- Codebase evidence.
- Data lineage.
- Risks and unanswered questions.
- Evidence confidence: high, medium, or low.

### Exit Gate - Research

Research is sufficient when the team can describe the current workflow, the user cost, the desired outcome, and the constraints with evidence. Any major unknown becomes an explicit PRD assumption or discovery task; it must not remain hidden.

## 3. DEFINE THE USER

### Objective - Define the User

Define the people, roles, permissions, context, and success conditions for whom the product is being built.

## EduAI Personas

### Student

Needs predictable access to classrooms, lessons, assignments, exams, games, analytics, appointments, and feedback. May use a low-powered device or unstable network. Needs clear recovery when a live session disconnects. Must only see records permitted by identity, enrollment, section, and institutional policy.

### Teacher

Needs efficient classroom management, lesson and assignment workflows, live activities, assessment, reports, analytics, appointments, announcements, mail, and planning tools. Needs to review AI output and correct records. Must not be forced to understand backend state or retry logic.

### Campus or institutional administrator

Needs scoped oversight, approvals, dashboards, user and hierarchy management, and operational controls. Needs cross-campus views only where explicitly authorized.

### Master administrator

Needs governance across campuses, soft-delete recovery, system health, auditability, configuration, and exception handling. This role has high privilege and therefore requires stronger authorization, logging, and approval controls.

### Support or operations user

Needs diagnostics, health information, deployment status, error correlation, and safe remediation without broad access to student content.

### Developer and reviewer

Needs local setup, reproducible tests, stable contracts, graph-based impact analysis, and clear ownership boundaries.

## Persona Template

For every persona define:

- Goals.
- Jobs to be done.
- Trigger and frequency.
- Context and device.
- Permissions and forbidden actions.
- Data visible and data editable.
- Failure tolerance.
- Accessibility requirements.
- Success metric.
- Representative scenario.

## Permission Matrix

Create a matrix for every feature:

| Action | Student | Teacher | Campus Admin | Master Admin | Support |
| --- | ---: | ---: | ---: | ---: | ---: |
| View own record | Yes | Yes | Yes | Yes | Limited |
| View enrolled classroom | Yes | Yes | Scoped | Yes | No by default |
| Edit academic content | No | Own/scoped | Scoped | Yes by policy | No |
| Restore soft-deleted record | No | No | Scoped approval | Yes | No |
| View raw operational logs | No | No | No | Limited | Scoped |

The matrix is a starting point. It must be replaced with feature-specific decisions before implementation.

### Exit Gate - Define the User

No feature enters the PRD without an identified primary user, secondary users, authority boundary, and failure-recovery expectation.

## 4. PRD

### Objective - PRD

Convert research into an agreed product contract that can be designed, implemented, tested, and measured.

## PRD Structure

### Product summary

State the user problem, intended outcome, and why now.

### Goals and non-goals

Goals must describe user or institutional outcomes. Non-goals protect the team from uncontrolled expansion.

### User stories and scenarios

Use scenario form:

> Given a teacher owns a classroom, when the teacher starts a live game, then enrolled students can join, turns are authoritative on the server, and a temporary connection loss can recover without duplicating a submission.

### Functional requirements

Requirements should have stable IDs, for example `REQ-GAME-001`. Each requirement should include:

- Actor.
- Preconditions.
- Action.
- Expected result.
- Error behavior.
- Authorization rule.
- Data changes.
- Event or notification behavior.
- Acceptance criteria.

### Non-functional requirements

Specify:

- Performance and latency.
- Availability and recovery.
- Accessibility.
- Privacy and retention.
- Security.
- Observability.
- Compatibility.
- Localization.
- Data correctness.

### Contract requirements

Document REST request and response schemas, status codes, WebSocket message types, authentication behavior, idempotency, pagination, filtering, upload constraints, and versioning.

### AI requirements

For every AI feature define:

- Input data allowed.
- Data that must be excluded or redacted.
- Model and provider assumptions.
- Prompt ownership.
- Grounding sources.
- Human review requirement.
- Fallback behavior.
- Failure status codes.
- Audit trail.
- Cost and rate limits.
- Evaluation set.

### Data requirements

Define source of truth, ownership, validation, migrations, correction workflow, retention, export, and deletion or soft-delete semantics.

### Product Metrics

Define leading and outcome metrics. Examples:

- Live game join completion rate.
- WebSocket recovery rate.
- Duplicate submission rate.
- Teacher preparation time.
- Assignment feedback turnaround.
- AI suggestion acceptance and correction rate.
- Assessment completion rate.
- Analytics data freshness.
- Support incidents per active classroom.

### Exit Gate - PRD

The PRD is ready when every requirement has acceptance criteria, the permission matrix is explicit, data lineage is known, and unresolved decisions are labeled rather than implied.

## 5. CHOOSE TECH STACK

### Objective - Choose Tech Stack

Choose tools based on product constraints and existing system boundaries, not fashion or isolated developer preference.

## Existing Stack

The repository currently aligns around:

- React 19, TypeScript, Vite, Tailwind CSS, and shared frontend utilities.
- Django 5.1 and Django REST Framework.
- PostgreSQL-compatible production database configuration with SQLite development fallback.
- Redis and Django Channels for live communication.
- Daphne or another ASGI server for HTTP and WebSocket support.
- Celery for background work.
- Groq-backed services for selected AI workflows.
- Google authentication integrations.
- File processing libraries such as Pillow, PyPDF2, document generation, and spreadsheet workflows.
- Local and Supabase-style storage services.

## Selection Criteria

For each proposed technology score:

- Fit with user and domain constraints.
- Fit with existing repository conventions.
- Security and privacy posture.
- Operational maturity.
- Team familiarity.
- Migration cost.
- Testability.
- Performance and scale.
- Failure modes.
- Vendor lock-in.
- Total cost.

## Decision Rules

- Reuse an existing stack when it meets the requirement and reduces operational surface.
- Introduce a new dependency only with a clear capability gap and an owner.
- Prefer standard protocols and typed contracts at service boundaries.
- Keep AI providers behind a service abstraction so model changes do not leak through every feature.
- Treat WebSocket, queue, storage, and AI provider dependencies as failure-prone external boundaries.
- Make local development possible without production secrets.

## Stack Decision Record

Every meaningful choice should record:

- Decision.
- Alternatives.
- Evaluation criteria.
- Evidence.
- Consequences.
- Rollback or replacement path.
- Owner.

### Exit Gate - Choose Tech Stack

The stack is selected when the team can explain why it fits the PRD, how it will be operated, how it will be tested, and what happens when each external dependency fails.

## 6. ARCHITECTURE

### Objective - Architecture

Define component boundaries, data ownership, runtime flows, contracts, and failure handling before implementation spreads across the repository.

## Current Architectural Shape

The codebase is a multi-frontend, modular Django application:

```text
Student browser                 Teacher browser                 Admin browser
      |                               |                              |
 apps/edugames                 apps/teacherbuddy                 apps/eduai
      |                               |                              |
      +----------------------- REST API -----------------------------+
                              |
                         backend/config
                              |
       +----------------------+----------------------+----------------+
       |                      |                      |                |
  Django apps           Services             PostgreSQL/SQLite      Redis
       |                      |                      |                |
  academic domains      Groq/storage         durable records       Channels
                                                                    |
                                                               WebSockets
                              |
                            Celery
                         background work
```

This diagram is conceptual. The architecture document must use actual routes, imports, calls, and deployment configuration as the source of truth.

## Required Architecture Views

### Context view

Users, browsers, backend, identity providers, AI providers, storage, database, cache, queues, and monitoring.

### Container view

Each frontend, Django application group, service layer, worker, WebSocket consumer, database, cache, and storage system.

### Component view

For each feature, identify pages, stores, API clients, serializers, views, domain services, models, tasks, consumers, and events.

### Data-flow view

Show where identity, classroom membership, submissions, grades, attendance, AI prompts, generated files, and audit records travel.

### Runtime view

Describe HTTP request flow, WebSocket connection flow, background job flow, retry behavior, timeout behavior, and deployment topology.

### Security view

Show trust boundaries, token issuance, role checks, tenant or campus scoping, file validation, provider secrets, and administrative operations.

## Architectural Rules for EduAI

- The backend is authoritative for grades, attempts, enrollment, game state, permissions, and audit-sensitive records.
- The frontend may provide optimistic interaction, but must reconcile with server state.
- WebSocket messages must be validated, authorized, versioned where needed, and safe to replay or reject.
- REST fallback must not silently create behavior different from WebSocket behavior.
- Synthetic values must never be presented as observed institutional data.
- Background work must expose status and failure state rather than appearing to succeed instantly.
- Soft-delete and restore behavior must be consistent across models and administrator tools.
- API clients must centralize authentication, base URLs, error normalization, and response typing.
- Feature modules should have a clear owner and avoid importing across unrelated domains.

## Architecture Validation with Codebase Memory

Before changing a shared function or API:

1. Search the graph for its definition.
2. Inspect inbound and outbound relationships.
3. Identify frontend and backend consumers.
4. Inspect tests and routes connected to it.
5. Classify the change as local, cross-module, cross-frontend, or cross-service.
6. Add or update contract and regression tests before broad refactoring.

### Exit Gate - Architecture

Architecture is ready when component ownership, data ownership, contracts, failure modes, and deployment dependencies are documented and reviewed by the developers who will operate them.

## 7. DESIGN

### Objective - Design

Turn requirements and architecture into accessible, understandable, resilient user experiences.

## Design Principles

- Design around the real classroom or administrative task, not around database entities.
- Make role and scope visible without exposing sensitive information.
- Use clear status language for loading, queued, live, completed, failed, and partially saved states.
- Preserve user work during network loss or navigation.
- Use progressive disclosure for complex administration.
- Make AI output reviewable, editable, attributable, and distinguishable from verified records.
- Use accessible color contrast, keyboard navigation, focus states, readable type, and screen-reader labels.
- Keep dense operational views scannable; avoid decorative UI that hides status or action.
- Treat mobile and low-bandwidth use as first-class constraints for students and teachers.

## Core Flows to Design

### Authentication and onboarding

Google or password entry, profile completion, role selection where permitted, hierarchy assignment, approval or waiting state, token expiration, and sign-out.

### Classroom workflow

Teacher creates or opens a classroom, enrolls students, shares an enrollment code or file workflow, posts material, receives work, and reviews progress.

### Live game workflow

Create session, join, lobby, start, turn state, word or answer submission, validation error, disconnect, reconnect, polling fallback if supported, end session, and results.

### Assessment workflow

Author or import assessment, publish, student attempt, autosave, submit, score, review, and correction or regrade policy.

### AI workflow

Provide context, submit request, show queued or generating state, present output with sources or context, edit and approve, retry failure, and report incorrect content.

### Administrative workflow

View scoped metrics, inspect record, restore soft-deleted entity, audit action, and handle authorization failure.

## Design Deliverables

- User-flow diagrams.
- Wireframes.
- High-fidelity screens.
- Responsive states.
- Component states.
- Content and error copy.
- Accessibility annotations.
- Design tokens.
- Prototype test script.
- Mapping from screens to API and WebSocket contracts.

### Exit Gate - Design

Design is ready when a user can complete the happy path and recover from likely failures without developer knowledge. Every loading, empty, unauthorized, offline, validation, and server-error state must have a designed outcome.

## 8. PROJECT RULES

### Objective - Project Rules

Create explicit engineering rules that make quality repeatable across three frontends, Django apps, workers, and operational environments.

## Required Rule Categories

### Source control

- Use small, descriptive branches.
- Keep commits focused and reviewable.
- Do not commit secrets, generated credentials, local databases, or personal uploads.
- Record migrations and contract changes with the implementation.

### Python and Django

- Keep domain logic out of oversized views where a service or domain function is clearer.
- Validate permissions server-side for every object and action.
- Preserve soft-delete rules and make restore operations explicit.
- Use transactions for related writes.
- Return meaningful HTTP status codes.
- Add tests for serializers, permissions, views, services, and migrations where behavior is non-trivial.

### TypeScript and React

- Keep API and WebSocket payloads typed.
- Centralize API configuration and authentication behavior.
- Avoid stale callback and subscription state in hooks.
- Clean up timers, sockets, listeners, and background work on unmount.
- Model loading, error, empty, and partial states explicitly.
- Do not duplicate business rules in multiple frontends.

### Contracts

- Version breaking changes.
- Document status codes and error shapes.
- Prefer idempotent operations for retries.
- Define WebSocket message names and payloads as a stable protocol.
- Add consumer tests for shared contracts.

### Data and privacy

- Classify fields by sensitivity.
- Minimize data in logs and AI prompts.
- Retain academic records according to policy.
- Audit privileged changes.
- Use soft-delete only where it matches legal and product requirements; do not confuse hiding a record with erasing it.

### AI

- Keep prompts and provider calls observable without logging sensitive content.
- Store provenance and model metadata where appropriate.
- Never treat generated content as verified academic fact without human review.
- Make provider failure and rate limiting visible to users.

### Operations

- Health endpoints must represent meaningful dependencies.
- Every background task needs retry, timeout, and dead-letter or manual recovery behavior.
- Every critical user journey needs a metric and correlated logs.

### Exit Gate - Project Rules

Rules are ready when a developer can answer how to name, test, secure, log, deploy, and review a change without relying on tribal knowledge.

## 9. TASK BREAKDOWN

### Objective - Task Breakdown

Convert the PRD and architecture into independently verifiable work with dependency-aware sequencing.

## Decomposition Method

Break work into vertical slices that produce user-visible or operationally verifiable value. Avoid splitting only by file type.

A good slice contains:

- Requirement IDs.
- User scenario.
- Frontend work.
- Backend work.
- Data or migration work.
- Contract changes.
- Tests.
- Observability.
- Security considerations.
- Rollout and rollback notes.

## Example: Reliable Live Game Session

1. Define session and participant invariants.
2. Define REST and WebSocket messages.
3. Add server-side join and authorization checks.
4. Persist authoritative game state.
5. Implement frontend connection state and reconciliation.
6. Add reconnect and fallback behavior.
7. Add duplicate submission protection.
8. Add unit, integration, contract, and browser tests.
9. Add metrics for connect, reconnect, fallback, and rejected messages.
10. Release behind a controlled flag if risk is high.

## Dependency Rules

- Schema and contract decisions precede dependent frontend implementation.
- Authentication and permission work precede protected features.
- Storage and queue setup precede asynchronous document or AI flows.
- Observability is part of the feature task, not a later cleanup.
- Migration and rollback tasks are explicit.
- Security review tasks are attached to sensitive features.

## Task Definition of Done

A task is not done when code compiles. It is done when:

- The requirement is traceable.
- Tests cover intended behavior and important failure behavior.
- Permissions are verified.
- Data migrations are safe.
- Logs and metrics exist for important failures.
- Documentation and contract examples are updated.
- Review findings are resolved.

## 10. SETUP

### Objective - Setup

Make development reproducible on a clean machine and ensure dependencies are available before feature work begins.

## Backend Setup

From `backend/`:

```bash
pip install -r requirements.txt
python manage.py check
python manage.py migrate
python manage.py test apps.core
```

Configure environment variables without committing them. At minimum, define database, JWT or authentication, Google OAuth, Redis, Celery, storage, CORS, and AI provider settings according to the active settings modules.

## Frontend Setup

For each frontend:

```bash
cd apps/eduai
npm install
npm run build

cd ../teacherbuddy
npm install
npm run build

cd ../edugames
npm install
npm run build
```

Use the repository's package scripts as the source of truth. Do not assume that a command available in one app exists in another.

## Local Infrastructure

Use `docker-compose.yml` to provide shared services where appropriate. Verify:

- Database connectivity.
- Redis connectivity.
- HTTP backend startup.
- ASGI and WebSocket startup.
- Celery worker connectivity.
- Frontend proxy and API base URL behavior.
- File upload and storage behavior.

## Setup Verification Checklist

- A new developer can install dependencies without undocumented steps.
- Health endpoint responds.
- Migrations apply from an empty database.
- Seed data is safe and clearly non-production.
- Each portal can authenticate in a development environment.
- A representative classroom and live-game journey can be exercised locally.
- Test commands run without production credentials.

## 11. DEVELOPMENT

### Objective - Development

Implement vertical slices while preserving contracts, user intent, and operational visibility.

## Development Loop

1. Read the requirement and acceptance criteria.
2. Use codebase-memory to locate the controlling implementation and callers.
3. State a falsifiable hypothesis about the change.
4. Make the smallest focused edit.
5. Run the narrowest useful test immediately.
6. Add or update regression tests.
7. Validate API, database, and frontend behavior together where the change crosses boundaries.
8. Update docs, metrics, and rollout notes.

## Backend Development

- Keep serializers responsible for representation and validation appropriate to the boundary.
- Keep authorization close to the action being protected.
- Use transaction boundaries for multi-record state changes.
- Make asynchronous work return a durable status.
- Validate uploaded content by size, type, signature, and business rules.
- Preserve error semantics across services.

## Frontend Development

- Treat server state as authoritative.
- Use typed API clients and explicit error states.
- Ensure hooks clean up WebSockets, polling, intervals, and timeouts.
- Reconcile updates rather than blindly appending duplicate events.
- Keep fallback modes behaviorally consistent.
- Verify responsive layouts and keyboard access.

## Live and Asynchronous Development

For game and classroom real-time paths:

- Define message ownership and ordering.
- Decide whether messages are commands, events, or snapshots.
- Use server-generated IDs and timestamps when deduplication matters.
- Test initial state, join, reconnect, invalid command, timeout, turn skip, end, and fallback polling.
- Ensure cleanup cannot trigger reconnect after a component unmounts.

For AI and document paths:

- Use queues for work that may exceed request timeouts.
- Persist request status and failure reason.
- Bound retries and provider calls.
- Keep generated artifacts linked to the requesting user and source records.

## 12. TESTING

### Objective - Testing

Demonstrate that the software satisfies requirements, protects data, handles failure, and remains compatible across frontend and backend boundaries.

## Test Pyramid

### Unit tests

Test pure functions, serializers, validators, permission predicates, reducers, data transformations, and service logic.

### Integration tests

Test Django views with database state, authentication, object ownership, storage, queue boundaries, and provider adapters.

### Contract tests

Test REST response shape, status codes, pagination, error schemas, and WebSocket message contracts against frontend consumers.

### End-to-end tests

Exercise authentication, onboarding, classroom access, assignment submission, assessment attempt, live game, AI request, and administration flows in a preview-like environment.

### Resilience tests

Test expired tokens, disconnected sockets, Redis failure, provider timeout, duplicate requests, stale clients, missing files, invalid uploads, partial background jobs, and database transaction rollback.

### Accessibility tests

Test keyboard navigation, focus order, screen-reader names, contrast, form errors, reduced motion, zoom, and responsive layouts.

## Required Regression Areas from Current Audit

- Mail filtering must use real filters and test input variations.
- Trello synchronization must enforce creator or role permissions and remove or reconcile orphan records.
- Reports must distinguish queued generation, successful generation, and provider failure.
- Slido uploads must reject invalid signatures and oversized files.
- Analytics must test lineage and reject fabricated attendance as a source of truth.
- AI chat must return correct error statuses for configuration, provider, and empty-result failures.
- Exam scores must have an explicit raw-points or percentage contract and migration tests.
- Posted lesson edit/delete restrictions must be tested.
- OMR, Calendar, Slido, exam imports, assignment progress, and game validation need feature-specific coverage as they are implemented.

## Test Evidence

Every release candidate should produce:

- Command and environment.
- Commit or build identifier.
- Test count and result.
- Known failures and disposition.
- Browser and device coverage.
- Performance evidence where relevant.
- Security scan results.
- Screenshots or recordings for critical UX changes.

## 13. SECURITY REVIEW

### Objective - Security Review

Find and resolve ways the product could expose data, misuse privileges, lose integrity, or become unavailable.

## Review Areas

### Identity and authentication

- Token issuance, storage, expiry, rotation, and revocation.
- Google token verification and email-domain rules.
- Password policy and reset behavior.
- Onboarding state and pending users.
- Session invalidation after role or permission changes.

### Authorization

- Object-level ownership.
- Campus, school, department, program, batch, section, and classroom scoping.
- Teacher access to only owned or assigned resources.
- Student access to only enrolled resources and own attempts.
- Master administrator actions, restore, export, and audit controls.
- WebSocket authorization on connect and every command.

### Input and file security

- Request size limits.
- File type, signature, extension, and content validation.
- Archive and decompression limits.
- Spreadsheet formula injection.
- PDF and document parser isolation.
- Prompt injection through uploaded or imported educational content.
- Output encoding and HTML sanitization.

### Data protection

- Secrets in environment or secret manager only.
- TLS for production connections.
- Encryption and access control for sensitive storage.
- Redaction in logs and AI prompts.
- Retention, export, correction, and soft-delete policy.
- Audit trail for privileged actions and grade changes.

### Dependency and supply chain

- Pin or constrain dependencies appropriately.
- Run vulnerability scanning.
- Review transitive packages.
- Verify container base images.
- Keep build and deployment credentials scoped.

### Availability and abuse

- Rate-limit login, AI, uploads, and live-session commands.
- Bound expensive operations.
- Protect Redis and WebSocket capacity.
- Add idempotency to retry-prone commands.
- Define recovery for queue and provider failures.

## Security Exit Gate

No production release proceeds with an unresolved critical or high-risk issue without a documented risk acceptance from the accountable owner. Security review must include evidence from tests and configuration, not only a checklist.

## 14. CODE REVIEW

### Objective - Code Review

Have a second engineer validate correctness, maintainability, security, and compatibility before deployment.

## Review Order

1. Behavioral bugs and regressions.
2. Authorization and data exposure.
3. Data integrity and migration safety.
4. API and WebSocket contract compatibility.
5. Error handling and failure recovery.
6. Test completeness.
7. Performance and operational behavior.
8. Readability and consistency.

## Reviewer Questions

- Does the change control the actual behavior, or only a forwarding layer?
- Are all callers and consumers accounted for?
- Can a retry duplicate a write?
- Can a stale client overwrite newer state?
- Are status codes and error payloads meaningful?
- Does the change preserve campus and role boundaries?
- Does it handle empty, unauthorized, offline, timeout, and provider-failure states?
- Do tests fail for the old behavior and pass for the new behavior?
- Are migrations reversible or safely forward-only with a recovery plan?
- Does the change create logs or metrics that help operate it?

## Review Output

Each finding should include severity, location, observed behavior, impact, and a concrete fix. Findings should be resolved or explicitly accepted. A review summary should state residual risk and test gaps.

## 15. PREVIEW DEPLOYMENT

### Objective - Preview Deployment

Deploy a production-like build where integrated behavior can be tested without affecting production users or records.

## Preview Requirements

- Separate database or isolated tenant data.
- Separate storage bucket or namespace.
- Non-production AI credentials with budget limits.
- Sanitized or synthetic seed data.
- HTTPS and secure WebSocket configuration.
- Correct CORS and frontend environment configuration.
- Migrations applied by an explicit step.
- Worker, scheduler, Redis, ASGI, and HTTP processes running.
- Logging and metrics enabled.
- Feature flags or access allowlist available.

## Preview Smoke Tests

- Health and readiness endpoints.
- Login and logout.
- Onboarding and role routing.
- Classroom creation and access.
- File upload validation.
- Assignment or assessment submission.
- Live game join, update, disconnect, reconnect, and end.
- AI request success and provider failure.
- Admin scoped view and restore behavior.

### Exit Gate - Preview Deployment

Preview is acceptable when deployment is reproducible, core workflows work through real boundaries, and failures are diagnosable from logs and user-visible status.

## 16. QA TESTING

### Objective - QA Testing

Validate the integrated product against real user scenarios, devices, data conditions, and acceptance criteria.

## QA Matrix

Cover combinations of:

- Student, teacher, campus admin, master admin.
- Healthy network, slow network, disconnect, reconnect.
- Desktop, tablet, mobile, keyboard-only, assistive technology.
- Empty, small, typical, large, and malformed datasets.
- New user, returning user, incomplete profile, revoked access.
- SQLite development-like environment and production database behavior where differences matter.
- REST and WebSocket paths.
- AI configured, rate-limited, unavailable, and returning invalid or empty output.

## Scenario-Based QA

QA scripts should be written as user tasks, not implementation checks. Each script records preconditions, actions, expected results, observed results, evidence, severity, and retest status.

## Release Blocking Defects

Block release for:

- Unauthorized data access or privilege escalation.
- Incorrect grades, attempts, attendance, or report facts.
- Data loss or duplicate writes.
- Broken authentication or onboarding.
- Live session corruption.
- Inability to recover from expected provider or network failure.
- Critical accessibility failures.
- Unbounded security or operational risk.

## 17. PRODUCTION DEPLOY

### Objective - Production Deploy

Release safely, observably, and reversibly to real users.

## Release Plan

1. Confirm approved build, migrations, configuration, and artifacts.
2. Confirm backups and restore procedure.
3. Apply backward-compatible migrations before code that depends on them.
4. Deploy workers and WebSocket-capable services with compatible versions.
5. Deploy backend and frontend assets.
6. Run health and smoke checks.
7. Enable the feature gradually where possible.
8. Monitor error, latency, data, and adoption signals.
9. Communicate release notes and known limitations.
10. Keep rollback or mitigation instructions available.

## Migration Safety

For data changes:

- Separate schema expansion, data backfill, and constraint enforcement when necessary.
- Make old and new application versions coexist during rollout if deployment is rolling.
- Back up before destructive or irreversible operations.
- Verify row counts, invariants, and representative records after migration.
- Treat score-semantic changes and synthetic-to-real analytics changes as product and data migrations, not routine deploys.

## Production Checklist

- Secrets loaded from approved mechanism.
- Debug disabled.
- Allowed hosts and CORS restricted.
- HTTPS and secure cookies configured.
- Database backups verified.
- Redis and worker capacity checked.
- Logs do not contain sensitive payloads.
- Error tracking and alert routing tested.
- Support and rollback owners identified.

## 18. MONITORING

### Objective - Monitoring

Detect failures, understand user impact, protect data quality, and measure whether the product achieves its intended outcome.

## Observability Layers

### Logs

Use structured logs with request, user role, campus scope, feature, correlation ID, status, duration, and outcome. Redact tokens, passwords, student content, and sensitive AI prompts.

### Operational and Product Metrics

Track:

- Request count, latency, and error rate by route.
- Authentication success and failure.
- Permission denials.
- WebSocket connections, disconnects, reconnects, fallback polling, and message rejection.
- Queue depth, task age, retries, and failures.
- AI latency, provider errors, token or cost estimates, and human correction rate.
- Upload rejection reasons and processing duration.
- Database and Redis health.
- Frontend crash and route error rates.
- Educational outcome metrics defined in the PRD.

### Traces

Trace requests across frontend action, API route, database query, queue task, provider call, storage operation, and notification or WebSocket event where instrumentation supports it.

### Data quality monitors

- Attendance source freshness.
- Grade totals and range invariants.
- Duplicate submissions.
- Missing classroom membership.
- Orphaned Trello or related records.
- Failed report generation.
- Mismatched game state and event history.
- Synthetic or fallback values appearing in production dashboards.

## Alerts

Alerts should be actionable and tied to an owner. Define thresholds, severity, runbook, escalation, and suppression behavior. Avoid alerting on every transient client disconnect; alert on user-impacting rates or sustained infrastructure failure.

## Operational Runbooks

Maintain runbooks for:

- Authentication outage.
- Database migration failure.
- Redis or WebSocket outage.
- Queue backlog.
- AI provider outage or cost spike.
- Storage outage.
- Data-quality anomaly.
- Unauthorized access incident.
- Rollback and restore.

## 19. ITERATION

### Objective - Iteration

Use production evidence and user feedback to improve outcomes while preserving trust and system stability.

## Feedback Loop

1. Collect qualitative feedback from students, teachers, administrators, and support.
2. Review product metrics and operational incidents together.
3. Segment findings by role, campus, course, device, and network condition.
4. Identify whether the problem is product value, usability, reliability, data correctness, or discoverability.
5. Update the research brief and PRD.
6. Prioritize by educational impact, user reach, risk, confidence, and effort.
7. Convert the next slice into tasks with tests and observability.
8. Re-run the lifecycle gates affected by the change.

## Iteration Questions

- Did the feature improve the intended educational or administrative outcome?
- Which users benefited, and which users were harmed or excluded?
- Are users bypassing the feature or creating workarounds?
- Did support volume change?
- Are AI outputs accepted, corrected, or ignored?
- Are analytics trusted and traceable to real records?
- Did the change increase operational cost or failure rate?
- Is a legacy behavior still required, or can it be retired safely?

## Prioritized EduAI Iteration Themes

Based on the existing repository audit, high-value iteration themes include:

- Restore trustworthy analytics from real attendance and academic sources.
- Complete security and behavioral parity for mail, Trello, uploads, lessons, games, and AI chat.
- Finish critical OMR, Slido, Calendar, exam import, and report workflows with explicit acceptance criteria.
- Improve live-session resilience and contract testing across `edugames` and `teacherbuddy`.
- Finish the Django JWT and onboarding integration consistently across all portals.
- Add operational dashboards for queues, WebSockets, AI calls, storage, and data quality.

## Cross-Stage Governance

## Requirement Traceability

Maintain a chain from idea to evidence:

```text
Idea brief
  -> research finding
  -> user/persona
  -> PRD requirement
  -> architecture decision
  -> design flow
  -> task
  -> code change
  -> test evidence
  -> release evidence
  -> production metric
  -> iteration decision
```

Every requirement should be traceable in both directions. A production incident should be traceable back to the requirement and test that failed to protect it.

## Decision Records

Use short decision records for changes involving:

- API or WebSocket contracts.
- Authentication or authorization.
- Database schema and score semantics.
- AI provider, prompt, model, or data policy.
- Storage and retention.
- New infrastructure or dependency.
- Migration, deprecation, or rollback strategy.

## Definition of Ready

A slice is ready for development when:

- User and business outcome are clear.
- Requirements and non-goals are written.
- Permissions and data lineage are known.
- Design covers success and failure states.
- Architecture and contracts are agreed.
- Test approach and observability are defined.
- Dependencies and migration risks are understood.

## Definition of Done

A slice is done when:

- Code is implemented and reviewed.
- Unit, integration, contract, and relevant end-to-end tests pass.
- Security and privacy checks pass.
- Documentation and configuration are updated.
- Metrics and logs are available.
- Preview validation passes.
- QA signs off the intended scenarios.
- Rollout and rollback steps are documented.

## Recommended Repository Documents

Keep these artifacts under `docs/` or link to their authoritative location:

- Product idea briefs.
- Research briefs.
- Persona and permission matrix.
- PRDs and requirement catalog.
- Architecture decision records.
- API and WebSocket contracts.
- Design specifications and accessibility notes.
- Project rules and contribution guide.
- Test strategy and release evidence.
- Threat model and security review.
- Preview and production runbooks.
- Monitoring dashboard definitions.
- Incident reports and iteration decisions.

## Final Principle

EduAI Suite is an educational system, not only a collection of screens and endpoints. The lifecycle must protect learning outcomes, academic record integrity, user privacy, teacher time, and institutional trust at every stage. The strongest implementation is the one whose behavior is understandable before release, testable during release, observable after release, and easy to improve without losing the truth of the underlying data.
