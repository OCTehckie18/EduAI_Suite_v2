import { ChangeEvent, CSSProperties, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { ImagePlus, Moon, Sun, Trash2 } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { brandPalette, contrastRatio } from "./shared/brand";
import { requestJson } from "./shared/request";
import { University, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university`;

type Details = Pick<University, "name" | "short_name" | "email_domain" | "contact_email" | "phone" | "website" | "address" | "primary_color" | "secondary_color" | "tertiary_color" | "primary_color_dark" | "secondary_color_dark" | "tertiary_color_dark">;

const COLOR_FIELDS: { key: "primary_color" | "secondary_color" | "tertiary_color"; label: string; hint: string }[] = [
  { key: "primary_color", label: "Primary", hint: "Main buttons, headings and active tabs. Must be dark enough for white text." },
  { key: "secondary_color", label: "Secondary", hint: "Highlights and decorative accents." },
  { key: "tertiary_color", label: "Tertiary", hint: "Focus rings and small interactive accents." },
];

/** Dark mode has its own colours. Left on "Automatic" they are worked out from the light ones. */
const DARK_COLOR_FIELDS: { key: "primary_color_dark" | "secondary_color_dark" | "tertiary_color_dark"; label: string; automatic: string; hint: string }[] = [
  { key: "primary_color_dark", label: "Primary (dark mode)", automatic: "--color-brand-blue", hint: "Buttons, headings and links on dark screens. White text sits on buttons in this colour." },
  { key: "secondary_color_dark", label: "Secondary (dark mode)", automatic: "--color-brand-gold", hint: "Highlights and decorative accents on dark screens." },
  { key: "tertiary_color_dark", label: "Tertiary (dark mode)", automatic: "--color-brand-accent", hint: "Focus rings and small accents on dark screens." },
];

const FIELDS: { key: keyof Details; label: string; placeholder: string; multiline?: boolean; hint?: string }[] = [
  { key: "name", label: "University name", placeholder: "Example University", hint: "Shown on every login page and in the page title." },
  { key: "short_name", label: "Short name", placeholder: "EU", hint: "Shown next to the logo in the top bar." },
  { key: "email_domain", label: "Email domain", placeholder: "example.edu", hint: "Used only as a hint on sign-in pages (\"Use your @domain email\")." },
  { key: "contact_email", label: "Support email", placeholder: "it@example.edu", hint: "Shown on sign-in pages for people who need help." },
  { key: "phone", label: "Phone", placeholder: "+91 80 1234 5678" },
  { key: "website", label: "Website", placeholder: "https://www.example.edu" },
  { key: "address", label: "Address", placeholder: "1 University Road, City, State", multiline: true },
];

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900";

type Variant = "light" | "dark";
const fullUrl = (path: string | null) => (path ? `${API_BASE_URL}${path}` : null);

/** Fixed surfaces for each mode, so the preview looks the same whichever mode this portal is in. */
const SURFACES: Record<Variant, { page: string; card: string; text: string; sub: string; line: string }> = {
  light: { page: "#f8fafc", card: "#ffffff", text: "#0f172a", sub: "#475569", line: "#e2e8f0" },
  dark: { page: "#0b1220", card: "#131c2e", text: "#e5e9f0", sub: "#a7b1c2", line: "rgba(148,163,184,0.2)" },
};

const ratio = (value: number) => `${value.toFixed(1)}:1`;

/** How the portals will look in one mode with the colours and logos on this page (before saving). */
function ModePreview({ mode, colors, lightLogo, darkLogo, label }: { mode: Variant; colors: Details; lightLogo: string | null; darkLogo: string | null; label: string }) {
  const palette = brandPalette(colors, mode === "dark");
  const surface = SURFACES[mode];
  const fill = palette["--color-brand-blue-fill"];
  const text = palette["--color-brand-blue"];
  const accent = palette["--color-brand-accent"];
  const gold = palette["--color-brand-gold"];
  const logo = mode === "dark" ? darkLogo ?? lightLogo : lightLogo;
  const onTile = mode === "dark" && !darkLogo;
  const vars = { "--pv-page": surface.page, "--pv-card": surface.card, "--pv-text": surface.text, "--pv-sub": surface.sub, "--pv-line": surface.line, "--pv-fill": fill, "--pv-brand": text, "--pv-accent": accent, "--pv-gold": gold } as CSSProperties;
  const buttonContrast = contrastRatio("#ffffff", fill);
  const textContrast = contrastRatio(text, surface.card);
  const ok = (value: number) => value >= 4.5;
  return <figure className="min-w-0 flex-1 overflow-hidden rounded-xl border" style={{ ...vars, background: "var(--pv-page)", borderColor: "var(--pv-line)" }}>
    <div className="flex items-center gap-2 border-b px-3 py-2" style={{ background: "var(--pv-card)", borderColor: "var(--pv-line)" }}>
      {logo
        ? <img src={logo} alt="" className="h-7 max-w-[96px] object-contain" style={onTile ? { background: "#ffffff", borderRadius: 6, padding: "2px 5px" } : undefined} />
        : <span className="text-xs" style={{ color: "var(--pv-sub)" }}>No logo</span>}
      <span className="truncate text-xs font-semibold" style={{ color: "var(--pv-text)" }}>{label}</span>
      <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--pv-sub)" }}>{mode === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}{mode} mode</span>
    </div>
    <div className="space-y-3 p-3">
      <div className="rounded-lg border p-3" style={{ background: "var(--pv-card)", borderColor: "var(--pv-line)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--pv-text)" }}>Data Structures</p>
        <p className="text-xs" style={{ color: "var(--pv-sub)" }}>12 of 13 graded · <span className="font-semibold" style={{ color: "var(--pv-brand)" }}>Open class</span></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--pv-fill)", color: "#ffffff" }}>Primary button</span>
          <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--pv-gold)", color: "#1f2937" }}>Highlight</span>
          <span className="rounded-lg border-2 px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--pv-accent)", color: "var(--pv-text)", background: "var(--pv-card)" }}>Focused field</span>
        </div>
      </div>
      <figcaption className="text-[11px]" style={{ color: "var(--pv-sub)" }}>
        Button text {ratio(buttonContrast)}{ok(buttonContrast) ? "" : " (too low)"} · brand text on cards {ratio(textContrast)}{ok(textContrast) ? "" : " (too low)"}
      </figcaption>
    </div>
  </figure>;
}

/** One logo slot: upload, replace or remove, previewed on the background it will sit on. */
function LogoSlot({ variant, src, fallback, busy, onPick, onRemove, title, hint, children }: { variant: Variant; src: string | null; fallback: string | null; busy: boolean; onPick: () => void; onRemove: () => void; title: string; hint: string; children?: ReactNode }) {
  const surface = SURFACES[variant];
  const shown = src ?? (variant === "dark" ? fallback : null);
  const onTile = variant === "dark" && !src && !!fallback;
  return <div className="space-y-2">
    <div><h4 className="flex items-center gap-1.5 text-sm font-semibold">{variant === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{title}</h4><p className="mt-0.5 text-xs text-slate-500">{hint}</p></div>
    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed p-4" style={{ background: surface.card, borderColor: surface.line }}>
      {shown
        ? <img src={shown} alt={`${variant} mode logo`} className="max-h-full max-w-full object-contain" style={onTile ? { background: "#ffffff", borderRadius: 8, padding: "6px 10px" } : undefined} />
        : <p className="text-center text-sm" style={{ color: surface.sub }}>No logo uploaded yet</p>}
    </div>
    {onTile && <p className="text-xs text-slate-500">Until you add a dark-mode logo, dark mode shows your logo on a white tile, as above.</p>}
    <div className="flex gap-2">
      <button type="button" onClick={onPick} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><ImagePlus className="h-4 w-4" />{busy ? "Uploading..." : src ? "Replace" : "Upload"}</button>
      {src && <button type="button" onClick={onRemove} className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700 hover:bg-rose-50" title={`Remove the ${variant} mode logo`} aria-label={`Remove the ${variant} mode logo`}><Trash2 className="h-4 w-4" /></button>}
    </div>
    {children}
  </div>;
}

export function UniversityPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [university, setLocal] = useState<University | null>(null);
  const [form, setForm] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Variant | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const darkFileInput = useRef<HTMLInputElement>(null);

  const apply = (data: University) => {
    setLocal(data);
    setForm({ name: data.name, short_name: data.short_name, email_domain: data.email_domain, contact_email: data.contact_email, phone: data.phone, website: data.website, address: data.address, primary_color: data.primary_color, secondary_color: data.secondary_color, tertiary_color: data.tertiary_color, primary_color_dark: data.primary_color_dark ?? "", secondary_color_dark: data.secondary_color_dark ?? "", tertiary_color_dark: data.tertiary_color_dark ?? "" });
    setUniversity(data);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the university details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/`, { method: "PUT", body: JSON.stringify(form) }));
      toast.success("University details saved. Every portal now shows them.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the details.");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>, variant: Variant) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(variant);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("variant", variant);
      const response = await fetch(`${ENDPOINT}/logo/`, { method: "POST", headers: authHeaders(), body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The logo could not be uploaded.");
      apply(data);
      toast.success(variant === "dark" ? "Dark-mode logo updated. Every portal shows it in dark mode." : "Logo updated. It now appears in the top bar of every portal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The logo could not be uploaded.");
    } finally {
      setUploading(null);
    }
  };

  const removeLogo = async (variant: Variant) => {
    const ok = await confirm(variant === "dark"
      ? { title: "Remove the dark-mode logo?", message: "Dark mode will show your main logo on a white tile instead.", confirmLabel: "Remove logo", tone: "danger" }
      : { title: "Remove the university logo?", message: "It will disappear from every portal until you upload a new one.", confirmLabel: "Remove logo", tone: "danger" });
    if (!ok) return;
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/logo/?variant=${variant}`, { method: "DELETE" }));
      toast.success("Logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the logo.");
    }
  };

  if (loading) return <p className="text-slate-500">Loading university details...</p>;
  if (!university || !form) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error || "Could not load the university details."} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>;

  const lightLogo = fullUrl(university.logo_url);
  const darkLogo = fullUrl(university.logo_dark_url);
  const label = form.short_name || form.name;

  return <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
    <PanelCard className="space-y-5">
      <div><h3 className="text-base font-semibold">University logo</h3><p className="mt-1 text-xs text-slate-500">Appears at the top of TeacherBuddy, EduGames and this portal, just left of the signed-in account.</p></div>
      <LogoSlot variant="light" title="Light mode" hint="Your usual logo, for white backgrounds." src={lightLogo} fallback={null} busy={uploading === "light"} onPick={() => fileInput.current?.click()} onRemove={() => void removeLogo("light")} />
      <LogoSlot variant="dark" title="Dark mode (optional)" hint="A version with light artwork on a transparent background, for dark screens." src={darkLogo} fallback={lightLogo} busy={uploading === "dark"} onPick={() => darkFileInput.current?.click()} onRemove={() => void removeLogo("dark")} />
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e, "light")} className="hidden" />
      <input ref={darkFileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e, "dark")} className="hidden" />
      <p className="text-xs text-slate-500">PNG, JPEG or WebP, up to 2 MB, at least 32×32 pixels. A square or wide logo on a transparent background works best.</p>
    </PanelCard>

    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div><h3 className="text-base font-semibold">University details</h3><p className="mt-1 text-xs text-slate-500">These replace the placeholder text on every sign-in page and in the browser tab title.</p></div>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => <label key={field.key} className={`block text-sm text-slate-700 ${field.multiline || field.key === "name" ? "sm:col-span-2" : ""}`}>{field.label}
          {field.multiline
            ? <textarea rows={2} value={form[field.key]} placeholder={field.placeholder} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className={inputClass} />
            : <input required={field.key === "name"} value={form[field.key]} placeholder={field.placeholder} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className={inputClass} />}
          {field.hint && <span className="mt-1 block text-xs text-slate-500">{field.hint}</span>}
        </label>)}
      </div>
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-base font-semibold">Brand colours</h3>
        <p className="mt-1 text-xs text-slate-500">Used across TeacherBuddy, EduGames and this portal, in light and dark mode. You choose the light-mode colours here, and the dark-mode colours below. Dark mode can use lighter shades worked out automatically, or colours you pick yourself.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {COLOR_FIELDS.map((field) => <label key={field.key} className="block text-sm text-slate-700">{field.label}
            <span className="mt-1 flex items-center gap-2">
              <input type="color" value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label={`${field.label} colour`} />
              <input value={form[field.key]} maxLength={7} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900" aria-label={`${field.label} colour code`} />
            </span>
            <span className="mt-1 block text-xs text-slate-500">{field.hint}</span>
          </label>)}
        </div>
        <h4 className="mt-5 text-sm font-semibold">Dark mode colours</h4>
        <p className="mt-1 text-xs text-slate-500">Leave a colour on Automatic and EduAI picks a lighter shade of the light-mode colour so text stays readable. Or choose your own: it is used exactly as you pick it, and the preview below shows how readable it is.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {DARK_COLOR_FIELDS.map((field) => {
            const custom = form[field.key];
            const auto = brandPalette({ ...form, primary_color_dark: "", secondary_color_dark: "", tertiary_color_dark: "" }, true)[field.automatic];
            return <label key={field.key} className="block text-sm text-slate-700">{field.label}
              <span className="mt-1 flex items-center gap-2">
                <input type="color" value={custom || auto} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label={`${field.label} colour`} />
                <input value={custom} placeholder="Automatic" maxLength={7} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900" aria-label={`${field.label} colour code`} />
              </span>
              <span className="mt-1 flex items-start justify-between gap-2 text-xs text-slate-500"><span>{field.hint}</span>
                {custom && <button type="button" onClick={() => setForm({ ...form, [field.key]: "" })} className="shrink-0 font-semibold text-brand-blue hover:underline">Use automatic</button>}
              </span>
            </label>;
          })}
        </div>
        <div className="mt-4" aria-label="Colour preview">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview, before saving</p>
          <div className="flex flex-col gap-3 xl:flex-row">
            <ModePreview mode="light" colors={form} lightLogo={lightLogo} darkLogo={darkLogo} label={label} />
            <ModePreview mode="dark" colors={form} lightLogo={lightLogo} darkLogo={darkLogo} label={label} />
          </div>
        </div>
      </div>
      <div className="flex justify-end"><button type="submit" disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save details"}</button></div>
    </form>
  </div>;
}
