import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { DocumentSettings, University, logoSrc, setUniversity, useUniversity } from "./shared/university";
import { PanelCard, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/documents/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";

/** The letterhead and signatory on reports and printed answer sheets. */
export function DocumentsPanel() {
  const toast = useToast();
  const university = useUniversity();
  const [form, setForm] = useState<DocumentSettings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setError("");
    try {
      setForm((await requestJson<{ documents: DocumentSettings }>(ENDPOINT)).documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the document settings.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!form) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading...</p>;

  const set = (patch: Partial<DocumentSettings>) => setForm({ ...form, ...patch });
  const logo = logoSrc(university);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ documents: DocumentSettings; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(form) });
      setForm(data.documents);
      setUniversity(data.university);
      toast.success("Saved. New reports and printed answer sheets use it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const downloadSample = async () => {
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(`${ENDPOINT}sample/`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not make the sample.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "letterhead_sample.docx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the sample.");
    } finally {
      setDownloading(false);
    }
  };

  const check = (key: "show_logo" | "show_name" | "show_address", label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form[key]} disabled={!form.enabled} onChange={(e) => set({ [key]: e.target.checked })} />{label}</label>
  );

  return <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
    <PanelCard className="space-y-5">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Letterhead</h3>
          <p className="mt-1 max-w-md text-xs text-slate-500">Put your university's name, logo and address at the top of reports downloaded as Word files and of printed answer sheets. Documents are unchanged until you switch it on.</p></div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Use the letterhead</label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {check("show_logo", "Your logo")}
        {check("show_name", "University name")}
        {check("show_address", "Address")}
      </div>
      <label className="block text-sm text-slate-700">Footer line (optional)
        <input value={form.footer} maxLength={200} disabled={!form.enabled} onChange={(e) => set({ footer: e.target.value })} className={inputClass} placeholder="This is a computer-generated report" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">Signatory name (optional)
          <input value={form.signatory_name} maxLength={80} disabled={!form.enabled} onChange={(e) => set({ signatory_name: e.target.value })} className={inputClass} placeholder="Dr. A. Rao" />
        </label>
        <label className="block text-sm text-slate-700">Signatory title
          <input value={form.signatory_title} maxLength={80} disabled={!form.enabled} onChange={(e) => set({ signatory_title: e.target.value })} className={inputClass} placeholder="Controller of Examinations" />
        </label>
      </div>
      <p className="text-xs text-slate-500">The name, logo and address come from the University page. The signatory's line appears at the end of reports and on teachers' printed answer sheets.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => void downloadSample()} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4" />{downloading ? "Making the sample..." : "Download a sample report (Word)"}</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>
    </PanelCard>

    <figure aria-label="Letterhead preview" className="h-fit rounded-xl border border-slate-300 bg-white p-5 text-slate-900 shadow-sm">
      <figcaption className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</figcaption>
      {form.enabled ? <div className="text-center" style={{ borderBottom: "1px solid #94a3b8", paddingBottom: 8 }}>
        {form.show_logo && logo && <img src={logo} alt="" className="mx-auto mb-1.5 h-14 object-contain" />}
        {form.show_name && university.name && <p className="text-lg font-bold">{university.name}</p>}
        {form.show_address && university.address && <p className="text-[11px]">{university.address.split(/\n+/).join(", ")}</p>}
        {!(form.show_logo && logo) && !(form.show_name && university.name) && !(form.show_address && university.address) && <p className="text-xs text-slate-400">Nothing to show: turn on a part above.</p>}
      </div> : <p className="rounded border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">The letterhead is off. Documents have no header.</p>}
      <div className="mt-4 space-y-2 text-xs text-slate-700">
        <p className="text-sm font-bold">Class report: Data Structures</p>
        <p>13 students enrolled, 12 graded. Class average 72.5%.</p>
        <p>Mid-term: 12 completed, average 68%.</p>
      </div>
      {form.enabled && form.signatory_name && <div className="mt-8 w-48 border-t border-slate-900 pt-1 text-xs"><p className="font-bold">{form.signatory_name}</p>{form.signatory_title && <p>{form.signatory_title}</p>}</div>}
      {form.enabled && form.footer && <p className="mt-4 text-center text-[10px] text-slate-500">{form.footer}</p>}
    </figure>
  </div>;
}
