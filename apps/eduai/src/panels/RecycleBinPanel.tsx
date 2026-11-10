import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { DeletedItem, RestoreConflict, RestoreDetail, RestoreField } from "../types";
import { Badge, EmptyState, ErrorState, Modal, PanelCard, PanelHeader, PrimaryButton, SkeletonRows, TableShell, Th, inputClass, timeAgo, useToast } from "../ui";

const typeLabel = (key: string) => {
  const name = key.split(".").pop() ?? key;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
};

type Edits = Record<string, string>;

function FieldInputs({ fields, edits, onChange, idPrefix }: { fields: RestoreField[]; edits: Edits; onChange: (name: string, value: string) => void; idPrefix: string }) {
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = edits[field.name] ?? field.value;
        const common = { id: `${idPrefix}-${field.name}`, value, maxLength: field.max_length ?? undefined, className: inputClass };
        return (
          <label key={field.name} className="block text-sm text-slate-700">{field.label}
            {field.type === "textarea"
              ? <textarea {...common} rows={2} onChange={(event) => onChange(field.name, event.target.value)} />
              : <input {...common} type={field.type} onChange={(event) => onChange(field.name, event.target.value)} />}
          </label>
        );
      })}
    </div>
  );
}

/** Shows what is about to come back, lets the admin change it, and lists anything already using the same values. */
function RestoreDialog({ item, onClose, onRestored }: { item: DeletedItem; onClose: () => void; onRestored: () => void }) {
  const toast = useToast();
  const base = `${API_ENDPOINTS.MASTER_ADMIN}/recycle-bin/${item.content_type}/${item.id}/`;
  const [detail, setDetail] = useState<RestoreDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [edits, setEdits] = useState<Edits>({});
  const [existingEdits, setExistingEdits] = useState<Record<string, Edits>>({});
  const [conflicts, setConflicts] = useState<RestoreConflict[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requestJson<RestoreDetail>(base)
      .then((data) => { setDetail(data); setConflicts(data.conflicts); })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this record."));
  }, [base]);

  const changedOnly = (fields: RestoreField[], values: Edits) =>
    Object.fromEntries(fields.filter((f) => values[f.name] !== undefined && values[f.name] !== f.value).map((f) => [f.name, values[f.name]]));

  const submit = async () => {
    if (!detail) return;
    setSaving(true);
    setError("");
    setFieldErrors({});
    const existing: Record<string, Edits> = {};
    for (const conflict of conflicts) {
      const key = `${conflict.record.content_type}:${conflict.record.id}`;
      const changed = changedOnly(conflict.record.fields, existingEdits[key] ?? {});
      if (Object.keys(changed).length) existing[key] = changed;
    }
    try {
      await requestJson(`${base}restore/`, { method: "POST", body: JSON.stringify({ changes: changedOnly(detail.fields, edits), existing_changes: existing }) });
      toast.success(`${item.label} restored.`);
      onRestored();
    } catch (err) {
      const body = (err as { body?: { errors?: Record<string, string>; conflicts?: RestoreConflict[] } }).body;
      if (body?.errors) setFieldErrors(body.errors);
      if (body?.conflicts) setConflicts(body.conflicts);
      setError(err instanceof Error ? err.message : "Could not restore the record.");
    } finally {
      setSaving(false);
    }
  };

  // Name only the fields the admin can actually change (not the parent the code is unique within).
  const clashing = Array.from(new Set(conflicts.flatMap((c) => c.fields.filter((name) => c.record.fields.some((f) => f.name === name))))).join(", ").replace(/_/g, " ");

  return (
    <Modal title={`Restore ${item.label}`} onClose={onClose}>
      {loadError ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</p> : !detail ? <SkeletonRows rows={3} cols={1} /> : (
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {detail.blockers.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Restore these first:</p>
              <ul className="mt-1 list-disc pl-5">{detail.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </div>
          )}
          {conflicts.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Another record already uses the same {clashing}. Change it on this record, on the existing one, or both.</p>}
          <div className={conflicts.length ? "grid gap-4 sm:grid-cols-2" : ""}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{conflicts.length ? "Record being restored" : "Details (change anything before restoring)"}</p>
              {detail.fields.length
                ? <FieldInputs fields={detail.fields} edits={edits} idPrefix="restore" onChange={(name, value) => setEdits({ ...edits, [name]: value })} />
                : <p className="text-sm text-slate-600">This record has no editable details.</p>}
              {Object.entries(fieldErrors).map(([name, message]) => <p key={name} className="mt-2 text-xs text-rose-700">{name}: {message}</p>)}
            </div>
            {conflicts.map((conflict) => {
              const key = `${conflict.record.content_type}:${conflict.record.id}`;
              return (
                <div key={key}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Existing record{conflict.record.is_active ? "" : " (deactivated)"}: {conflict.record.label}</p>
                  <FieldInputs fields={conflict.record.fields} edits={existingEdits[key] ?? {}} idPrefix={`existing-${conflict.record.id}`}
                    onChange={(name, value) => setExistingEdits({ ...existingEdits, [key]: { ...existingEdits[key], [name]: value } })} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:text-slate-900">Cancel</button>
            <PrimaryButton type="button" disabled={saving || detail.blockers.length > 0} onClick={() => void submit()}>{saving ? "Restoring..." : "Restore"}</PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function RecycleBinPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const [items, setItems] = useState<DeletedItem[] | null>(null);
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState<DeletedItem | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems((await requestJson<{ results: DeletedItem[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/recycle-bin/?search=${encodeURIComponent(search)}`)).results);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Could not load the recycle bin.");
    }
  }, [search]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(handle);
  }, [load]);

  const types = useMemo(() => Array.from(new Set((items ?? []).map((item) => item.content_type))).sort(), [items]);
  const visible = (items ?? []).filter((item) => !type || item.content_type === type);

  return (
    <PanelCard>
      <PanelHeader title="Recycle bin" subtitle="Deactivated records are kept here and can be restored, with their details changed if you wish. Restore a parent (for example a school) before its contents." />
      {types.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["", ...types].map((key) => <button key={key || "all"} onClick={() => setType(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${type === key ? "bg-brand-blue text-white" : "border border-slate-300 text-slate-700 hover:text-slate-900"}`}>{key ? typeLabel(key) : "Everything"}</button>)}
        </div>
      )}
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      {items === null ? <SkeletonRows rows={4} cols={4} /> : visible.length === 0 ? (
        <EmptyState icon={<Trash2 className="h-5 w-5" />} title="The recycle bin is empty" hint="Deactivated campuses, schools, classes, users and more will show up here." />
      ) : (
        <TableShell>
          <thead><tr><Th>Type</Th><Th>Record</Th><Th>Deactivated</Th><Th right>Action</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((item) => {
              const key = `${item.content_type}-${item.id}`;
              return (
                <tr key={key} className="hover:bg-slate-50/40">
                  <td className="p-3 sm:p-4"><Badge tone="stone">{typeLabel(item.content_type)}</Badge></td>
                  <td className="p-3 font-medium text-slate-900 sm:p-4">{item.label}</td>
                  <td className="p-3 text-xs text-slate-500 sm:p-4" title={item.deleted_at ? new Date(item.deleted_at).toLocaleString() : ""}>{timeAgo(item.deleted_at)}</td>
                  <td className="p-3 text-right sm:p-4"><button onClick={() => setRestoring(item)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><RotateCcw className="h-3.5 w-3.5" />Restore</button></td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
      {restoring && <RestoreDialog item={restoring} onClose={() => setRestoring(null)} onRestored={() => { setRestoring(null); void load(); onChanged(); }} />}
    </PanelCard>
  );
}
