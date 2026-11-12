import { useEffect, useState } from "react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { TermTable, University, setUniversity } from "./shared/university";
import { PanelCard, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/terms/`;
const inputClass = "w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";

interface Row { key: keyof TermTable; label: string; group: string; default_singular: string; default_plural: string }
interface Loaded { terms: TermTable; rows: Row[] }

/** The university's own words for campuses, students, register numbers and so on. */
export function WordsPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [terms, setTerms] = useState<TermTable | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError("");
    try {
      const data = await requestJson<Loaded>(ENDPOINT);
      setRows(data.rows);
      setTerms(data.terms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the words.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!terms) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading...</p>;

  const set = (key: keyof TermTable, form: "singular" | "plural", value: string) => setTerms({ ...terms, [key]: { ...terms[key], [form]: value } });
  const changed = rows.filter((row) => terms[row.key].singular !== row.default_singular || terms[row.key].plural !== row.default_plural).length;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ terms: TermTable; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify({ terms }) });
      setTerms(data.terms);
      setUniversity(data.university);
      toast.success("Saved. Every portal now uses these words.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setTerms(Object.fromEntries(rows.map((row) => [row.key, { singular: row.default_singular, plural: row.default_plural }])) as TermTable);
  const groups = [...new Set(rows.map((row) => row.group))];

  return <PanelCard className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div>
      <h3 className="text-base font-semibold">Your words</h3>
      <p className="mt-1 max-w-xl text-xs text-slate-500">Use the names your university uses, for example Faculty for School, or Enrolment number for Register number. English only. Screens that have been updated use these words straight away; the rest keep the standard words.</p>
    </div>
    {groups.map((group) => <fieldset key={group} className="space-y-2">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</legend>
      <div className="hidden grid-cols-[10rem_1fr_1fr] gap-3 text-xs font-semibold text-slate-500 sm:grid"><span>Standard word</span><span>One</span><span>Many</span></div>
      {rows.filter((row) => row.group === group).map((row) => <div key={row.key} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr] sm:items-center sm:gap-3">
        <span className="text-sm text-slate-700">{row.label}</span>
        <input aria-label={`${row.label}, one`} value={terms[row.key].singular} maxLength={30} onChange={(e) => set(row.key, "singular", e.target.value)} className={inputClass} placeholder={row.default_singular} />
        <input aria-label={`${row.label}, many`} value={terms[row.key].plural} maxLength={30} onChange={(e) => set(row.key, "plural", e.target.value)} className={inputClass} placeholder={row.default_plural} />
      </div>)}
    </fieldset>)}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to standard words</button>
      <div className="flex items-center gap-3"><span className="text-xs text-slate-500">{changed ? `${changed} changed` : "All standard"}</span>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div>
    </div>
  </PanelCard>;
}
