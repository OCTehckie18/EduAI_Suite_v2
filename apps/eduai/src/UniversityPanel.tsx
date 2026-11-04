import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, logoSrc, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university`;

type Details = Pick<University, "name" | "short_name" | "email_domain" | "contact_email" | "phone" | "website" | "address" | "primary_color" | "secondary_color" | "tertiary_color">;

const COLOR_FIELDS: { key: "primary_color" | "secondary_color" | "tertiary_color"; label: string; hint: string }[] = [
  { key: "primary_color", label: "Primary", hint: "Main buttons, headings and active tabs. Must be dark enough for white text." },
  { key: "secondary_color", label: "Secondary", hint: "Highlights and decorative accents." },
  { key: "tertiary_color", label: "Tertiary", hint: "Focus rings and small interactive accents." },
];

const FIELDS: { key: keyof Details; label: string; placeholder: string; multiline?: boolean; hint?: string }[] = [
  { key: "name", label: "University name", placeholder: "Example University", hint: "Shown on every login page and in the page title." },
  { key: "short_name", label: "Short name", placeholder: "CHRIST", hint: "Shown next to the logo in the top bar." },
  { key: "email_domain", label: "Email domain", placeholder: "example.edu", hint: "Used only as a hint on sign-in pages (\"Use your @domain email\")." },
  { key: "contact_email", label: "Support email", placeholder: "it@example.edu", hint: "Shown on sign-in pages for people who need help." },
  { key: "phone", label: "Phone", placeholder: "+91 80 1234 5678" },
  { key: "website", label: "Website", placeholder: "https://www.example.edu" },
  { key: "address", label: "Address", placeholder: "Hosur Road, Bengaluru", multiline: true },
];

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900";

export function UniversityPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [university, setLocal] = useState<University | null>(null);
  const [form, setForm] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = (data: University) => {
    setLocal(data);
    setForm({ name: data.name, short_name: data.short_name, email_domain: data.email_domain, contact_email: data.contact_email, phone: data.phone, website: data.website, address: data.address, primary_color: data.primary_color, secondary_color: data.secondary_color, tertiary_color: data.tertiary_color });
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

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${ENDPOINT}/logo/`, { method: "POST", headers: authHeaders(), body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The logo could not be uploaded.");
      apply(data);
      toast.success("Logo updated. It now appears in the top bar of every portal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The logo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    const ok = await confirm({ title: "Remove the university logo?", message: "It will disappear from every portal until you upload a new one.", confirmLabel: "Remove logo", tone: "danger" });
    if (!ok) return;
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/logo/`, { method: "DELETE" }));
      toast.success("Logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the logo.");
    }
  };

  if (loading) return <p className="text-slate-500">Loading university details...</p>;
  if (!university || !form) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error || "Could not load the university details."} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>;

  const logo = logoSrc(university);

  return <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">University logo</h3><p className="mt-1 text-xs text-slate-500">Appears at the top of TeacherBuddy, EduGames and this portal, just left of the signed-in account.</p></div>
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/90 p-4">
        {logo ? <img src={logo} alt="University logo" className="max-h-full max-w-full object-contain" /> : <p className="text-center text-sm text-slate-500">No logo uploaded yet</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => fileInput.current?.click()} disabled={uploading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><ImagePlus className="h-4 w-4" />{uploading ? "Uploading..." : logo ? "Replace logo" : "Upload logo"}</button>
        {logo && <button onClick={() => void removeLogo()} className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700 hover:bg-rose-50" title="Remove logo"><Trash2 className="h-4 w-4" /></button>}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} className="hidden" />
      </div>
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
        <p className="mt-1 text-xs text-slate-500">Used across TeacherBuddy, EduGames and this portal so every screen matches your institution. Lighter and darker shades are worked out automatically.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {COLOR_FIELDS.map((field) => <label key={field.key} className="block text-sm text-slate-700">{field.label}
            <span className="mt-1 flex items-center gap-2">
              <input type="color" value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label={`${field.label} colour`} />
              <input value={form[field.key]} maxLength={7} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900" aria-label={`${field.label} colour code`} />
            </span>
            <span className="mt-1 block text-xs text-slate-500">{field.hint}</span>
          </label>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Colour preview">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</span>
          <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: form.primary_color }}>Primary button</span>
          <span className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: form.secondary_color, color: "#1f2937" }}>Highlight</span>
          <span className="rounded-lg border-2 bg-white px-4 py-2 text-sm font-semibold text-slate-800" style={{ borderColor: form.tertiary_color }}>Focused field</span>
        </div>
      </div>
      <div className="flex justify-end"><button type="submit" disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save details"}</button></div>
    </form>
  </div>;
}
