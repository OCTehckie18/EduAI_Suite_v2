import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { FieldDefinition, PublicFields, University, setUniversity, useTerms } from "./shared/university";
import { PanelCard, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/fields/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";
const MAX_FIELDS = 10;

interface Row { key: string; label: string; type: FieldDefinition["type"]; applies_to: FieldDefinition["applies_to"]; required: boolean; admin_only: boolean; choices: string }

const toRow = (field: FieldDefinition): Row => ({ ...field, choices: field.choices.join(", ") });
const blank = (): Row => ({ key: "", label: "", type: "text", applies_to: "student", required: false, admin_only: false, choices: "" });

/** A readable hint for a pattern the admin is typing (the server checks it for real on save). */
const hint = (pattern: string) => {
  if (!pattern) return "No format: any number is accepted.";
  const sample = [...pattern].map((ch) => (ch === "9" ? "7" : ch === "A" ? "K" : ch === "X" ? "4" : ch)).join("");
  return `Example that fits: ${sample}`;
};

/** ID formats for register and employee numbers, and the extra fields on student and teacher profiles. */
export function FieldsPanel() {
  const toast = useToast();
  const t = useTerms();
  const [formats, setFormats] = useState<{ register_no: string; employee_no: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError("");
    try {
      const data = (await requestJson<{ fields: PublicFields }>(ENDPOINT)).fields;
      setFormats({ register_no: data.id_formats.register_no.pattern, employee_no: data.id_formats.employee_no.pattern });
      setRows(data.custom.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the settings.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!formats) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading...</p>;

  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        id_formats: { register_no: { pattern: formats.register_no }, employee_no: { pattern: formats.employee_no } },
        custom: rows.map((row) => ({ ...row, choices: row.type === "choice" ? row.choices.split(",").map((c) => c.trim()).filter(Boolean) : [] })),
      };
      const data = await requestJson<{ fields: PublicFields; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(body) });
      setRows(data.fields.custom.map(toRow));
      setUniversity(data.university);
      toast.success("Saved. Profiles, rosters and user screens follow these settings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const idField = (key: "register_no" | "employee_no", label: string) => (
    <label className="block text-sm text-slate-700">{label}
      <input value={formats[key]} maxLength={30} onChange={(e) => setFormats({ ...formats, [key]: e.target.value })} className={`${inputClass} font-mono`} placeholder="Any format" aria-label={`${label} format`} />
      <span className="mt-1 block text-xs text-slate-500">{hint(formats[key])}</span>
    </label>
  );

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <PanelCard className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">ID formats</h3>
        <p className="mt-1 max-w-xl text-xs text-slate-500">Write the shape of your numbers: 9 is a digit, A is a letter, X is a letter or a digit, anything else stands for itself. For example 9999999 is seven digits, and 99-AAA-9999 fits 21-MCA-0042. Numbers are checked when they are added or changed, in roster uploads (the error names the row), profiles and user edits. Existing numbers are never rejected.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {idField("register_no", t("register_no"))}
        {idField("employee_no", t("employee_no"))}
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Extra profile fields</h3>
          <p className="mt-1 max-w-xl text-xs text-slate-500">Add details your university keeps, such as Hostel or Guardian phone. People fill them in their profile; you can edit anyone's under Users. A field marked "set by the administration" is visible to its owner but only you can change it. Up to {MAX_FIELDS} fields.</p>
        </div>
        <button type="button" onClick={() => setRows([...rows, blank()])} disabled={rows.length >= MAX_FIELDS} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />Add a field</button>
      </div>
      {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No extra fields yet.</p>}
      {rows.map((row, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm text-slate-700 lg:col-span-2">Label
          <input value={row.label} maxLength={40} onChange={(e) => update(index, { label: e.target.value })} className={inputClass} placeholder="Hostel" aria-label={`Field ${index + 1} label`} />
        </label>
        <label className="block text-sm text-slate-700">Type
          <select value={row.type} onChange={(e) => update(index, { type: e.target.value as Row["type"] })} className={inputClass} aria-label={`Field ${index + 1} type`}>
            <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="choice">Choice from a list</option>
          </select>
        </label>
        <label className="block text-sm text-slate-700">For
          <select value={row.applies_to} onChange={(e) => update(index, { applies_to: e.target.value as Row["applies_to"] })} className={inputClass} aria-label={`Field ${index + 1} audience`}>
            <option value="student">{t("student", { plural: true })}</option><option value="teacher">{t("teacher", { plural: true })}</option><option value="both">Both</option>
          </select>
        </label>
        {row.type === "choice" && <label className="block text-sm text-slate-700 sm:col-span-2 lg:col-span-4">Choices, separated by commas
          <input value={row.choices} onChange={(e) => update(index, { choices: e.target.value })} className={inputClass} placeholder="North block, South block" aria-label={`Field ${index + 1} choices`} />
        </label>}
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={row.required} onChange={(e) => update(index, { required: e.target.checked })} />Required</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={row.admin_only} onChange={(e) => update(index, { admin_only: e.target.checked })} />Set by the administration only</label>
          <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-rose-700 hover:underline"><Trash2 className="h-4 w-4" />Remove</button>
        </div>
      </div>)}
      <p className="text-xs text-slate-500">Removing a field hides it everywhere; values people already entered are kept and come back if you add a field with the same label.</p>
    </PanelCard>

    <div className="flex justify-end"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div>
  </div>;
}
