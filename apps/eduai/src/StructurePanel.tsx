import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Building2, ChevronRight, GraduationCap, Landmark, Layers, LayoutGrid, Pencil, Plus, Trash2, Users } from "lucide-react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { Modal, PanelCard, useConfirm, useToast } from "./ui";

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

const inputClass = "w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900";

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

  return <Modal title={row ? `Edit ${level.single}` : `Add ${level.single}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {level.fields.map((field) => <label key={field.name} className="block text-sm text-slate-700">{field.label}
        {field.type === "select"
          ? <select value={values[field.name]} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className={`${inputClass} mt-1`}>{field.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : <input required type={field.type} min={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} value={values[field.name]} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className={`${inputClass} mt-1`} />}
      </label>)}
      {!row && level.endpoint === "batches" && <p className="text-xs text-slate-500">A new class starts with Section A. Add more sections afterwards.</p>}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div>
    </form>
  </Modal>;
}

const LEVEL_ICONS = [Building2, Landmark, Layers, GraduationCap, Users, LayoutGrid];
const LEVEL_TONES = [
  "bg-blue-50 text-blue-700",
  "bg-amber-50 text-amber-700",
  "bg-emerald-50 text-emerald-700",
  "bg-sky-50 text-sky-700",
  "bg-rose-50 text-rose-700",
  "bg-slate-100 text-slate-700",
];

const SINGULAR: Record<string, string> = { schools: "school", departments: "department", programs: "program", classes: "class", sections: "section", students: "student" };
const countLabel = (n: number, plural: string) => `${n} ${n === 1 ? SINGULAR[plural] ?? plural : plural}`;

type Branch = { rows: Row[]; total: number } | "loading" | { error: string };
const keyOf = (depth: number, id: number) => `${depth}:${id}`;
const ROOT = "root";

/**
 * Campus > School > Department > Program > Class > Section as one tree.
 * A branch loads its children the first time it is opened, so a large university stays quick.
 */
export function StructurePanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
type Ref = { key: string; id: number | null; depth: number };
  const [form, setForm] = useState<{ depth: number; row: Row | null; parent: Ref; above?: Ref } | null>(null);
  const [expandingAll, setExpandingAll] = useState(false);
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  /** Load the children of `parentKey` (the campuses for ROOT). Returns the rows. */
  const loadBranch = useCallback(async (parentKey: string, childDepth: number, parentId: number | null): Promise<Row[]> => {
    const level = LEVELS[childDepth];
    setBranches((b) => ({ ...b, [parentKey]: "loading" }));
    try {
      const filter = level.parentParam && parentId != null ? `&${level.parentParam}=${parentId}` : "";
      const data = await requestJson<{ results: Row[]; count: number }>(`${API_BASE_URL}/institution/${level.endpoint}/?page_size=200${filter}`);
      setBranches((b) => ({ ...b, [parentKey]: { rows: data.results, total: data.count } }));
      return data.results;
    } catch (err) {
      setBranches((b) => ({ ...b, [parentKey]: { error: err instanceof Error ? err.message : `Could not load ${level.plural.toLowerCase()}.` } }));
      return [];
    }
  }, []);

  useEffect(() => { void loadBranch(ROOT, 0, null); }, [loadBranch]);

  const toggle = (depth: number, row: Row) => {
    const key = keyOf(depth, row.id);
    const next = new Set(open);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (!branchesRef.current[key]) void loadBranch(key, depth + 1, row.id);
    }
    setOpen(next);
  };

  /** Open every branch, level by level. */
  const expandAll = async () => {
    setExpandingAll(true);
    const keys = new Set(open);
    let frontier: { key: string; depth: number; id: number | null }[] = [{ key: ROOT, depth: -1, id: null }];
    for (let childDepth = 0; childDepth < LEVELS.length && frontier.length; childDepth++) {
      const next: typeof frontier = [];
      await Promise.all(frontier.map(async (node) => {
        const existing = branchesRef.current[node.key];
        const rows = existing && typeof existing === "object" && "rows" in existing ? existing.rows : await loadBranch(node.key, childDepth, node.id);
        if (node.key !== ROOT) keys.add(node.key);
        if (childDepth < LEVELS.length - 1) rows.forEach((r) => next.push({ key: keyOf(childDepth, r.id), depth: childDepth, id: r.id }));
      }));
      frontier = next;
    }
    setOpen(keys);
    setExpandingAll(false);
  };

  // Searching needs the whole tree, so open it once when a search starts.
  const searching = search.trim().length > 0;
  useEffect(() => { if (searching) void expandAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [searching]);

  /** Reload a branch after a change, and the branch above it so its child count stays right. */
  const refresh = async (parent: { key: string; id: number | null; depth: number }, grandparent?: { key: string; id: number | null; depth: number }) => {
    await loadBranch(parent.key, parent.depth + 1, parent.id);
    if (grandparent) await loadBranch(grandparent.key, grandparent.depth + 1, grandparent.id);
    onChanged();
  };

  const remove = async (depth: number, row: Row, parent: { key: string; id: number | null; depth: number }, grandparent?: { key: string; id: number | null; depth: number }) => {
    const level = LEVELS[depth];
    const note = level.endpoint === "sections" ? "It moves to the Recycle Bin." : "Everything below it moves to the Recycle Bin too.";
    const ok = await confirm({ title: `Deactivate ${row.name}?`, message: `${note} You can restore it from the Recycle Bin.`, confirmLabel: "Deactivate", tone: "danger" });
    if (!ok) return;
    try {
      await requestJson(`${API_BASE_URL}/institution/${level.endpoint}/${row.id}/`, { method: "DELETE" });
      toast.success(`${row.name} deactivated.`);
      await refresh(parent, grandparent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not deactivate the ${level.single.toLowerCase()}.`);
    }
  };

  const needle = search.trim().toLowerCase();
  /** Does this node, or anything loaded below it, match the search? */
  const matches = (depth: number, row: Row): boolean => {
    if (!needle) return true;
    if (`${row.name} ${row.code ?? ""}`.toLowerCase().includes(needle)) return true;
    const branch = branches[keyOf(depth, row.id)];
    return !!branch && typeof branch === "object" && "rows" in branch && branch.rows.some((child) => matches(depth + 1, child));
  };

  const selfMatch = (row: Row) => !needle || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(needle);

  // `showAll`: an ancestor matched the search itself, so everything under it is relevant.
  const renderBranch = (parentKey: string, childDepth: number, parentId: number | null, grandparent?: { key: string; id: number | null; depth: number }, showAll = false) => {
    const branch = branches[parentKey];
    const level = LEVELS[childDepth];
    const parent = { key: parentKey, id: parentId, depth: childDepth - 1 };
    if (!branch || branch === "loading") return <p className="py-2 pl-10 text-xs text-slate-500">Loading {level.plural.toLowerCase()}...</p>;
    if ("error" in branch) return <p className="py-2 pl-10 text-xs text-rose-700">{branch.error} <button className="underline" onClick={() => void loadBranch(parentKey, childDepth, parentId)}>Retry</button></p>;
    const rows = showAll ? branch.rows : branch.rows.filter((row) => matches(childDepth, row));
    const Icon = LEVEL_ICONS[childDepth];
    return <ul role="group" className={childDepth > 0 ? "ml-5 border-l border-slate-200 pl-3" : ""}>
      {rows.map((row) => {
        const key = keyOf(childDepth, row.id);
        const isLeaf = childDepth === LEVELS.length - 1;
        const isOpen = open.has(key);
        const childLevel = LEVELS[childDepth + 1];
        return <li key={key} role="treeitem" aria-expanded={isLeaf ? undefined : isOpen} aria-level={childDepth + 1}>
          <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            {isLeaf
              ? <span className="h-6 w-6 shrink-0" />
              : <button onClick={() => toggle(childDepth, row)} aria-label={`${isOpen ? "Collapse" : "Expand"} ${row.name}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200">
                  <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>}
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${LEVEL_TONES[childDepth]}`} title={level.single}><Icon className="h-4 w-4" /></span>
            <button onClick={() => !isLeaf && toggle(childDepth, row)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-slate-900">{row.name}</span>
              <span className="block truncate text-xs text-slate-500">{level.single} · {level.subtitle(row)} · {countLabel(row.child_count ?? 0, level.childLabel)}</span>
            </button>
            <span className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {childLevel && <button onClick={() => setForm({ depth: childDepth + 1, row: null, parent: { key, id: row.id, depth: childDepth }, above: parent })} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50" aria-label={`Add ${childLevel.single.toLowerCase()} to ${row.name}`}><Plus className="h-3.5 w-3.5" />{childLevel.single}</button>}
              {childDepth > 0 && <button onClick={() => setForm({ depth: childDepth, row, parent, above: grandparent })} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" /></button>}
              {childDepth > 0 && <button onClick={() => void remove(childDepth, row, parent, grandparent)} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-50" aria-label={`Deactivate ${row.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </span>
          </div>
          {!isLeaf && isOpen && renderBranch(key, childDepth + 1, row.id, parent, showAll || (needle !== "" && selfMatch(row)))}
        </li>;
      })}
      {!rows.length && <li className="py-2 pl-10 text-xs text-slate-500">{branch.rows.length ? "Nothing here matches the search." : `No ${level.plural.toLowerCase()} yet.`}</li>}
      {branch.total > branch.rows.length && <li className="py-1 pl-10 text-xs text-slate-500">Showing the first {branch.rows.length} of {branch.total}.</li>}
    </ul>;
  };

  return <PanelCard className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold">University structure</h3>
        <p className="mt-1 text-xs text-slate-500">Campus › School › Department › Program › Class › Section. Open a branch to see what is inside, and use the buttons on a row to add, edit or deactivate. Add campuses under Campuses.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void expandAll()} disabled={expandingAll} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{expandingAll ? "Opening..." : "Expand all"}</button>
        <button onClick={() => setOpen(new Set())} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Collapse all</button>
      </div>
    </div>
    <div role="tree" aria-label="University structure" className="rounded-xl border border-slate-200 p-2">
      {renderBranch(ROOT, 0, null)}
    </div>
    {form && <RecordForm level={LEVELS[form.depth]} row={form.row} parentId={form.parent.id} onClose={() => setForm(null)}
      onSaved={() => {
        const target = form;
        setForm(null);
        if (!target.row) setOpen((o) => new Set(o).add(target.parent.key)); // show what was just added
        // Reload the branch that changed, and the one above it so its child count stays right.
        void refresh(target.parent, target.above);
      }} />}
  </PanelCard>;
}
