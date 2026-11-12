import type React from "react";
import { useEffect, useState } from "react";
import { applyBrand } from "./brand";
import { applyLook } from "./look";
import type { Look, Portal, SignInPage } from "./look";
import { useTheme } from "./theme";
import { API_BASE_URL } from "./utils/apiConfig";

/** The university this installation belongs to, as set by the master admin. */
export interface University {
  configured: boolean;
  name: string;
  short_name: string;
  email_domain: string;
  contact_email: string;
  phone: string;
  website: string;
  address: string;
  logo_url: string | null;
  /** Optional version for dark mode; without it the light logo is shown on a white tile. */
  logo_dark_url: string | null;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
  /** Optional colours for dark mode; empty means they are worked out from the light ones. */
  primary_color_dark?: string;
  secondary_color_dark?: string;
  tertiary_color_dark?: string;
  /** Fonts, corners, portal names, sign-in pages ... (missing on an old cached copy). */
  look?: Look;
  /** Module switches ({forms: false, ...}); missing means on. */
  modules?: Record<string, boolean>;
  /** Exam, sign-in and account rules (missing on an old cached copy). */
  /** The notice to show right now (null when none is on or it is outside its dates). */
  academic?: Academic;
  documents?: DocumentSettings;
  terms?: TermTable;
  fields?: PublicFields;
  notice?: Notice | null;
  help?: HelpDetails;
  rules?: {
    exam?: Partial<Omit<PublicRules["exam"], "events">> & { events?: Partial<PublicRules["exam"]["events"]> };
    signin?: Partial<PublicRules["signin"]>;
    accounts?: { student_can_edit?: Partial<PublicRules["accounts"]["student_can_edit"]> };
  };
}

const EMPTY: University = {
  configured: false, name: "", short_name: "", email_domain: "", contact_email: "",
  phone: "", website: "", address: "", logo_url: null, logo_dark_url: null,
  primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e",
};
const CACHE_KEY = "eduai-university";

const readCache = (): University => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
};

let current: University = readCache();
applyBrand(current); // paint the saved colours before the first render, so there is no flash of the default theme
applyLook(current.look, API_BASE_URL, current.logo_url);
let inflight: Promise<void> | null = null;
const listeners = new Set<(value: University) => void>();

let lastJson = "";
let fetchedAt = 0;
/** How long a fetched copy is trusted before a component mount asks the server again. */
export const UNIVERSITY_TTL_MS = 60_000;

const publish = (next: University) => {
  const json = JSON.stringify(next);
  if (json === lastJson) return; // nothing changed: no repaint, no re-render of every subscriber
  lastJson = json;
  current = next;
  applyBrand(next);
  applyLook(next.look, API_BASE_URL, next.logo_url);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((listener) => listener(next));
};

/** Fetch the latest details (public endpoint, works before sign-in) and notify every component. */
export function refreshUniversity(force = false): Promise<void> {
  if (inflight) return inflight;
  // Many components ask on mount; one request a minute is enough, the rest reuse it.
  if (!force && fetchedAt && Date.now() - fetchedAt < UNIVERSITY_TTL_MS) return Promise.resolve();
  inflight = fetch(`${API_BASE_URL}/institution/university/`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => { if (data) { fetchedAt = Date.now(); publish({ ...EMPTY, ...data }); } })
    .catch(() => { /* keep showing the cached details */ })
    .finally(() => { inflight = null; });
  return inflight;
}

// Coming back to a tab that sat in the background picks up changes made meanwhile (within the same minute rule).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshUniversity(); });
}

/** Push details we already have (for example right after the master admin saves them). */
export const setUniversity = (value: University) => publish({ ...EMPTY, ...value });

export function useUniversity(): University {
  useTheme(); // re-render on a light/dark switch, so the right logo is shown
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    void refreshUniversity();
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

const isDark = () => document.documentElement.classList.contains("dark");

/** Which logo suits the current mode: the dark-mode logo when there is one and dark mode is on. */
export const logoVariant = (university: University): "light" | "dark" =>
  isDark() && university.logo_dark_url ? "dark" : "light";

export const logoSrc = (university: University): string | null => {
  const path = logoVariant(university) === "dark" ? university.logo_dark_url : university.logo_url;
  return path ? `${API_BASE_URL}${path}` : null;
};

/** The portal's name as the university calls it (for example "Student Hub" instead of "EduGames"). */
export const portalName = (university: University, portal: Portal, fallback: string) =>
  university.look?.portal_names?.[portal]?.trim() || fallback;

const NO_PAGE: SignInPage = { headline: "", text: "", motto: "", highlights: [], background: { kind: "brand", colour: "" } };

/** What the university chose for a portal's sign-in page (empty values mean "use the portal's own text"). */
export const signInPage = (university: University, portal: Portal): SignInPage => university.look?.signin?.[portal] ?? NO_PAGE;

/** The help, privacy and terms links shown at the foot of the sign-in pages. */
export const siteLinks = (university: University): [string, string][] => {
  const links = university.look?.links;
  const all: [string, string | undefined][] = [["Help", links?.help], ["Privacy", links?.privacy], ["Terms of use", links?.terms]];
  return all.filter((entry): entry is [string, string] => Boolean(entry[1]));
};

/** CSS background for a sign-in panel: the university's image or colour, else a gradient of its brand colours. */
export const signInBackground = (page: SignInPage): string => {
  if (page.background.kind === "image" && page.background.url) {
    return `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.55)), url("${API_BASE_URL}${page.background.url}") center / cover no-repeat`;
  }
  if (page.background.kind === "colour" && page.background.colour) return page.background.colour;
  return "linear-gradient(135deg, var(--color-brand-blue-dark) 0%, var(--color-brand-blue-fill) 100%)";
};

export function useDocumentTitle(app: string, portal?: Portal) {
  const university = useUniversity();
  const label = university.short_name || university.name;
  const name = portal ? portalName(university, portal, app) : app;
  useEffect(() => {
    document.title = label ? `${label} · ${name}` : name;
  }, [label, name]);
}

/** The portal's name, as the university calls it, kept up to date when it changes. */
export function PortalName({ portal, fallback }: { portal: Portal; fallback: string }) {
  const university = useUniversity();
  return <>{portalName(university, portal, fallback)}</>;
}

export function BrandingTitle({ app, portal }: { app: string; portal?: Portal }) {
  useDocumentTitle(app, portal);
  return null;
}

/** University logo (and short name) shown at the top bar, just left of the signed-in account. */
export function UniversityBadge({ className = "", labelClassName = "" }: { className?: string; labelClassName?: string }) {
  const university = useUniversity();
  const src = logoSrc(university);
  const label = university.short_name || university.name;
  if (!src && !label) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`} title={university.name}>
      {src && <img src={src} data-variant={logoVariant(university)} alt={university.name ? `${university.name} logo` : "University logo"} className="logo-chip h-8 max-w-[120px] object-contain" />}
      {label && <span className={`hidden max-w-[140px] truncate text-xs font-semibold lg:block ${labelClassName}`}>{label}</span>}
    </div>
  );
}

/** Modules a university can switch off (Master Admin > Modules). Anything not listed as off is on. */
export type ModuleKey =
  | "live_quizzes" | "chain_answer" | "word_cloud" | "trello" | "appointments" | "forms"
  | "mail" | "reports" | "omr" | "ai_assistant" | "ai_exam_tools" | "google_calendar";

const MODULE_LABELS: Record<ModuleKey, string> = {
  live_quizzes: "Live quizzes", chain_answer: "The chain answer game", word_cloud: "Word cloud", trello: "Project boards",
  appointments: "Appointments", forms: "Forms", mail: "Mail students", reports: "Reports", omr: "OMR answer sheets",
  ai_assistant: "The AI assistant", ai_exam_tools: "AI exam tools", google_calendar: "Google Calendar sync",
};

export const moduleOn = (university: University, key: ModuleKey) => university.modules?.[key] !== false;

export function useModule(key: ModuleKey): boolean {
  return moduleOn(useUniversity(), key);
}

/** Shows a page only while its module is on; otherwise a short note instead of the feature. */
export function ModuleGate({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const university = useUniversity();
  if (moduleOn(university, module)) return <>{children}</>;
  const who = university.short_name || university.name || "this university";
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center" role="status">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Not in use here</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>{MODULE_LABELS[module]} is switched off at {who}. Ask your administration if you need it.</p>
    </div>
  );
}

/** The university's rules the portals follow (Master Admin > Rules). Defaults are the platform's own behaviour. */
export type ExamEvent = "tab_hidden" | "window_blur" | "fullscreen_exit" | "page_unload";
export interface PublicRules {
  exam: { events: Record<ExamEvent, "end" | "warn" | "ignore">; warnings_allowed: number; rules_text: string; reset_by: "teachers" | "admins" };
  signin: { methods: "both" | "google" | "password"; allowed_domains: string[]; session_minutes: number };
  accounts: { student_can_edit: { name: boolean; phone: boolean; password: boolean } };
}

export const DEFAULT_PUBLIC_RULES: PublicRules = {
  exam: { events: { tab_hidden: "end", window_blur: "end", fullscreen_exit: "end", page_unload: "end" }, warnings_allowed: 2, rules_text: "", reset_by: "teachers" },
  signin: { methods: "both", allowed_domains: [], session_minutes: 15 },
  accounts: { student_can_edit: { name: true, phone: true, password: true } },
};

export const rulesOf = (university: University): PublicRules => {
  const r = university.rules;
  return {
    exam: { ...DEFAULT_PUBLIC_RULES.exam, ...r?.exam, events: { ...DEFAULT_PUBLIC_RULES.exam.events, ...r?.exam?.events } },
    signin: { ...DEFAULT_PUBLIC_RULES.signin, ...r?.signin },
    accounts: { student_can_edit: { ...DEFAULT_PUBLIC_RULES.accounts.student_can_edit, ...r?.accounts?.student_can_edit } },
  };
};

export function useRules(): PublicRules {
  return rulesOf(useUniversity());
}

/** The institution-wide notice. ``version`` changes whenever the text does, so a dismissed notice stays hidden only until it is edited. */
export interface Notice { text: string; tone: "info" | "urgent"; dismissable: boolean; version: string }
export interface HelpDetails { email: string; phone: string; hours: string; link: string }

const NOTICE_KEY = "eduai-notice-dismissed";
const dismissedVersion = () => {
  try { return localStorage.getItem(NOTICE_KEY); } catch { return null; }
};

/** The banner across the top of a portal while the university has a notice on. */
export function NoticeBanner() {
  const university = useUniversity();
  const notice = university.notice;
  const [dismissed, setDismissed] = useState<string | null>(dismissedVersion);
  if (!notice || (notice.dismissable && dismissed === notice.version)) return null;
  const urgent = notice.tone === "urgent";
  return (
    <div role={urgent ? "alert" : "status"} className="flex items-start gap-3 px-4 py-2.5 text-sm"
      style={{ background: urgent ? "#b91c1c" : "var(--color-brand-blue-fill)", color: urgent ? "#ffffff" : "var(--color-on-brand)" }}>
      <p className="min-w-0 flex-1 font-medium">{notice.text}</p>
      {notice.dismissable && (
        <button type="button" aria-label="Dismiss this notice" className="shrink-0 rounded px-2 text-lg leading-none hover:bg-white/20"
          onClick={() => {
            try { localStorage.setItem(NOTICE_KEY, notice.version); } catch { /* the notice just returns next visit */ }
            setDismissed(notice.version);
          }}>&times;</button>
      )}
    </div>
  );
}

/** Help-desk details for the account menu; renders nothing until the university has filled something in. */
export function HelpBlock({ className = "" }: { className?: string }) {
  const { help } = useUniversity();
  if (!help || !(help.email || help.phone || help.hours || help.link)) return null;
  return (
    <div className={`px-4 py-3 text-[11px] leading-relaxed ${className}`} style={{ color: "var(--color-text-secondary)" }}>
      <p className="mb-1 font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted, var(--color-text-secondary))" }}>Need help?</p>
      {help.email && <p><a href={`mailto:${help.email}`} className="underline break-all">{help.email}</a></p>}
      {help.phone && <p><a href={`tel:${help.phone.replace(/\s+/g, "")}`} className="underline">{help.phone}</a></p>}
      {help.hours && <p>{help.hours}</p>}
      {help.link && <p><a href={help.link} target="_blank" rel="noreferrer" className="underline">How to use the portal</a></p>}
    </div>
  );
}

/** Grading and calendar conventions of the university (Master Admin > Grading and calendar). */
export interface GradeBand { min: number; label: string; points: number }
export interface Academic {
  grading: { scale: "percentage" | "letters" | "grade_points" | "custom"; pass_mark: number; bands: GradeBand[] };
  calendar: { year_start_month: number; term_name: string; terms_per_year: number; timezone: string; date_format: string; week_starts: "sunday" | "monday" | "saturday" };
  current: { year_label: string; term_label: string };
}

export interface Grade { label: string; points: number; passed: boolean }

/** The grade for a percentage under the university's scale, or null while it shows plain percentages. */
export const gradeOf = (percent: number | null | undefined, university: University): Grade | null => {
  const grading = university.academic?.grading;
  if (percent == null || !grading || grading.scale === "percentage") return null;
  const band = [...grading.bands].sort((a, b) => b.min - a.min).find((b) => percent >= b.min);
  return band ? { label: band.label, points: band.points, passed: percent >= grading.pass_mark } : null;
};

/** The average grade points of some percentages (equal weight), or null when the scale has no grade points. */
export const cgpaOf = (percents: number[], university: University): number | null => {
  const grades = percents.map((p) => gradeOf(p, university)).filter((g): g is Grade => g !== null);
  return grades.length ? Math.round((grades.reduce((sum, g) => sum + g.points, 0) / grades.length) * 100) / 100 : null;
};

/** ` · A+` after a percentage when the university shows grades; nothing for plain percentages. */
export function GradeTag({ percent, className = "" }: { percent: number | null | undefined; className?: string }) {
  const university = useUniversity();
  const grade = gradeOf(percent, university);
  if (!grade) return null;
  return <span className={`font-bold ${className}`} title={grade.passed ? "Pass" : "Below the pass mark"}> · {grade.label}</span>;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date in the university's format (the browser's own format until the university chooses one). */
export function formatDate(value: string | number | Date | null | undefined, university: University, withTime = false): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const style = university.academic?.calendar?.date_format ?? "auto";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(date.getDate()), month = pad(date.getMonth() + 1), year = date.getFullYear();
  let text: string;
  switch (style) {
    case "DD/MM/YYYY": text = `${day}/${month}/${year}`; break;
    case "MM/DD/YYYY": text = `${month}/${day}/${year}`; break;
    case "YYYY-MM-DD": text = `${year}-${month}-${day}`; break;
    case "D MMM YYYY": text = `${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${year}`; break;
    default: return withTime ? date.toLocaleString() : date.toLocaleDateString();
  }
  return withTime ? `${text}, ${pad(date.getHours())}:${pad(date.getMinutes())}` : text;
}

export function useFormatDate() {
  const university = useUniversity();
  return (value: string | number | Date | null | undefined, withTime = false) => formatDate(value, university, withTime);
}

/** 0 = Sunday ... 6 = Saturday: the first column of a calendar grid. */
export const weekStartIndex = (university: University): number => ({ sunday: 0, monday: 1, saturday: 6 }[university.academic?.calendar?.week_starts ?? "sunday"] ?? 0);

/** "Academic year 2026-27 · Semester 2", for the calendar pages. */
export function AcademicPeriod({ className = "" }: { className?: string }) {
  const { academic } = useUniversity();
  if (!academic?.current) return null;
  return <span className={className}>Academic year {academic.current.year_label} · {academic.current.term_label}</span>;
}

/** The letterhead settings of official documents (Master Admin > Documents). Off until the university turns it on. */
export interface DocumentSettings { enabled: boolean; show_logo: boolean; show_name: boolean; show_address: boolean; footer: string; signatory_name: string; signatory_title: string }

/** A letterhead that only appears when the page is printed (answer sheets, reports). */
export function PrintLetterhead({ signature = false }: { signature?: boolean }) {
  const university = useUniversity();
  const docs = university.documents;
  if (!docs?.enabled) return null;
  const logo = docs.show_logo && university.logo_url ? `${API_BASE_URL}${university.logo_url}` : null;
  return (
    <>
      <div className="hidden print:block text-center" style={{ borderBottom: "1px solid #94a3b8", paddingBottom: 8, marginBottom: 12, color: "#0f172a" }}>
        {logo && <img src={logo} alt="" style={{ height: 56, margin: "0 auto 6px", objectFit: "contain" }} />}
        {docs.show_name && university.name && <p style={{ fontSize: 18, fontWeight: 700 }}>{university.name}</p>}
        {docs.show_address && university.address && <p style={{ fontSize: 11 }}>{university.address.split(/\n+/).join(", ")}</p>}
      </div>
      {signature && docs.signatory_name && (
        <div className="hidden print:block" style={{ marginTop: 48, color: "#0f172a" }}>
          <div style={{ width: 220, borderTop: "1px solid #0f172a", paddingTop: 4 }}>
            <p style={{ fontWeight: 700 }}>{docs.signatory_name}</p>
            {docs.signatory_title && <p style={{ fontSize: 12 }}>{docs.signatory_title}</p>}
          </div>
        </div>
      )}
      {docs.footer && <p className="hidden print:block text-center" style={{ marginTop: 16, fontSize: 10, color: "#475569" }}>{docs.footer}</p>}
    </>
  );
}

/** The university's own words (Master Admin > University > Words). English only; the defaults are what the platform always said. */
export type TermKey = "campus" | "school" | "department" | "program" | "class" | "section" | "student" | "teacher" | "master_admin" | "register_no" | "employee_no" | "classroom" | "exam" | "assignment";
export type TermTable = Record<TermKey, { singular: string; plural: string }>;

export const DEFAULT_TERMS: TermTable = {
  campus: { singular: "Campus", plural: "Campuses" },
  school: { singular: "School", plural: "Schools" },
  department: { singular: "Department", plural: "Departments" },
  program: { singular: "Program", plural: "Programs" },
  class: { singular: "Class", plural: "Classes" },
  section: { singular: "Section", plural: "Sections" },
  student: { singular: "Student", plural: "Students" },
  teacher: { singular: "Teacher", plural: "Teachers" },
  master_admin: { singular: "Master Admin", plural: "Master Admins" },
  register_no: { singular: "Register number", plural: "Register numbers" },
  employee_no: { singular: "Employee number", plural: "Employee numbers" },
  classroom: { singular: "Classroom", plural: "Classrooms" },
  exam: { singular: "Exam", plural: "Exams" },
  assignment: { singular: "Assignment", plural: "Assignments" },
};

export type TermOptions = { plural?: boolean; lower?: boolean };
export type TermFn = (key: TermKey, options?: TermOptions) => string;

/** A word lookup for a university: ``t("register_no")`` is "Register number" unless the university chose another word. */
export const termsOf = (university: University | null | undefined): TermFn => (key, options = {}) => {
  const entry = university?.terms?.[key] ?? DEFAULT_TERMS[key];
  const word = (options.plural ? entry.plural : entry.singular) || DEFAULT_TERMS[key][options.plural ? "plural" : "singular"];
  return options.lower ? word.toLowerCase() : word;
};

export function useTerms(): TermFn {
  return termsOf(useUniversity());
}

/** The university's extra profile fields and ID formats (Master Admin > University > Fields). Nothing is shown until some are defined. */
export interface FieldDefinition { key: string; label: string; type: "text" | "number" | "date" | "choice"; applies_to: "student" | "teacher" | "both"; required: boolean; admin_only: boolean; choices: string[] }
export interface IdFormat { pattern: string; description: string; example: string }
export interface PublicFields { id_formats: { register_no: IdFormat; employee_no: IdFormat }; custom: FieldDefinition[] }

export const fieldsFor = (university: University | null | undefined, role: "student" | "teacher"): FieldDefinition[] =>
  (university?.fields?.custom ?? []).filter((field) => field.applies_to === "both" || field.applies_to === role);

/** The values a person may send: admin-only fields are left out unless an administrator is editing. */
export const extraBody = (definitions: FieldDefinition[], values: Record<string, string>, asAdmin = false): Record<string, string> =>
  Object.fromEntries(definitions.filter((field) => asAdmin || !field.admin_only).map((field) => [field.key, values[field.key] ?? ""]));

/** One input per extra field that applies to ``role``. The styling classes come from the portal that uses it. */
export function ExtraFields({ role, values, onChange, asAdmin = false, labelClass, inputClass }: {
  role: "student" | "teacher"; values: Record<string, string>; onChange: (next: Record<string, string>) => void;
  asAdmin?: boolean; labelClass: string; inputClass: string;
}) {
  const definitions = fieldsFor(useUniversity(), role);
  if (!definitions.length) return null;
  return (
    <>
      {definitions.map((field) => {
        const locked = field.admin_only && !asAdmin;
        const common = { value: values[field.key] ?? "", disabled: locked, required: field.required && !locked, className: inputClass, "aria-label": field.label };
        const set = (value: string) => onChange({ ...values, [field.key]: value });
        return (
          <label key={field.key} className={labelClass}>
            {field.label}{field.required ? " *" : ""}{locked ? " (set by the administration)" : ""}
            {field.type === "choice" ? (
              <select {...common} onChange={(e) => set(e.target.value)}>
                <option value="">Choose...</option>
                {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            ) : (
              <input {...common} type={field.type === "text" ? "text" : field.type} step={field.type === "number" ? "any" : undefined} maxLength={field.type === "text" ? 200 : undefined} onChange={(e) => set(e.target.value)} />
            )}
          </label>
        );
      })}
    </>
  );
}
