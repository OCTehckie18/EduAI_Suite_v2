import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { FieldDefinition, PublicFields, University, setUniversity, useTerms } from "./shared/university";
import { PanelCard, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/fields/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";
const MAX_FIELDS = 10;

type PartKind = "year" | "program" | "section" | "serial" | "fixed";
interface PartRow { kind: PartKind; length: number; text: string }
interface Structure { parts: { kind: PartKind; length: number; text?: string }[]; program_codes: Record<string, string>; section_codes: Record<string, string> }
interface AdminFields extends PublicFields { register_structure: Structure; programs: { id: number; label: string }[] }
const PART_NAMES: Record<PartKind, string> = { year: "Year", program: "Program", section: "Section", serial: "Student's own number", fixed: "Fixed text" };
const SAMPLE: Record<PartKind, (length: number, text: string) => string> = {
  year: (n) => "2025".slice(-n), program: (n) => "47".padEnd(n, "7").slice(0, n), section: (n) => "2".padEnd(n, "0").slice(0, n), serial: (n) => "37".padStart(n, "0").slice(-n), fixed: (_n, text) => text,
};

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
  const [parts, setParts] = useState<PartRow[]>([]);
  const [programs, setPrograms] = useState<{ id: number; label: string }[]>([]);
  const [programCodes, setProgramCodes] = useState<Record<string, string>>({});
  const [sectionCodes, setSectionCodes] = useState<{ name: string; code: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const applyLoaded = (data: AdminFields) => {
    setFormats({ register_no: data.id_formats.register_no.pattern, employee_no: data.id_formats.employee_no.pattern });
    setParts(data.register_structure.parts.map((part) => ({ kind: part.kind, length: part.length, text: part.text ?? "" })));
    setPrograms(data.programs);
    setProgramCodes(data.register_structure.program_codes);
    setSectionCodes(Object.entries(data.register_structure.section_codes).map(([name, code]) => ({ name, code })));
    setRows(data.custom.map(toRow));
  };

  const load = async () => {
    setError("");
    try {
      applyLoaded((await requestJson<{ fields: AdminFields }>(ENDPOINT)).fields);
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
        id_formats: {
          register_no: {
            pattern: formats.register_no,
            parts: parts.map((part) => (part.kind === "fixed" ? { kind: part.kind, text: part.text } : { kind: part.kind, length: part.length })),
            program_codes: programCodes,
            section_codes: Object.fromEntries(sectionCodes.filter((row) => row.name.trim() && row.code.trim()).map((row) => [row.name.trim(), row.code.trim()])),
          },
          employee_no: { pattern: formats.employee_no },
        },
        custom: rows.map((row) => ({ ...row, choices: row.type === "choice" ? row.choices.split(",").map((c) => c.trim()).filter(Boolean) : [] })),
      };
      const data = await requestJson<{ fields: AdminFields; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(body) });
      applyLoaded(data.fields);
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
        {parts.length === 0 && idField("register_no", t("register_no"))}
        {idField("employee_no", t("employee_no"))}
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("register_no")} by parts</h3>
          <p className="mt-1 max-w-xl text-xs text-slate-500">Describe what each part of the number means, for example 2547237 is the year (25), the program (47), the section (2) and the student's own number (37). A number that disagrees with the student's class, program or section is refused, and the message says what it should have been. Leave this empty to use the simple format above.</p>
        </div>
        <button type="button" onClick={() => setParts([...parts, { kind: "year", length: 2, text: "" }])} disabled={parts.length >= 6} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />Add a part</button>
      </div>
      {parts.map((part, index) => <div key={index} className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-slate-700">Part {index + 1}
          <select value={part.kind} onChange={(e) => setParts(parts.map((p, i) => (i === index ? { ...p, kind: e.target.value as PartKind } : p)))} className={inputClass} aria-label={`Number part ${index + 1} meaning`}>
            {(Object.keys(PART_NAMES) as PartKind[]).map((kind) => <option key={kind} value={kind}>{PART_NAMES[kind]}</option>)}
          </select>
        </label>
        {part.kind === "fixed"
          ? <label className="block text-sm text-slate-700">Text<input value={part.text} maxLength={6} onChange={(e) => setParts(parts.map((p, i) => (i === index ? { ...p, text: e.target.value } : p)))} className={`${inputClass} w-28`} aria-label={`Number part ${index + 1} text`} /></label>
          : <label className="block text-sm text-slate-700">Characters
            <select value={part.length} onChange={(e) => setParts(parts.map((p, i) => (i === index ? { ...p, length: Number(e.target.value) } : p)))} className={`${inputClass} w-24`} aria-label={`Number part ${index + 1} length`}>
              {(part.kind === "year" ? [2, 4] : [1, 2, 3, 4, 5, 6]).map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>}
        <button type="button" onClick={() => setParts(parts.filter((_, i) => i !== index))} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-rose-700 hover:underline"><Trash2 className="h-4 w-4" />Remove</button>
      </div>)}
      {parts.length > 0 && <>
        <p className="text-sm text-slate-700">Example: <span className="font-mono font-semibold">{parts.map((p) => SAMPLE[p.kind](p.length, p.text)).join("")}</span></p>
        {parts.some((p) => p.kind === "program") && <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-700">Program codes</legend>
          <p className="text-xs text-slate-500">The code each program carries in the number. A program left blank is not checked for this part.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {programs.length === 0 && <p className="text-sm text-slate-500">No programs yet. Add them under Structure.</p>}
            {programs.map((program) => <label key={program.id} className="flex items-center gap-3 text-sm text-slate-700"><span className="flex-1">{program.label}</span>
              <input value={programCodes[String(program.id)] ?? ""} maxLength={6} onChange={(e) => setProgramCodes({ ...programCodes, [String(program.id)]: e.target.value })} className={`${inputClass} w-24 !mt-0`} aria-label={`Code for ${program.label}`} />
            </label>)}
          </div>
        </fieldset>}
        {parts.some((p) => p.kind === "section") && <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-700">Section codes</legend>
          <p className="text-xs text-slate-500">Sections named with a single letter default to A=1, B=2 and so on. Add a row only to change that, or for sections with other names.</p>
          {sectionCodes.map((row, index) => <div key={index} className="flex items-center gap-3">
            <input value={row.name} placeholder="Section name" maxLength={30} onChange={(e) => setSectionCodes(sectionCodes.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))} className={`${inputClass} w-40 !mt-0`} aria-label={`Section name ${index + 1}`} />
            <input value={row.code} placeholder="Code" maxLength={6} onChange={(e) => setSectionCodes(sectionCodes.map((r, i) => (i === index ? { ...r, code: e.target.value } : r)))} className={`${inputClass} w-24 !mt-0`} aria-label={`Section code ${index + 1}`} />
            <button type="button" onClick={() => setSectionCodes(sectionCodes.filter((_, i) => i !== index))} className="text-sm font-semibold text-rose-700 hover:underline">Remove</button>
          </div>)}
          <button type="button" onClick={() => setSectionCodes([...sectionCodes, { name: "", code: "" }])} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:underline"><Plus className="h-4 w-4" />Add a section code</button>
        </fieldset>}
      </>}
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
