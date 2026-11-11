# Plan: let each university make EduAI its own

**Goal:** a university's Master Admin can make the three portals look, read and behave like their own institution's system, from Master Admin, with no code changes and no redeploy. Everything starts on today's behaviour, so nothing changes until an admin edits it.

---

## 0. Where we are today

| A university can already set | Where |
|---|---|
| Name, short name, email-domain hint, support email, phone, website, address | Master Admin → University (`institution.UniversityProfile`) |
| Light logo and optional dark-mode logo | same |
| Primary, secondary, tertiary colour, plus optional dark-mode colours | same; applied by `shared/brand.ts` in all four apps |

**Still fixed in the code** (found while writing this plan):

| What | Where it is fixed |
|---|---|
| Fonts (Poppins / Inter) | each app's `index.css` (`--font-display`) |
| Sign-in page wording ("Play. Learn. Grow." on EduGames) | `edugames/src/features/auth/AuthPage.tsx`, and similar in the other portals |
| Words such as Campus / School / Department / Program / Class / Section, Register number, Employee number, "Teacher", "Student" | hundreds of strings across the four apps, plus backend messages (roster import errors, sign-in messages) |
| Time zone (`Asia/Kolkata`), date format, academic year | `config/settings/base.py`, browser locale |
| Grading: only percentages, no letter grades or CGPA | exams, reports, analytics |
| Exam rules: every violation ends the attempt; the rules text is fixed | `ExamPlayer.tsx`, `exams/views.py` (`VIOLATIONS`) |
| Session timeout 15 minutes | `useSessionTimeout(900000)` in both portal shells |
| Risk thresholds (safe at 70%, floor 30%, weights 50/25/15/10) | `analytics/risk.py` constants |
| Which modules exist (games, Trello, appointments, forms, OMR, reports, AI chat, calendar sync) | always on |
| Button text is always white, so a light brand colour gives poor contrast | CSS across the portals |
| Report and export headers | `reports/builders.py` (no logo, no university letterhead) |
| Student and teacher profile fields | fixed model fields |

---

## 1. How the settings are stored (shared by every phase)

- **Keep `UniversityProfile` for identity** (name, logos, colours).
- **Add one `UniversitySettings` row** (one-to-one with the profile) holding validated JSON groups: `look`, `terms`, `academic`, `grading`, `rules`, `features`, `documents`, `fields`.
- **Each group has a schema in Python** (`institution/settings_schema.py`): the allowed keys, their type, bounds and default. Unknown keys are dropped, wrong values are refused with the field named, and missing keys fall back to the default. This keeps "anything customisable" from turning into "anything can break the platform".
- **Two endpoints:**
  - `GET /institution/university/` (public, already used by every portal on load) gains the public groups: `look`, `terms`, `academic`, `features` and the sign-in page content.
  - `GET/PUT /master-admin/university/settings/<group>` saves one group at a time. `rules` and other private values are never sent to signed-out visitors.
- **The server enforces the rules and switches**, not just the screens. A module that is switched off returns 404 from its API, and an exam rule is applied in `exams/views.py`.
- **Every save is audited** (`_record_admin_action`, already used for the university page), with before and after values.
- **Every group has "Reset to default"** and a preview before saving, like the colour preview today.
- **Export and import of all settings as one JSON file.** This lets a university copy its setup to a new campus, and fits the "one installation per college" kit in the business plan (Phase 3).
- **Master Admin's "University" item becomes a section with tabs:** Identity · Look · Words · Academic · Grading · Rules · Modules · Documents · Profile fields.

---

## 2. The phases

Each phase is its own branch from `development`. They are ordered by how visible they are and how little they risk. Sizes: S about a day, M two or three days, L a week or more.

### C1. Look and feel, deeper (M)
1. **Button text that adapts:** a new `--color-on-brand` variable, white or near-black, picked by contrast for every fill colour. This removes the "Button text 2.5:1 (too low)" problem for light colours. Every `text-white` that sits on a brand fill moves to it; the dark-utilities generator (`scripts/build_dark_css.py`) gets the mapping.
2. **Fonts:** choose heading and body fonts from a curated list of about 12 readable Google Fonts, previewed live and loaded only when chosen. No uploaded font files, to keep licensing and security simple.
3. **Shape:** corner style (sharp, soft, round) and density (comfortable, compact), each driven by one CSS variable.
4. **Tab icon:** upload a favicon, or use the logo automatically. The tab title follows the pattern "{short name} · TeacherBuddy".
5. **Portal names:** rename "TeacherBuddy", "EduGames" and "Master Admin" if the university uses its own names (for example "Faculty Desk", "Student Hub").
6. **Sign-in pages:** per portal, a headline, a line of text and a background (colour or uploaded image), replacing the fixed "Play. Learn. Grow.". Plus footer links: help desk, privacy policy, terms of use.
7. **Landing page:** hero text, and which portals are shown.

### C2. Modules on or off (M)
- One switch per module, per portal:
  - EduGames: each game (Chain answer, Word cloud, Live quiz, Trello), Forms, Appointments.
  - TeacherBuddy: Game Studio, OMR, Reports, Mail students.
  - Everywhere: AI features (chat, AI marking suggestion, question extraction from PDF or Word) and Google Calendar sync.
- A module that is switched off disappears from navigation and dashboards, its routes show "Not used at {University}", and its API refuses requests.
- Data is never deleted. Switching a module back on brings everything back.

### C3. Rules and policies (M)
- **Exam integrity:**
  - which events end an attempt (tab switch, leaving full screen, window blur, refresh), and which only warn, with "end after N warnings";
  - the rules text students see before starting (with today's text as the default);
  - whether teachers or only admins may reset an attempt.
- **Sign-in:**
  - allowed methods (Google, password, or both);
  - the list of allowed email domains, enforced at Google sign-in (Phase 2 of the business plan);
  - session timeout (5–120 minutes).
- **Accounts:**
  - teacher approval mode: roster only, roster plus manual approval (today), or approve anyone from the allowed domains;
  - what students may edit on their own profile (name, phone, password).
- **Risk:** the safe and floor marks and the weights for marks, missing work, trend and integrity. Each has a "what this means" line and an example student.

### C4. Grading and academic calendar (L)
- **Grading scales:**
  - the university picks or builds bands, for example O ≥ 90, A+ ≥ 80 … F < 40, or 10-point grade points with a CGPA formula;
  - it also sets the pass mark;
  - the scale is shown next to the percentage on exam results, answer sheets, the student's progress page, reports and exports.
  - Scores stay stored as percentages, so a change of scale never rewrites history.
- **Academic calendar:**
  - academic year start month, term name (semester, trimester, term) and number of terms;
  - time zone (moved from server settings into the university), date format (DD/MM/YYYY or other) and first day of the week;
  - institution-wide holidays, uploaded as a sheet and shown in every calendar and in Google Calendar sync.

### C5. The university's own words (L)
- **Terms:** a table of terms with singular and plural forms and today's words as defaults:
  - the hierarchy levels (Campus, School, Department, Program, Class or Batch, Section);
  - roles (Student, Teacher, Master Admin);
  - identifiers (Register number, Employee number);
  - items (Classroom, Exam, Assignment).
- **How the words reach the screens:**
  - a `term("register_no")` helper in each app's `shared/university.tsx`;
  - a `terms.get()` helper in the backend, for roster import errors, sign-in messages and report text.
- **Rollout:** screen by screen, starting with the busiest (sign-in, roster, structure, profile, exams). A test fails if a converted screen still contains a fixed term.
- **Out of scope:** a full translation into another language. Supporting Hindi or a regional language is a separate, larger project, and it builds on this.

### C6. Documents and exports (M)
- **Letterhead for the official documents:**
  - the class report, student report and event report (`reports/builders.py`);
  - Excel exports such as exam results and rosters;
  - printable answer sheets.
- **What goes on it:** logo, name, address, an optional footer line ("This is a computer-generated report"), and an optional signatory name and title.
- **Preview:** a one-page sample before saving.

### C7. Custom profile fields and ID formats (L)
- **Extra fields** for students and teachers, defined by the admin: label, type (text, number, date, choice), required or not, and who can see it (the person, teachers, admins).
  - Examples: Hostel, Blood group, Guardian phone.
  - They appear in the profile form and as extra columns in the roster download and upload (B0 already round-trips the sheet).
- **ID formats:** a format rule for register and employee numbers (a pattern plus an example, such as "7 digits"), checked on roster import and in profile edits, with the error naming the row.

### C8. Announcements and help (S)
- **Banner:** an institution-wide notice on every portal, with a start and end time, a tone (info or urgent), and dismissable or not.
- **Help panel:** the help desk email, phone, hours and a "How to" link, shown in each portal's account menu.

---

## 3. Suggested order

| # | Phase | Why this place |
|---|---|---|
| 1 | C1 Look and feel | Most visible, low risk; fixes the button-contrast warning |
| 2 | C2 Modules on or off | Lets each university hide what it doesn't use |
| 3 | C3 Rules and policies | Exam and sign-in behaviour is what universities ask about first |
| 4 | C8 Announcements and help | Small; useful from day one |
| 5 | C4 Grading and calendar | Needs decisions per university (scales, terms) |
| 6 | C6 Documents | Builds on C4 (grades on reports) |
| 7 | C5 Words | Largest change across screens; easier once the screens settle |
| 8 | C7 Custom fields and ID formats | Touches the roster and profiles; do last |

---

## 4. Safety rules for every phase
- **Defaults equal today's behaviour.** A university that never opens these tabs sees no change.
- **Validated on the server:** colours are hex, fonts come from the list, numbers have bounds, text has length limits, uploads go through the existing image checks (PNG, JPEG, WebP; no SVG).
- **Nothing is deleted.** Switching off a module or a field hides it; the data stays.
- **Readability guard:** custom colours and fonts are allowed, but the preview shows contrast and flags low values, as the colour preview does today.
- **Tests per phase:** schema validation, default behaviour unchanged, the server enforcing each switch and rule, and a browser check of the preview and of each portal after saving.

---

## 5. Decisions (confirmed 11 November 2026)
1. **Fonts:** a curated list **and** uploads of the university's own font files (WOFF2, WOFF, TTF or OTF, checked by their file signature, at most 2 MB each). The licence for an uploaded font is the university's responsibility; Master Admin says so next to the upload.
2. **Grading:** ship ready-made scales: plain percentage (today's default), letter grades O, A+, A, B+, B, C, P, F, and a 10-point grade-point scale with CGPA. A university picks one or edits a copy.
3. **Words:** English only for now. Translation is a later project.
4. **Who changes rules:** the Master Admin only.
5. **Order:** as listed in section 3, starting with C1.
