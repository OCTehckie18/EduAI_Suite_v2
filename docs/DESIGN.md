# EduAI Suite v2 Product Design System

**Document status:** Design baseline for product and engineering review  
**Product:** EduAI Suite v2  
**Primary release:** Academic workspace foundation  
**Last updated:** 2026-09-20  
**Source requirements:** [docs/PRD.md](docs/PRD.md)  
**Architecture reference:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
**Design owner:** Product design and frontend engineering

## 1. Purpose

This document defines the visual language, interaction rules, information architecture, responsive behavior, component contracts, and state design for EduAI Suite v2.

EduAI is an operational academic product. Its interfaces must help students, teachers, administrators, and support users repeatedly complete real work: authenticate, understand what requires attention, create or review content, complete assignments, and recover safely when something fails.

The design system therefore favors:

- Clear hierarchy over decorative complexity.
- Fast scanning over oversized marketing composition.
- A recognizable academic blue and gold identity with varied semantic colors.
- Dense but breathable work surfaces.
- Predictable actions and status vocabulary.
- Server-confirmed feedback for academic state.
- Strong keyboard, touch, contrast, and screen-reader behavior.
- Role-specific navigation without three unrelated visual products.

This document defines the intended design direction. Existing implementation details that differ from it are recorded in [section 23](#23-current-implementation-and-convergence-plan) rather than treated as already complete.

## 2. Design Position

### 2.1 Product character

EduAI should feel like a capable academic operations desk: focused, warm, and trustworthy. It should be more human than an enterprise administration console, but more structured than a consumer notes app.

The interface should communicate:

- **Orientation:** The user knows where they are, which academic scope they are viewing, and what is currently selected.
- **Momentum:** The next useful action is visible without turning every screen into a call to action.
- **Trust:** Saved, pending, failed, private, completed, and graded states are visually distinct.
- **Respect:** Personal notes and academic records do not look like interchangeable content.
- **Calm under pressure:** Errors explain what happened and what can be done next.

### 2.2 What the design is not

- It is not a public marketing landing page.
- It is not a glassmorphism showcase where blur reduces readability.
- It is not a dark-only developer dashboard.
- It is not a card grid where every control is placed in a floating container.
- It is not a purple gradient theme.
- It is not a decorative layer that hides missing product states.

### 2.3 Current visual foundation

The existing portals already use:

- Tailwind CSS 4.
- Inter for body text.
- Poppins for display and section headings.
- Christ University-inspired blue and gold tokens.
- React, TypeScript, Lucide React, and Framer Motion.
- TanStack React Query in the teacher and student portals.
- Zustand for selected client state.
- CSS utilities such as `glass-card`, `btn-primary`, `form-input`, and status badges.

The target system keeps the brand recognition while reducing excessive gradients, large rounded surfaces, ambiguous glass panels, and inconsistent portal-specific treatment.

## 3. Design Principles

1. **Show the work first.** The first viewport of a signed-in portal should expose current academic work, not a decorative welcome panel.
2. **One primary action per surface.** A page may contain secondary actions, but its visual hierarchy must make the next important action obvious.
3. **State is content.** Loading, empty, pending, failed, completed, deleted, and unavailable states receive intentional layouts and language.
4. **Server truth wins.** A UI may show an optimistic transition only when it clearly distinguishes pending from confirmed.
5. **Scope is visible.** Campus, classroom, course, and role context appear near the page title or navigation context.
6. **Private means private.** Personal notes use clear ownership language and do not visually imply classroom sharing.
7. **Actions are reversible when possible.** Delete is soft delete, restore is explicit, and destructive actions require a clear confirmation boundary.
8. **Accessible information is not hidden in color.** Every status combines color with text, icon, or shape.
9. **Density is deliberate.** Use compact rows for comparison and generous spacing for authoring or reflection.
10. **Motion supports orientation.** Animate changes in state or location, not every hover or static card.
11. **Responsive does not mean shrunken.** Desktop information architecture is adapted for touch and narrow screens rather than scaled down.
12. **Shared language builds trust.** The same status means the same thing in every portal.

## 4. Users and Design Priorities

| User | Primary surfaces | Design priority |
| --- | --- | --- |
| Student | Dashboard, classrooms, assignments, notes, games | Clarity, low-bandwidth resilience, mobile touch, saved-state confidence |
| Teacher | Dashboard, classrooms, assignment authoring, completion review | Scanning, comparison, efficient authoring, scope clarity |
| Campus administrator | User and campus views, support, aggregate status | Dense data, filters, safe privileged actions, audit context |
| Master administrator | Cross-campus governance, recycle bin, health | Scope switching, risk visibility, recoverable actions, auditability |
| Support or operations | Diagnostics and failure states | Request IDs, safe error context, redaction, reproducibility |

## 5. Brand Direction

### 5.1 Visual idea

**Structured academic warmth.** Use a light neutral canvas, deep ink text, academic blue for navigation and primary actions, restrained gold for emphasis and institutional identity, and distinct semantic colors for workflow state.

The brand should feel established without becoming formal or old-fashioned. Rounded geometry is useful for approachable education surfaces, but the system should use small radii and clear edges for work density.

### 5.2 Logo and identity

- The EduAI mark appears in the authenticated shell header or sidebar.
- Portal identity is expressed through a small role label such as `Teacher workspace`, `Student workspace`, or `Administration`.
- Do not place large logos above the actual work on authenticated pages.
- Do not use the gold accent as a large background field behind body text.
- The logo must have a monochrome fallback for print, reduced motion, and low-bandwidth contexts.

### 5.3 Visual balance

Use blue to orient and act, gold to identify and highlight, neutral surfaces to carry content, and semantic colors only for state. No single hue should dominate every component.

## 6. Color System

### 6.1 Core tokens

The following tokens extend the existing repository palette. Values are recommendations for the converged system and may be adjusted after contrast verification.

```css
:root {
  --color-brand-blue-950: #12234f;
  --color-brand-blue-900: #1c3570;
  --color-brand-blue-700: #264796;
  --color-brand-blue-600: #3460c4;
  --color-brand-blue-100: #e8edf8;
  --color-brand-blue-050: #f4f7fd;

  --color-brand-gold-700: #8f6d24;
  --color-brand-gold-600: #b8943e;
  --color-brand-gold-500: #d0ae61;
  --color-brand-gold-100: #fdf6e3;

  --color-neutral-950: #0f172a;
  --color-neutral-800: #1e293b;
  --color-neutral-700: #334155;
  --color-neutral-600: #475569;
  --color-neutral-500: #64748b;
  --color-neutral-300: #cbd5e1;
  --color-neutral-200: #e2e8f0;
  --color-neutral-100: #f1f5f9;
  --color-neutral-050: #f8fafc;
  --color-white: #ffffff;

  --color-success-700: #166534;
  --color-success-100: #dcfce7;
  --color-warning-700: #92400e;
  --color-warning-100: #fef3c7;
  --color-danger-700: #b91c1c;
  --color-danger-100: #fee2e2;
  --color-info-700: #1d4ed8;
  --color-info-100: #dbeafe;
  --color-purple-700: #6b21a8;
  --color-purple-100: #f3e8ff;

  --color-focus: #1d4ed8;
  --color-overlay: rgb(15 23 42 / 0.48);
}
```

### 6.2 Semantic roles

| Token role | Default value | Use |
| --- | --- | --- |
| `surface-page` | `neutral-050` | Portal background and page floor |
| `surface-panel` | `white` | Main work region and forms |
| `surface-subtle` | `neutral-100` | Input backgrounds, secondary regions |
| `surface-brand` | `brand-blue-900` | Sidebar, authenticated shell anchor |
| `surface-brand-soft` | `brand-blue-050` | Selected navigation and contextual callouts |
| `text-primary` | `neutral-950` | Headings and essential content |
| `text-secondary` | `neutral-600` | Supporting descriptions and metadata |
| `text-muted` | `neutral-500` | Timestamps and low-priority metadata |
| `border-default` | `neutral-200` | Dividers and input boundaries |
| `border-strong` | `neutral-300` | Table and panel boundaries |
| `action-primary` | `brand-blue-700` | Main submit, save, publish, and navigation actions |
| `action-primary-hover` | `brand-blue-900` | Hover and focus-visible emphasis |
| `action-secondary` | `white` with blue border | Secondary action |
| `action-accent` | `brand-gold-600` | Institutional highlight, not general submit |

### 6.3 State colors

| State | Foreground | Background | Meaning |
| --- | --- | --- | --- |
| Success | `success-700` | `success-100` | Confirmed and complete |
| Warning | `warning-700` | `warning-100` | Needs attention, due soon, or partial |
| Danger | `danger-700` | `danger-100` | Failed, blocked, destructive, or invalid |
| Information | `info-700` | `info-100` | Neutral system information |
| Draft | `neutral-700` | `neutral-100` | Not published or not final |
| Pending | `brand-blue-900` | `brand-blue-100` | Processing or awaiting confirmation |
| Private | `purple-700` | `purple-100` | User-owned or restricted visibility |

Status colors must always appear with a label or accessible name. Never communicate `Completed` only by turning a checkbox green.

### 6.4 Contrast requirements

- Body text must meet WCAG AA contrast against its surface.
- Large text and icons must meet the appropriate large-text contrast requirement.
- Blue and gold combinations must be checked independently; gold is not a substitute for readable text.
- Placeholder text must remain readable enough to identify expected input without becoming the main label.
- Focus indicators must be visible on both light and dark surfaces.
- Charts must use patterns, labels, or direct values in addition to color.

## 7. Typography

### 7.1 Font families

The current portals use Inter and Poppins. Keep this pairing for continuity:

- **Poppins:** display headings, portal page titles, prominent numbers, and short section labels.
- **Inter:** body copy, form labels, navigation, table content, helper text, buttons, and status text.

Use a local or approved fallback in production where possible. Google-hosted font loading must not block the first useful paint or expose a privacy concern that has not been reviewed.

### 7.2 Type scale

The scale is fixed by breakpoint rather than fluidly scaled with viewport width.

| Token | Size | Weight | Line height | Use |
| --- | ---: | ---: | ---: | --- |
| `display-lg` | 36px | 700 | 1.12 | Login welcome or rare top-level context |
| `display-md` | 30px | 700 | 1.18 | Portal page title |
| `heading-lg` | 24px | 700 | 1.25 | Major section heading |
| `heading-md` | 20px | 700 | 1.3 | Card or panel heading |
| `heading-sm` | 17px | 700 | 1.35 | Compact group title |
| `body-lg` | 16px | 400 | 1.5 | Introductory and instructional copy |
| `body-md` | 14px | 400 | 1.5 | Default product content |
| `body-sm` | 13px | 400 | 1.45 | Dense metadata and table content |
| `label` | 12px | 600 | 1.35 | Form labels and status labels |
| `overline` | 11px | 700 | 1.3 | Context markers; use sparingly |
| `numeric-lg` | 32px | 700 | 1.0 | Dashboard statistics |

Do not use negative letter spacing. Do not use uppercase for long sentences. Use sentence case for buttons, navigation, form labels, and status messages.

### 7.3 Heading rules

- Every page has one visible `h1`.
- Heading text names the work surface, such as `Assignments`, `Personal notes`, or `Classroom overview`.
- Do not use a large heading to describe a feature before showing the feature.
- Headings wrap naturally on mobile; they must not overlap action buttons.
- Page titles may be accompanied by one short scope line, not a paragraph of marketing copy.

## 8. Layout System

### 8.1 Page frame

```text
Desktop:
+---------------- sidebar 248px ----------------+
|                                                |
|  +------------- header 64px ----------------+ |
|  | breadcrumb / scope      profile / alerts | |
|  +-------------------------------------------+ |
|  |                                           | |
|  |  page content, max width 1440px           | |
|  |                                           | |
+--+-------------------------------------------+-+

Mobile:
+-----------------------------+
| menu | page title | profile |
+-----------------------------+
| scope and page content      |
|                             |
| bottom or drawer navigation |
+-----------------------------+
```

### 8.2 Containers

- Full shell content: `max-width: 1440px` with `24px` horizontal padding on desktop.
- Reading and authoring content: `max-width: 760px`.
- Data tables and management views: use the available width, with a minimum safe table width and horizontal scrolling when necessary.
- Dashboard grids: `12` columns at wide desktop, `6` at tablet, and `1` at mobile.
- Do not center narrow operational content in excessive empty space when a two-column detail layout would improve scanning.

### 8.3 Spacing scale

Use a 4px base unit:

| Token | Value | Typical use |
| --- | ---: | --- |
| `space-1` | 4px | Icon-to-label micro gap |
| `space-2` | 8px | Compact control padding |
| `space-3` | 12px | Row and label spacing |
| `space-4` | 16px | Default component padding |
| `space-5` | 20px | Group separation |
| `space-6` | 24px | Panel padding and page gaps |
| `space-8` | 32px | Major region separation |
| `space-10` | 40px | Form section separation |
| `space-12` | 48px | Page-level breathing room |
| `space-16` | 64px | Authentication and rare empty states |

Use consistent spacing rather than one-off margins. Dense tables may use 12px vertical row padding; authoring forms may use 20px to 24px.

### 8.4 Radius and borders

The target system uses compact geometry:

| Token | Value | Use |
| --- | ---: | --- |
| `radius-none` | 0px | Tables and full-bleed sections |
| `radius-sm` | 4px | Tags, compact fields, small controls |
| `radius-md` | 6px | Buttons, inputs, cards, dialogs |
| `radius-lg` | 8px | Main panels and grouped work surfaces |
| `radius-pill` | 999px | Status badges and segmented controls only where appropriate |

Cards should not exceed 8px radius. Avoid nesting a card inside another card unless the inner surface is an actual repeated record or dialog.

### 8.5 Elevation

Use borders and placement before shadows.

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | Page canvas with no shadow | Background and section bands |
| Panel | White surface, 1px border | Forms, tables, detail regions |
| Raised | Panel plus `0 4px 14px rgb(15 23 42 / 0.08)` | Menus, popovers, active drag surface |
| Modal | Overlay plus raised surface | Confirmation and focused workflows |

Do not use blur behind essential text. A translucent surface may be used only when contrast and performance are verified.

## 9. Authenticated Shell

### 9.1 Desktop sidebar

The sidebar is the primary orientation anchor for desktop users.

Contents from top to bottom:

1. EduAI mark and portal role label.
2. Current campus or institution selector when the user has more than one scope.
3. Primary navigation grouped by work type.
4. A small support or help entry.
5. User profile and logout at the bottom.

Navigation groups should be short and stable. Recommended groups:

- **Workspace:** Overview, My notes, Assignments.
- **Teaching or learning:** Classrooms, Lessons, Quizzes, Games, Exams.
- **Operations:** Calendar, Mail, Reports, Analytics.
- **Administration:** Users, Institution, Recycle bin, Audit.

Only show groups appropriate to the role. Do not hide an item only because the current network request has not completed; use a loading state for permission-dependent navigation.

### 9.2 Sidebar behavior

- Width: 248px expanded, 72px collapsed on desktop.
- Collapsed mode uses icons with tooltips and an accessible text label.
- Active navigation has a left accent rule and a subtle blue-tinted background, not a heavy glow.
- The active item is determined by route, not by click-only local state.
- On mobile, the sidebar becomes a drawer opened by a menu button.
- The drawer traps focus while open and closes on Escape.

### 9.3 Header

The header contains:

- Breadcrumb or section context.
- Current scope indicator when not obvious from the page title.
- Search only where the current portal has a real search contract.
- Notifications or task alerts when implemented.
- Profile menu with account state and logout.

The header must not become a second navigation bar full of duplicated links.

### 9.4 Scope indicator

A scope indicator uses compact text such as:

```text
Christ University / School of Engineering / CSE-A
```

On narrow screens, show the immediate scope and make the full hierarchy available in a popover or detail sheet. Scope changes require confirmation when they would alter the data set on screen.

## 10. Portal Designs

### 10.1 Student portal

The student portal should prioritize current work and reduce cognitive load.

First viewport order:

1. Page title and current academic period.
2. Progress or attention summary, limited to actionable facts.
3. `Due soon` or `Continue learning` list.
4. Recent classrooms or learning spaces.
5. Personal notes shortcut and recent notes.

Student home should not be a grid of equal visual cards. Use one main work list plus smaller supporting regions.

Recommended navigation:

- Overview
- My assignments
- My notes
- Classrooms
- Lessons
- Quizzes and exams
- Games
- Calendar
- AI help, when enabled

### 10.2 Teacher portal

The teacher portal should prioritize teaching work, assignment authoring, and status review.

First viewport order:

1. Page title and active classroom scope.
2. `Needs attention` row for overdue, pending review, or failed operations.
3. Assignment and classroom work list.
4. Completion summary by class.
5. Recent lessons, announcements, or appointments.

Recommended navigation:

- Overview
- Classrooms
- Assignments
- Lessons
- Quizzes and exams
- Games and live sessions
- Calendar and appointments
- Reports and analytics
- Mail

### 10.3 Master admin portal

The administration portal should optimize for controlled oversight.

First viewport order:

1. Scope selector and role label.
2. System and campus health summary.
3. Pending approvals or operational issues.
4. User and institution management shortcuts.
5. Recent administrative actions or audit events.

Admin pages may be denser than student pages, but each high-privilege action needs clear scope, confirmation, and audit context.

### 10.4 Portal continuity

The three portals share:

- Authentication language.
- Token and session behavior.
- Color roles and status semantics.
- Form controls and validation.
- Toast and inline error behavior.
- Navigation geometry.
- Empty, loading, and offline patterns.

They may differ in density, navigation items, and data visualizations because the users' work differs.

## 11. Authentication and Onboarding Design

### 11.1 Auth layout

Authentication is a focused single-column workflow with a quiet institutional context.

```text
+---------------------------------------------------------+
| EduAI mark                                               |
|                                                         |
|                +--------------------------+             |
|                | Sign in                  |             |
|                | account method           |             |
|                | fields                   |             |
|                | primary action           |             |
|                | alternate method         |             |
|                | support / policy links  |             |
|                +--------------------------+             |
|                                                         |
| institution and support context                         |
+---------------------------------------------------------+
```

Do not show a marketing hero, feature list, or decorative illustration before the login form. The user is trying to enter a work system.

### 11.2 Login controls

- Google sign-in button uses the official provider mark and explicit label.
- Password fallback uses a visible label, show/hide control, and safe error message.
- Submit button indicates progress and becomes disabled only while the same request is pending.
- Errors appear near the relevant field and in a summary region for screen readers.
- The page distinguishes invalid credentials, unavailable provider, pending approval, and suspended account.
- The user can recover from an expired session without losing non-sensitive form context.

### 11.3 Account creation and onboarding

Onboarding is a stepper only when the process has multiple real stages. Each step shows:

- Current step name.
- Completed steps.
- Required versus optional fields.
- Save or continue state.
- A way to return without losing validated information.

Academic hierarchy inputs should be dependent selectors. A user must not select a section before the campus, school, program, and batch choices are valid.

### 11.4 Auth state vocabulary

| State | User-facing treatment |
| --- | --- |
| Verifying identity | Progress indicator with a plain-language message |
| Profile incomplete | Focused onboarding panel; protected content remains unavailable |
| Pending approval | Waiting state with support route and request reference if available |
| Authenticated | Redirect to role-appropriate portal |
| Suspended or denied | Clear access message without revealing unnecessary policy details |
| Session expired | Inline or modal re-auth prompt; preserve safe local work |

## 12. Notes Design

### 12.1 Notes list

The notes list is an authoring and retrieval surface, not a decorative card wall.

Desktop composition:

```text
+ page title + New note ----------------------------------+
| search | sort | ownership filter                        |
+--------------------------+------------------------------+
| note list rows           | selected note preview        |
| title                    | title and saved state       |
| context                  | body or read-only preview   |
| updated                  | edit / delete actions       |
+--------------------------+------------------------------+
```

Mobile composition:

- List view first.
- Selecting a note opens a full-screen detail or editor.
- The back control returns to the note list and preserves scroll position.

Each note row shows only the metadata needed to choose it:

- Title.
- Short preview, safely truncated.
- Updated time.
- Ownership or visibility label.
- Academic context when attached.
- Saved, pending, or conflict indicator.

### 12.2 Note editor

The editor should be deliberately quiet:

- Title input at the top.
- Optional context selector below the title.
- Main body field with a comfortable reading width.
- Save state near the title or action row.
- Secondary actions in a menu on narrow screens.
- Delete in a separated danger action area.

The editor must distinguish:

- `Unsaved changes`.
- `Saving`.
- `Saved just now`.
- `Save failed`.
- `Conflict: this note changed elsewhere`.

Do not auto-delete on navigation. If a user leaves with unsaved changes, use a confirmation that names the consequence.

### 12.3 Note visibility

The initial note UI should say `Private note` or `Only you` when appropriate. It should not show classroom member icons or sharing affordances until shared notes are actually supported.

If a note has academic context, use a compact context chip such as `CSE-A / Data Structures`. The chip provides context but does not imply that classmates or teachers can read the note.

### 12.4 Note deletion

Delete is a soft-delete action:

1. User selects `Delete note`.
2. Dialog names the note and explains that it will leave the active list.
3. User confirms.
4. Server response confirms deletion.
5. The list removes the note and offers a short `Undo` only if the backend supports an immediate restore operation.
6. Failure leaves the note visible and explains that nothing was deleted.

Avoid a destructive red primary button when a neutral confirmation action can reduce accidental activation. The final destructive action still uses danger styling and a clear label.

## 13. Assignment Design

### 13.1 Teacher assignment authoring

Assignment creation is a structured form with a clear draft boundary.

Recommended order:

1. Title and concise instructions.
2. Classroom or academic scope.
3. Due date and time zone.
4. Optional attachments or resources.
5. Visibility and publication state.
6. Preview and validation summary.
7. Save draft or publish.

Use a two-column desktop layout only when the form remains readable:

- Main column: title, instructions, resources.
- Side column: scope, dates, state, and actions.

On mobile, use one column with a sticky bottom action bar that does not hide the last form field.

### 13.2 Draft and publish

`Save draft` and `Publish assignment` are separate actions.

- Draft is neutral or secondary.
- Publish is the single primary action after validation.
- Publish confirmation states who will see the assignment and when.
- After publication, the page shows the published timestamp and the eligible scope.
- Editing a published assignment must identify which fields can change without altering student history.

### 13.3 Assignment list

Teacher rows should support comparison:

| Column | Purpose |
| --- | --- |
| Assignment | Title and classroom context |
| State | Draft, published, closed, archived |
| Due | Date, time, and overdue state |
| Completion | Confirmed student completion count |
| Updated | Last change |
| Actions | View, edit, publish, close, archive |

Students see a different projection:

| Field | Purpose |
| --- | --- |
| Assignment | Title and teacher/classroom |
| Due | Clear urgency without relying only on color |
| Status | Not started, in progress, completed, or unavailable |
| Action | View or mark complete |

### 13.4 Mark complete

The completion action must be direct and confirmable:

1. Student opens an eligible assignment.
2. The page shows instructions and current status.
3. Student selects `Mark as complete`.
4. The button enters a pending state.
5. The server validates eligibility and creates or updates one completion record.
6. The page shows `Completed` with the confirmation timestamp.
7. Teacher views reconcile to the confirmed completion state.

The UI must not label this action `Submit` unless a submission record and content transfer actually exist.

### 13.5 Assignment status presentation

Use text plus a small status marker:

- `Draft`: neutral gray.
- `Published`: blue.
- `Due soon`: amber.
- `Overdue`: red, with the date stated.
- `Completed`: green.
- `Submitted`: separate blue or purple state in a later release.
- `Graded`: separate semantic state in a later release.
- `Returned`: amber or purple with explanatory text.
- `Archived`: neutral and visually de-emphasized.

## 14. Component System

### 14.1 Buttons

Button hierarchy:

- **Primary:** one highest-value action per region, blue fill.
- **Secondary:** outlined or white surface, used for alternative action.
- **Tertiary:** text or icon button for low-emphasis navigation.
- **Danger:** red outline or restrained red fill for confirmed destructive action.
- **Icon-only:** familiar symbol, fixed square target, tooltip and accessible label required.

Rules:

- Minimum touch target: 44px by 44px.
- Button labels use verbs: `Create note`, `Save draft`, `Publish assignment`, `Mark as complete`.
- Do not put long explanatory sentences inside buttons.
- A button remains dimensionally stable while its label changes to a spinner or progress state.
- Loading buttons retain an accessible name and do not allow duplicate activation.

### 14.2 Inputs

Every input has:

- Visible label.
- Optional short description.
- Required marker where applicable.
- Validation message associated by ID.
- Focus-visible state.
- Disabled or read-only treatment that remains legible.

Use a textarea for notes and assignment instructions. Do not imitate a text editor with an unlabeled contenteditable region until keyboard, paste, selection, mobile, and screen-reader behavior are tested.

### 14.3 Selectors and comboboxes

- Use native selects for simple short option sets.
- Use a combobox for searchable campus, classroom, or user lists.
- Show loading and no-results states inside the control.
- Do not allow a child hierarchy value to remain selected when its parent changes.
- Preserve selected values only when they remain valid.

### 14.4 Cards and panels

Use cards for:

- Repeated records.
- Dialogs.
- Focused tools.
- Summary metrics with a real comparison value.

Do not put entire page sections inside decorative cards. Use full-width bands and unframed layouts for major areas.

### 14.5 Tables

Tables are appropriate for teacher and administration workflows.

- Use a real table when users compare columns.
- Keep the first column identifiable while horizontally scrolling when appropriate.
- Provide a mobile row or detail presentation when horizontal scrolling would hide essential actions.
- Do not truncate assignment titles without an accessible full value.
- Put row actions in a stable final column or row menu.
- Use pagination or virtualization for large data sets.

### 14.6 Tabs and segmented controls

- Tabs change views at the same hierarchy level.
- Segmented controls change a small mode, such as `List` and `Board`.
- The active state must use text, contrast, and an indicator.
- Tabs must be keyboard navigable and expose the selected state.
- Do not use tabs for unrelated navigation or form steps.

### 14.7 Dialogs and drawers

Use a dialog for confirmation or a small focused task. Use a drawer for contextual details or mobile navigation.

Every dialog needs:

- Descriptive title.
- Clear close action.
- Focus moved into the dialog.
- Focus returned to the invoking control.
- Escape behavior where safe.
- No destructive default focus unless the user explicitly initiated a destructive flow.

### 14.8 Toasts and banners

- Use inline validation for field-specific errors.
- Use an alert banner for page-level failure or important scope information.
- Use a toast for a confirmed, non-blocking result such as `Draft saved`.
- Toasts must not be the only way to learn that a critical academic action failed.
- Do not stack more than three transient messages.
- Provide a visible route to details for background task failures.

### 14.9 Icons

Use Lucide React, already enabled in the portals.

- Use familiar icons for search, menu, close, edit, delete, restore, calendar, filter, download, and external link.
- Pair unfamiliar icons with text on primary actions.
- Icon-only buttons need a tooltip and accessible label.
- Do not use icons as decorative bullets when they could be mistaken for status.
- Keep stroke weight and size consistent within a control group.

## 15. Data Visualization

Charts belong in analytics and administration contexts, not on every dashboard.

Rules:

- State the question the chart answers in its title.
- Show the time period and academic scope.
- Include direct values or an accessible data table.
- Use color plus pattern or label for categories.
- Do not present synthetic or incomplete data as authoritative.
- Mark unavailable, pending, or estimated data explicitly.
- Avoid 3D charts, decorative gauges, and dense unlabeled dashboards.

## 16. Content and Language

### 16.1 Voice

Use language that is:

- Direct.
- Respectful.
- Specific about state.
- Free of blame.
- Short enough to scan.

Prefer:

- `Your draft is saved.`
- `This assignment is not available to your account.`
- `We could not save the note. Your changes are still on this page.`
- `Completed on 20 September 2026 at 10:42.`

Avoid:

- `Oops! Something went wrong.` without an action.
- `You failed to complete this.` when the network failed.
- `Submit` for a completion marker.
- Internal error codes without plain-language context.

### 16.2 Dates and time

- Use the user's locale for display while retaining an explicit time zone where deadlines matter.
- Show relative time only when paired with an exact date in detail views.
- Use `Due today`, `Due tomorrow`, or `Overdue by 2 days` with the actual date available.
- Never silently reinterpret a deadline because the browser and server time zones differ.

### 16.3 Status language

Use one canonical label per state across portals. The label should be a noun or concise adjective, not a sentence.

## 17. Loading, Empty, Error, and Offline States

### 17.1 Loading

- Use skeleton rows for lists and tables when layout is known.
- Use a progress indicator for an action that has started.
- Keep headings and scope visible while the data region loads.
- Do not show a blank white page with a spinner.
- Avoid skeleton animation when reduced motion is enabled.

### 17.2 Empty

An empty state answers:

1. What is empty?
2. Why might it be empty?
3. What is the next useful action?

Examples:

- Notes: `No personal notes yet.` plus `Create note`.
- Teacher assignments: `No assignments in this classroom.` plus `Create assignment`.
- Student assignments: `No assignments are available right now.` without falsely implying an error.
- Filtered list: `No assignments match these filters.` plus `Clear filters`.

### 17.3 Error

Error surfaces include:

- Field error.
- Form summary.
- Page alert.
- Full unavailable state.
- Background task status.

Every recoverable error gives an action such as retry, re-authenticate, clear filters, return, or contact support. Include a request ID when the backend provides one.

### 17.4 Offline and degraded state

The UI must distinguish:

- Browser has no network.
- Server is unavailable.
- Request is pending.
- WebSocket disconnected but REST polling is active.
- Data is stale but still viewable.

For notes and assignments:

- Never present an unconfirmed mutation as saved.
- Preserve safe local input while a save is retryable.
- Tell the user whether retry is automatic or manual.
- Disable only the action that cannot be safely repeated.

## 18. Motion and Interaction Feedback

Motion is functional and restrained.

### 18.1 Approved motion

- Sidebar and mobile drawer enter in 160ms to 220ms.
- Dialogs fade and translate a few pixels, not a large zoom.
- List insertion uses a short opacity and height transition.
- Success confirmation may use a small check transition.
- Page content can use a short stagger only when it improves initial orientation.

### 18.2 Prohibited or discouraged motion

- Infinite floating decorations.
- Large card lifts on every hover.
- Scale transforms that change control dimensions.
- Essential information revealed only through animation.
- Motion that continues after a task is complete.

### 18.3 Reduced motion

Respect `prefers-reduced-motion: reduce`:

- Remove non-essential transitions.
- Keep state changes immediate and visible.
- Do not replace loading information with silence.
- Avoid auto-advancing carousels or animated charts.

## 19. Responsive Behavior

### 19.1 Breakpoints

Use the existing Tailwind breakpoint system unless a measured layout need requires an exception:

| Range | Layout approach |
| --- | --- |
| 0 to 639px | Single column, drawer navigation, full-width primary actions |
| 640 to 767px | Single column with wider form groups and compact two-up metadata |
| 768 to 1023px | Collapsed sidebar or tablet drawer, two-column forms where safe |
| 1024 to 1279px | Expanded sidebar, two-column page regions |
| 1280px and above | Full shell, 12-column grids, comparison-heavy tables |

Do not scale font sizes with viewport width. Use fixed type tokens and responsive layout constraints.

### 19.2 Mobile rules

- Navigation becomes a drawer or bottom navigation only when the number of primary destinations is small.
- Page-level actions remain reachable without scrolling to the top.
- Form actions may become a sticky bottom bar, but the bar must not cover content or keyboard input.
- Cards become rows or full-width sections when repetition is more readable.
- Tables become a detail list or horizontally scrollable region with an explicit cue.
- Modal dialogs become bottom sheets only when the task remains understandable and focus behavior is preserved.
- Long titles and status labels wrap rather than overflow.

### 19.3 Tablet rules

Tablet is a real work context, especially for teachers. Preserve:

- Visible classroom scope.
- Two-column assignment authoring where fields remain readable.
- Touch targets.
- Table comparison through horizontal scrolling or responsive row design.

## 20. Accessibility Contract

### 20.1 Baseline

Target WCAG 2.2 AA for the foundation release.

### 20.2 Keyboard

- All actions are reachable in logical order.
- Focus is visible and not clipped by sticky headers or footers.
- Menus, dialogs, drawers, tabs, and comboboxes follow expected keyboard patterns.
- Escape closes temporary surfaces where safe.
- No keyboard trap outside a deliberately modal surface.

### 20.3 Screen readers

- Use semantic headings, landmarks, lists, tables, labels, and buttons.
- Announce save state and asynchronous results in a polite live region.
- Associate validation messages with their fields.
- Give icon-only controls accessible names.
- Do not use placeholder text as the only label.
- Announce route changes or update the page title as appropriate.

### 20.4 Touch and pointer

- Minimum target size is 44px by 44px.
- Do not require hover to discover essential information.
- Provide a visible alternative to drag-and-drop.
- Avoid controls that depend on precise pointer movement.

### 20.5 Color and content

- Status is never color-only.
- Error messages identify the affected field or operation.
- Charts provide textual values.
- Images and avatars have useful alternative text or are marked decorative.
- Text remains readable at 200 percent zoom without loss of core functionality.

## 21. Design Tokens to Code

The target tokens should be exposed through a shared pattern in each portal's Tailwind theme or a package-level token source when the monorepo strategy supports it.

Recommended semantic names:

```css
:root {
  --ui-surface-page: var(--color-neutral-050);
  --ui-surface-panel: var(--color-white);
  --ui-surface-subtle: var(--color-neutral-100);
  --ui-surface-brand: var(--color-brand-blue-900);
  --ui-text-primary: var(--color-neutral-950);
  --ui-text-secondary: var(--color-neutral-600);
  --ui-text-muted: var(--color-neutral-500);
  --ui-border: var(--color-neutral-200);
  --ui-action-primary: var(--color-brand-blue-700);
  --ui-action-primary-hover: var(--color-brand-blue-900);
  --ui-focus: var(--color-focus);
  --ui-success: var(--color-success-700);
  --ui-warning: var(--color-warning-700);
  --ui-danger: var(--color-danger-700);
}
```

Components should consume semantic tokens rather than hard-coding portal-specific hex values. This makes theme corrections, contrast fixes, and future campus branding safer.

## 22. Design QA Checklist

Before a surface is considered ready:

### Structure

- [ ] The page has one visible `h1`.
- [ ] The current role and academic scope are clear.
- [ ] The primary action is visually distinct and correctly named.
- [ ] The page does not rely on nested decorative cards.
- [ ] The layout remains stable while data and labels load.

### Behavior

- [ ] Loading, empty, error, pending, success, and unavailable states exist.
- [ ] Mutation feedback reflects server confirmation.
- [ ] Destructive actions explain consequence and recovery.
- [ ] Permission denial is understandable without exposing private data.
- [ ] Network failure has a retry or recovery path.

### Responsive

- [ ] The surface works at 320px wide.
- [ ] Long titles and status labels wrap cleanly.
- [ ] No action is hidden under a sticky bar.
- [ ] Tables have a deliberate mobile treatment.
- [ ] Forms remain usable with an on-screen keyboard.

### Accessibility

- [ ] Keyboard order and focus-visible styles are correct.
- [ ] Dialogs and drawers manage focus.
- [ ] Labels and validation messages are programmatically associated.
- [ ] Status is not communicated by color alone.
- [ ] Reduced motion is respected.
- [ ] Contrast and zoom have been checked.

### Technical

- [ ] Icons come from the shared icon library.
- [ ] No new one-off color or spacing scale was introduced.
- [ ] API and state behavior follow [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- [ ] The implementation has focused tests for interaction and failure states.
- [ ] The UI does not imply support for a backend feature that is not available.

## 23. Current Implementation and Convergence Plan

The current codebase is partway toward this design system. The following items should be treated as convergence work, not as reasons to rewrite all portals at once.

### 23.1 Existing strengths

- Shared brand-blue, brand-gold, semantic status, and typography tokens already exist.
- Teacher and student portals have reusable button, badge, input, sidebar, and card utilities.
- Tailwind CSS provides a consistent responsive foundation.
- Lucide React is available for icon consistency.
- Framer Motion is available for purposeful transitions.
- Teacher and student package scripts include build, lint, and Vitest test paths.

### 23.2 Convergence items

- Replace portal-specific hard-coded color values with semantic tokens.
- Reduce large gradients, glass effects, and excessive hover lifts on dense work surfaces.
- Align card radii to the 4px to 8px target range where visual regressions are acceptable.
- Make all portal status labels use the same vocabulary.
- Add explicit loading, empty, offline, and conflict states to notes and assignments.
- Ensure administrative style overrides do not reduce contrast or hide meaning.
- Consolidate duplicated shell, form, status, and error patterns without creating a cross-portal dependency that blocks independent builds.
- Confirm every visible action has a backend capability before exposing it as complete.
- Add responsive and accessibility checks to the frontend test and preview workflow.

### 23.3 Do not change blindly

The following existing behavior needs product or engineering confirmation before a broad visual change:

- Existing Christ University brand colors and institutional identity.
- Portal-specific navigation density.
- Current use of Google Fonts and deployment privacy requirements.
- Legacy screens that still use older utility classes.
- Existing role and route names used by users or support staff.

## 24. Requirement Traceability

| PRD requirement area | Design response |
| --- | --- |
| Account creation and onboarding | Focused auth layout, stepper rules, hierarchy selectors, pending and suspended states |
| Login | Provider and password controls, error distinction, loading, expiry recovery |
| Personal notes | Notes list, editor, private visibility, save states, conflict handling, soft-delete confirmation |
| Teacher assignment creation | Structured authoring layout, draft/publish separation, scope and due-date visibility |
| Student completion | Explicit `Mark as complete` action, pending state, confirmed timestamp, no grade implication |
| Role-aware portals | Shared shell with role-specific navigation and density |
| Server authority | Confirmed-state feedback, permission error patterns, no client-only academic status |
| Accessibility | WCAG 2.2 AA baseline, keyboard, touch, screen-reader, contrast, reduced motion |
| Network resilience | Offline and degraded states, safe retries, preserved form input, WebSocket fallback language |
| Privacy | Personal note ownership language, scoped views, no accidental sharing affordance |

## 25. Open Design Decisions

The following choices should be recorded in `DECISIONS.md` before implementation becomes difficult to change:

1. Whether the master admin portal uses the same shell implementation or a separate administration shell with shared tokens.
2. Whether note editing uses a plain textarea in the foundation release or a richer editor with an accessibility and content model review.
3. Whether mobile navigation uses a drawer or a small bottom navigation set.
4. Whether offline note drafts are persisted in browser storage and what privacy controls apply on shared devices.
5. Which exact Google authentication and password recovery copy is approved for each institution.
6. Whether assignment publication requires a confirmation dialog for every assignment or only for assignments with immediate student visibility.
7. Which analytics data is sufficiently authoritative to display as a dashboard metric.
8. Which provider and font loading approach is acceptable for production privacy, performance, and licensing.
9. Whether the design system should become a shared workspace package or remain synchronized through copied token definitions during the current portal architecture.

## 26. Final Design Standard

EduAI should feel trustworthy because the interface makes reality legible. A user can tell what belongs to them, what belongs to a classroom, what has been saved, what is still processing, what failed, and what they can do next. The design is successful when the visual system disappears into confident academic work without disappearing into generic software sameness.
