import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, gradeOf, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/academic/`;
const HOLIDAYS = `${API_BASE_URL}/master-admin/university/holidays/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";

type Scale = "percentage" | "letters" | "grade_points" | "custom";
interface Band { min: number; label: string; points: number }
interface Academic {
  grading: { scale: Scale; pass_mark: number; custom_bands: Band[] };
  calendar: { year_start_month: number; term_name: string; terms_per_year: number; timezone: string; date_format: string; week_starts: "sunday" | "monday" | "saturday" };
}
interface Response { academic: Academic; presets: { letters: Band[]; grade_points: Band[] }; timezones: string[]; months: string[]; current: { year_label: string; term_label: string } }
interface Holiday { id: number; date: string; name: string }
interface ImportResult { created: number; skipped: number; errors: { row: number; error: string }[] }

const SCALES: [Scale, string, string][] = [
  ["percentage", "Percentages", "Marks are shown as percentages only (today's behaviour)."],
  ["letters", "Letter grades", "O, A+, A, B+, B, C, P and F next to each percentage."],
  ["grade_points", "Grade points", "A 10-point scale (10 at 90% and above, down to 0), with an average shown as CGPA."],
  ["custom", "My own bands", "Choose your own grades and the lowest percentage for each."],
];
const DATE_FORMATS: [string, string][] = [["auto", "The browser's own format (default)"], ["DD/MM/YYYY", "31/12/2026"], ["MM/DD/YYYY", "12/31/2026"], ["YYYY-MM-DD", "2026-12-31"], ["D MMM YYYY", "31 Dec 2026"]];

const numberValue = (raw: string) => (raw === "" ? NaN : Number(raw));

/** Grading scale, academic calendar conventions and the university's holidays. */
export function AcademicPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Response | null>(null);
  const [form, setForm] = useState<Academic | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [newDay, setNewDay] = useState({ date: "", name: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const show = (response: Response) => {
    setData(response);
    setForm(structuredClone(response.academic));
  };

  const loadHolidays = async () => {
    try {
      setHolidays((await requestJson<{ results: Holiday[] }>(HOLIDAYS)).results);
    } catch {
      setHolidays([]);
    }
  };

  const load = async () => {
    setError("");
    try {
      show(await requestJson<Response>(ENDPOINT));
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the settings.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!data || !form) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading...</p>;

  const setGrading = (patch: Partial<Academic["grading"]>) => setForm({ ...form, grading: { ...form.grading, ...patch } });
  const setCalendar = (patch: Partial<Academic["calendar"]>) => setForm({ ...form, calendar: { ...form.calendar, ...patch } });

  const bands: Band[] = form.grading.scale === "letters" ? data.presets.letters : form.grading.scale === "grade_points" ? data.presets.grade_points : form.grading.scale === "custom" ? form.grading.custom_bands : [];
  const previewUniversity = { academic: { grading: { scale: form.grading.scale, pass_mark: form.grading.pass_mark, bands }, calendar: form.calendar, current: data.current } } as unknown as University;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await requestJson<Response & { university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(form) });
      show(response);
      setUniversity(response.university);
      toast.success("Saved. Every portal now follows it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(HOLIDAYS, { method: "POST", headers: authHeaders(), body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload.errors) throw new Error(payload.detail || "The upload failed.");
      setResult(payload);
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const addOne = async () => {
    setError("");
    try {
      const response = await requestJson<ImportResult>(HOLIDAYS, { method: "POST", body: JSON.stringify(newDay) });
      setResult(response);
      setNewDay({ date: "", name: "" });
      await loadHolidays();
    } catch (err) {
      const errors = (err as { body?: { errors?: { error: string }[] } }).body?.errors;
      setError(errors?.[0]?.error ?? (err instanceof Error ? err.message : "Could not add the holiday."));
    }
  };

  const removeHoliday = async (holiday: Holiday) => {
    const ok = await confirm({ title: `Remove ${holiday.name}?`, message: "It disappears from every calendar.", confirmLabel: "Remove", tone: "danger" });
    if (!ok) return;
    try {
      await requestJson(`${HOLIDAYS}${holiday.id}/`, { method: "DELETE" });
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the holiday.");
    }
  };

  const setBand = (index: number, patch: Partial<Band>) => setGrading({ custom_bands: form.grading.custom_bands.map((band, i) => (i === index ? { ...band, ...patch } : band)) });

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">Grading</h3>
        <p className="mt-1 text-xs text-slate-500">Scores are always stored as percentages. The scale only decides how they are shown, so changing it never changes anyone's marks.</p></div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Grading scale">
        {SCALES.map(([key, label, text]) => <button key={key} type="button" role="radio" aria-checked={form.grading.scale === key} onClick={() => setGrading({ scale: key })}
          className={`rounded-lg border p-3 text-left ${form.grading.scale === key ? "border-brand-blue bg-brand-blue/10" : "border-slate-300"}`}>
          <span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-0.5 block text-xs text-slate-600">{text}</span>
        </button>)}
      </div>
      <label className="block max-w-xs text-sm text-slate-700">Pass mark (%)
        <input type="number" min={0} max={100} value={Number.isNaN(form.grading.pass_mark) ? "" : form.grading.pass_mark} onChange={(e) => setGrading({ pass_mark: numberValue(e.target.value) })} className={inputClass} />
      </label>
      {form.grading.scale !== "percentage" && <div>
        <p className="text-sm font-semibold text-slate-700">Bands</p>
        {form.grading.scale === "custom" ? <div className="mt-2 space-y-2">
          {form.grading.custom_bands.map((band, i) => <div key={i} className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">From (%)<input type="number" min={0} max={100} value={Number.isNaN(band.min) ? "" : band.min} onChange={(e) => setBand(i, { min: numberValue(e.target.value) })} className="ml-1 w-20 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm" aria-label={`Band ${i + 1} lowest percentage`} /></label>
            <label className="text-xs text-slate-600">Grade<input maxLength={6} value={band.label} onChange={(e) => setBand(i, { label: e.target.value })} className="ml-1 w-20 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm" aria-label={`Band ${i + 1} grade`} /></label>
            <label className="text-xs text-slate-600">Points<input type="number" min={0} max={10} step={0.5} value={Number.isNaN(band.points) ? "" : band.points} onChange={(e) => setBand(i, { points: numberValue(e.target.value) })} className="ml-1 w-16 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm" aria-label={`Band ${i + 1} grade points`} /></label>
            <button type="button" onClick={() => setGrading({ custom_bands: form.grading.custom_bands.filter((_, k) => k !== i) })} className="text-slate-400 hover:text-rose-600" aria-label={`Remove band ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
          </div>)}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setGrading({ custom_bands: [...form.grading.custom_bands, { min: 0, label: "", points: 0 }] })} className="text-xs font-semibold text-brand-blue hover:underline">Add a band</button>
            <button type="button" onClick={() => setGrading({ custom_bands: structuredClone(data.presets.letters) })} className="text-xs font-semibold text-brand-blue hover:underline">Start from the letter grades</button>
          </div>
          <p className="text-xs text-slate-500">The lowest band must start at 0%. Points (0 to 10) are used for the average (CGPA).</p>
        </div> : <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          {bands.map((band, i) => <li key={i}><strong>{band.label}</strong> from {band.min}% {form.grading.scale === "letters" ? `(${band.points} points)` : ""}</li>)}
        </ul>}
        <p className="mt-3 text-xs text-slate-500">Example: 72% shows as <strong>72%{gradeOf(72, previewUniversity) ? ` · ${gradeOf(72, previewUniversity)!.label}` : ""}</strong>; 38% shows as <strong>38%{gradeOf(38, previewUniversity) ? ` · ${gradeOf(38, previewUniversity)!.label}` : ""}</strong>{form.grading.pass_mark > 38 ? " (below the pass mark)" : ""}.</p>
      </div>}
    </PanelCard>

    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">Academic calendar</h3>
        <p className="mt-1 text-xs text-slate-500">Today this is <strong>academic year {data.current.year_label}, {data.current.term_label}</strong>. It is shown on the calendar pages.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm text-slate-700">Academic year starts in
          <select value={form.calendar.year_start_month} onChange={(e) => setCalendar({ year_start_month: Number(e.target.value) })} className={inputClass}>
            {data.months.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">Term name
          <input maxLength={20} value={form.calendar.term_name} onChange={(e) => setCalendar({ term_name: e.target.value })} className={inputClass} placeholder="Semester" />
        </label>
        <label className="block text-sm text-slate-700">Terms per year
          <select value={form.calendar.terms_per_year} onChange={(e) => setCalendar({ terms_per_year: Number(e.target.value) })} className={inputClass}>
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">Time zone
          <input list="academic-timezones" value={form.calendar.timezone} onChange={(e) => setCalendar({ timezone: e.target.value })} className={inputClass} />
          <datalist id="academic-timezones">{data.timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
          <span className="mt-1 block text-xs text-slate-500">Every time in the portals and in Google Calendar sync uses this.</span>
        </label>
        <label className="block text-sm text-slate-700">Date format
          <select value={form.calendar.date_format} onChange={(e) => setCalendar({ date_format: e.target.value })} className={inputClass}>
            {DATE_FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">Week starts on
          <select value={form.calendar.week_starts} onChange={(e) => setCalendar({ week_starts: e.target.value as Academic["calendar"]["week_starts"] })} className={inputClass}>
            <option value="sunday">Sunday (default)</option><option value="monday">Monday</option><option value="saturday">Saturday</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save grading and calendar"}</button>
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Holidays</h3>
          <p className="mt-1 max-w-xl text-xs text-slate-500">Holidays appear as all-day events in every teacher's and student's calendar, and in Google Calendar sync. Upload a .csv or .xlsx sheet with the columns <strong>Date</strong> and <strong>Name</strong> (dates like 2026-12-25 or 25/12/2026). Uploading a sheet again never adds duplicates.</p></div>
        <div>
          <input ref={fileInput} type="file" accept=".csv,.xlsx" onChange={upload} className="hidden" />
          <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Upload className="h-4 w-4" />{uploading ? "Uploading..." : "Upload holidays"}</button>
        </div>
      </div>
      {result && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">{result.created} added, {result.skipped} already there{result.errors.length ? `, ${result.errors.length} rows need attention` : ""}.</p>
        {result.errors.length > 0 && <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-amber-800">{result.errors.map((e) => <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>)}</ul>}
      </div>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">Date<input type="date" value={newDay.date} onChange={(e) => setNewDay({ ...newDay, date: e.target.value })} className={`${inputClass} w-44`} /></label>
        <label className="min-w-[12rem] flex-1 text-sm text-slate-700">Name<input maxLength={120} value={newDay.name} onChange={(e) => setNewDay({ ...newDay, name: e.target.value })} className={inputClass} placeholder="Founders Day" /></label>
        <button type="button" onClick={() => void addOne()} disabled={!newDay.date || !newDay.name.trim()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add one</button>
      </div>
      {holidays.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No holidays yet.</p> : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {holidays.map((holiday) => <li key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span><span className="font-mono text-xs text-slate-500">{holiday.date}</span> <span className="ml-2 font-medium text-slate-900">{holiday.name}</span></span>
            <button type="button" onClick={() => void removeHoliday(holiday)} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${holiday.name}`}><Trash2 className="h-4 w-4" /></button>
          </li>)}
        </ul>
      )}
    </PanelCard>
  </div>;
}
