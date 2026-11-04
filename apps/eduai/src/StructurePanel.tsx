import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";

type Row = Record<string, any>;

interface Field {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  initial?: string;
}

interface Level {
  endpoint: string;
  single: string;
  plural: string;
  parentParam?: string;
  parentField?: string;
  childLabel: string;
  fields: Field[];
  subtitle: (row: Row) => string;
}

// Campus > School > Department > Program > Class (batch) > Section
const LEVELS: Level[] = [
  { endpoint: "campuses", single: "Campus", plural: "Campuses", childLabel: "schools", fields: [], subtitle: (r) => `${r.code} · ${r.city}` },
  {
    endpoint: "schools", single: "School", plural: "Schools", parentParam: "campus_id", parentField: "campus", childLabel: "departments",
    fields: [{ name: "name", label: "School name", type: "text", placeholder: "School of Sciences" }, { name: "code", label: "Code", type: "text", placeholder: "SOS" }],
    subtitle: (r) => r.code,
  },
  {
    endpoint: "departments", single: "Department", plural: "Departments", parentParam: "school_id", parentField: "school", childLabel: "programs",
    fields: [{ name: "name", label: "Department name", type: "text", placeholder: "Computer Science" }, { name: "code", label: "Code", type: "text", placeholder: "CSE" }],
    subtitle: (r) => r.code,
  },
  {
    endpoint: "programs", single: "Program", plural: "Programs", parentParam: "department_id", parentField: "department", childLabel: "classes",
    fields: [
      { name: "name", label: "Program name", type: "text", placeholder: "Bachelor of Computer Applications" },
      { name: "code", label: "Code", type: "text", placeholder: "BCA" },
      { name: "degree_level", label: "Level", type: "select", initial: "UG", options: [{ value: "UG", label: "Undergraduate" }, { value: "PG", label: "Postgraduate" }, { value: "PHD", label: "Doctorate" }] },
      { name: "duration_years", label: "Duration (years)", type: "number", initial: "3" },
    ],
    subtitle: (r) => `${r.code} · ${r.degree_level} · ${r.duration_years} yr`,
  },
  {
    endpoint: "batches", single: "Class", plural: "Classes", parentParam: "program_id", parentField: "program", childLabel: "sections",
    fields: [
      { name: "name", label: "Class name", type: "text", placeholder: "2026-29" },
      { name: "start_year", label: "Start year", type: "number", initial: String(new Date().getFullYear()) },
      { name: "end_year", label: "End year", type: "number", initial: String(new Date().getFullYear() + 3) },
      { name: "academic_year", label: "Academic year", type: "text", placeholder: "2026-27" },
    ],
    subtitle: (r) => `${r.start_year}–${r.end_year} · ${r.academic_year}`,
  },
  {
    endpoint: "sections", single: "Section", plural: "Sections", parentParam: "batch_id", parentField: "batch", childLabel: "students",
    fields: [{ name: "name", label: "Section name", type: "text", placeholder: "B" }, { name: "max_capacity", label: "Capacity", type: "number", initial: "60" }],
    subtitle: (r) => `Capacity ${r.max_capacity}`,
  },
];

const inputClass = "w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white";

function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} className="text-stone-400 hover:text-white">✕</button></div>{children}</div></div>;
}

function RecordForm({ level, row, parentId, onClose, onSaved }: { level: Level; row: Row | null; parentId: number | null; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(level.fields.map((f) => [f.name, row ? String(row[f.name] ?? "") : f.initial ?? ""])),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body: Row = {};
    for (const field of level.fields) body[field.name] = field.type === "number" ? Number(values[field.name]) : values[field.name].trim();
    if (!row && level.parentField) body[level.parentField] = parentId;
    try {
      await requestJson(`${API_BASE_URL}/institution/${level.endpoint}/${row ? `${row.id}/` : ""}`, { method: row ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save the ${level.single.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  return <FormModal title={row ? `Edit ${level.single}` : `Add ${level.single}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {level.fields.map((field) => <label key={field.name} className="block text-sm text-stone-300">{field.label}
        {field.type === "select"
          ? <select value={values[field.name]} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className={`${inputClass} mt-1`}>{field.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : <input required type={field.type} min={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} value={values[field.name]} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className={`${inputClass} mt-1`} />}
      </label>)}
      {!row && level.endpoint === "batches" && <p className="text-xs text-stone-400">A new class starts with Section A. Add more sections afterwards.</p>}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div>
    </form>
  </FormModal>;
}

export function StructurePanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const [path, setPath] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ row: Row | null } | null>(null);

  const depth = path.length;
  const level = LEVELS[depth];
  const parent = depth > 0 ? path[depth - 1] : null;
  const readOnly = depth === 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filter = level.parentParam && parent ? `&${level.parentParam}=${parent.id}` : "";
      const data = await requestJson<{ results: Row[]; count: number }>(`${API_BASE_URL}/institution/${level.endpoint}/?page_size=100${filter}`);
      setRows(data.results);
      setTotal(data.count);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : `Could not load ${level.plural.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [level, parent]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (row: Row) => {
    const note = level.endpoint === "sections" ? "" : " Everything below it moves to the Recycle Bin too.";
    if (!window.confirm(`Deactivate ${row.name}?${note} You can restore it from the Recycle Bin.`)) return;
    try {
      await requestJson(`${API_BASE_URL}/institution/${level.endpoint}/${row.id}/`, { method: "DELETE" });
      await load();
      onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : `Could not deactivate the ${level.single.toLowerCase()}.`);
    }
  };

  const visible = rows.filter((row) => `${row.name} ${row.code ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return <section className="glass-card p-6 rounded-2xl space-y-5">
    <nav className="flex flex-wrap items-center gap-1 text-sm text-stone-400">
      <button onClick={() => setPath([])} className={depth === 0 ? "font-semibold text-white" : "hover:text-white"}>All campuses</button>
      {path.map((node, index) => <span key={node.id} className="flex items-center gap-1"><ChevronRight className="h-3 w-3" /><button onClick={() => setPath(path.slice(0, index + 1))} className={index === depth - 1 ? "font-semibold text-white" : "hover:text-white"}>{node.name}</button></span>)}
    </nav>
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-base font-semibold">{level.plural}{parent ? ` in ${parent.name}` : ""}</h3>
        <p className="mt-1 text-xs text-stone-400">{readOnly ? "Add or edit campuses under Campus Governance, then open one to build its structure." : `Open a ${level.single.toLowerCase()} to manage what is inside it.`}</p>
      </div>
      {!readOnly && <button onClick={() => setForm({ row: null })} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500"><Plus className="h-4 w-4" />Add {level.single}</button>}
    </div>
    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>}
    <div className="overflow-x-auto rounded-xl border border-stone-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-stone-900 text-xs uppercase text-stone-400"><tr><th className="p-4">{level.single}</th><th className="p-4">Details</th><th className="p-4">{level.childLabel}</th><th className="p-4 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-stone-800">
          {visible.map((row) => <tr key={row.id} className="hover:bg-stone-900/40">
            <td className="p-4 font-semibold">{row.name}</td>
            <td className="p-4 text-stone-300">{level.subtitle(row)}</td>
            <td className="p-4 text-stone-300">{row.child_count ?? 0}</td>
            <td className="p-4 text-right">
              {depth < LEVELS.length - 1 && <button onClick={() => setPath([...path, { id: row.id, name: row.name }])} className="mr-3 text-sky-300 hover:text-sky-200">Open</button>}
              {!readOnly && <><button onClick={() => setForm({ row })} className="mr-3 text-amber-300 hover:text-amber-200">Edit</button><button onClick={() => void remove(row)} className="text-rose-300 hover:text-rose-200">Deactivate</button></>}
            </td>
          </tr>)}
        </tbody>
      </table>
      {loading && <p className="p-8 text-center text-stone-500">Loading...</p>}
      {!loading && !visible.length && <p className="p-8 text-center text-stone-500">{rows.length ? "Nothing matches this search." : `No ${level.plural.toLowerCase()} yet.${readOnly ? "" : ` Use "Add ${level.single}" to create one.`}`}</p>}
    </div>
    {total > rows.length && <p className="text-xs text-stone-500">Showing the first {rows.length} of {total}.</p>}
    {form && <RecordForm level={level} row={form.row} parentId={parent?.id ?? null} onClose={() => setForm(null)} onSaved={() => { setForm(null); void load(); onChanged(); }} />}
  </section>;
}
