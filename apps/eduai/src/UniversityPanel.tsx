import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, logoSrc, setUniversity } from "./shared/university";

const ENDPOINT = `${API_BASE_URL}/master-admin/university`;

type Details = Pick<University, "name" | "short_name" | "email_domain" | "contact_email" | "phone" | "website" | "address">;

const FIELDS: { key: keyof Details; label: string; placeholder: string; multiline?: boolean; hint?: string }[] = [
  { key: "name", label: "University name", placeholder: "Example University", hint: "Shown on every login page and in the page title." },
  { key: "short_name", label: "Short name", placeholder: "CHRIST", hint: "Shown next to the logo in the top bar." },
  { key: "email_domain", label: "Email domain", placeholder: "example.edu", hint: "Used only as a hint on sign-in pages (\"Use your @domain email\")." },
  { key: "contact_email", label: "Support email", placeholder: "it@example.edu", hint: "Shown on sign-in pages for people who need help." },
  { key: "phone", label: "Phone", placeholder: "+91 80 1234 5678" },
  { key: "website", label: "Website", placeholder: "https://www.example.edu" },
  { key: "address", label: "Address", placeholder: "Hosur Road, Bengaluru", multiline: true },
];

const inputClass = "mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white";

export function UniversityPanel() {
  const [university, setLocal] = useState<University | null>(null);
  const [form, setForm] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = (data: University) => {
    setLocal(data);
    setForm({ name: data.name, short_name: data.short_name, email_domain: data.email_domain, contact_email: data.contact_email, phone: data.phone, website: data.website, address: data.address });
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
    setMessage("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/`, { method: "PUT", body: JSON.stringify(form) }));
      setMessage("University details saved. Every portal now shows them.");
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
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${ENDPOINT}/logo/`, { method: "POST", headers: authHeaders(), body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The logo could not be uploaded.");
      apply(data);
      setMessage("Logo updated. It now appears in the top bar of every portal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The logo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!window.confirm("Remove the university logo from all portals?")) return;
    setError("");
    setMessage("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/logo/`, { method: "DELETE" }));
      setMessage("Logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the logo.");
    }
  };

  if (loading) return <p className="text-stone-400">Loading university details...</p>;
  if (!university || !form) return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error || "Could not load the university details."} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>;

  const logo = logoSrc(university);

  return <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
    <section className="glass-card space-y-4 rounded-2xl p-6">
      <div><h3 className="text-base font-semibold">University logo</h3><p className="mt-1 text-xs text-stone-400">Appears at the top of TeacherBuddy, EduGames and this portal, just left of the signed-in account.</p></div>
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-stone-700 bg-white/90 p-4">
        {logo ? <img src={logo} alt="University logo" className="max-h-full max-w-full object-contain" /> : <p className="text-center text-sm text-stone-500">No logo uploaded yet</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => fileInput.current?.click()} disabled={uploading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><ImagePlus className="h-4 w-4" />{uploading ? "Uploading..." : logo ? "Replace logo" : "Upload logo"}</button>
        {logo && <button onClick={() => void removeLogo()} className="rounded-xl border border-rose-500/40 px-3 py-2 text-rose-300 hover:bg-rose-500/10" title="Remove logo"><Trash2 className="h-4 w-4" /></button>}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} className="hidden" />
      </div>
      <p className="text-xs text-stone-500">PNG, JPEG or WebP, up to 2 MB, at least 32×32 pixels. A square or wide logo on a transparent background works best.</p>
    </section>

    <form onSubmit={save} className="glass-card space-y-4 rounded-2xl p-6">
      <div><h3 className="text-base font-semibold">University details</h3><p className="mt-1 text-xs text-stone-400">These replace the placeholder text on every sign-in page and in the browser tab title.</p></div>
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {message && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => <label key={field.key} className={`block text-sm text-stone-300 ${field.multiline || field.key === "name" ? "sm:col-span-2" : ""}`}>{field.label}
          {field.multiline
            ? <textarea rows={2} value={form[field.key]} placeholder={field.placeholder} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className={inputClass} />
            : <input required={field.key === "name"} value={form[field.key]} placeholder={field.placeholder} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className={inputClass} />}
          {field.hint && <span className="mt-1 block text-xs text-stone-500">{field.hint}</span>}
        </label>)}
      </div>
      <div className="flex justify-end"><button type="submit" disabled={saving} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save details"}</button></div>
    </form>
  </div>;
}
