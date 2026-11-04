import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { Campus } from "../types";
import { EmptyState, ErrorState, Modal, PanelCard, PanelHeader, PrimaryButton, SkeletonRows, TableShell, Th, inputClass, useConfirm, useToast } from "../ui";

const FIELDS = [
  { key: "name", label: "Campus name", placeholder: "Central Campus", required: true },
  { key: "code", label: "Code", placeholder: "CEN", required: true },
  { key: "city", label: "City", placeholder: "Bengaluru", required: true },
  { key: "state", label: "State", placeholder: "Karnataka", required: true },
  { key: "address", label: "Address", placeholder: "Street, area, PIN", required: false },
] as const;

function CampusForm({ campus, onClose, onSaved }: { campus: Campus | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: campus?.name ?? "", code: campus?.code ?? "", city: campus?.city ?? "", state: campus?.state ?? "", address: campus?.address ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await requestJson(campus ? `${API_ENDPOINTS.MASTER_ADMIN}/campuses/${campus.id}/` : `${API_ENDPOINTS.MASTER_ADMIN}/campuses/`, { method: campus ? "PUT" : "POST", body: JSON.stringify(form) });
      toast.success(campus ? "Campus updated." : "Campus added.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the campus.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={campus ? "Edit campus" : "Add campus"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-sm text-slate-700">{field.label}
            <input required={field.required} placeholder={field.placeholder} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} className={inputClass} />
          </label>
        ))}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:text-slate-900">Cancel</button>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export function CampusPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [campuses, setCampuses] = useState<Campus[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Campus | null | "new">(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setCampuses((await requestJson<{ results: Campus[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/`)).results);
    } catch (err) {
      setCampuses([]);
      setError(err instanceof Error ? err.message : "Could not load campuses.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const deactivate = async (campus: Campus) => {
    const ok = await confirm({
      title: `Deactivate ${campus.name}?`,
      message: "Its schools, departments, programs, classes and sections move to the Recycle Bin with it. You can restore them later.",
      confirmLabel: "Deactivate", tone: "danger",
    });
    if (!ok) return;
    try {
      await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/${campus.id}/`, { method: "DELETE" });
      toast.success(`${campus.name} deactivated.`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate the campus.");
    }
  };

  const visible = (campuses ?? []).filter((campus) => `${campus.name} ${campus.code} ${campus.city}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <PanelCard>
      <PanelHeader title="Campuses" subtitle="The campuses of your university. Open Institution Structure to build the schools and classes inside each one."
        actions={<PrimaryButton tone="emerald" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add campus</PrimaryButton>} />
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      {campuses === null ? <SkeletonRows rows={4} cols={5} /> : visible.length === 0 ? (
        <EmptyState icon={<Building2 className="h-5 w-5" />} title={campuses.length ? "No campus matches this search" : "No campuses yet"} hint={campuses.length ? undefined : "Add the first campus of your university."}
          action={!campuses.length && <PrimaryButton tone="emerald" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add campus</PrimaryButton>} />
      ) : (
        <TableShell>
          <thead><tr><Th>Campus</Th><Th>City</Th><Th>Schools</Th><Th>Departments</Th><Th>Students</Th><Th right>Actions</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((campus) => (
              <tr key={campus.id} className="hover:bg-slate-50/40">
                <td className="p-3 sm:p-4"><p className="font-semibold text-slate-900">{campus.name}</p><p className="text-xs text-slate-500">{campus.code}</p></td>
                <td className="p-3 text-slate-700 sm:p-4">{campus.city}{campus.state ? `, ${campus.state}` : ""}</td>
                <td className="p-3 sm:p-4">{campus.schools}</td>
                <td className="p-3 sm:p-4">{campus.departments}</td>
                <td className="p-3 sm:p-4">{campus.students}</td>
                <td className="p-3 text-right sm:p-4">
                  <button onClick={() => setEditing(campus)} className="mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-blue hover:bg-brand-blue/10"><Pencil className="h-3.5 w-3.5" />Edit</button>
                  <button onClick={() => void deactivate(campus)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {editing && <CampusForm campus={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); onChanged(); }} />}
    </PanelCard>
  );
}

