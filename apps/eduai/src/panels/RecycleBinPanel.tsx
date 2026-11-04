import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { DeletedItem } from "../types";
import { Badge, EmptyState, ErrorState, PanelCard, PanelHeader, SkeletonRows, TableShell, Th, timeAgo, useConfirm, useToast } from "../ui";

const typeLabel = (key: string) => {
  const name = key.split(".").pop() ?? key;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
};

export function RecycleBinPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<DeletedItem[] | null>(null);
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

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

  const restore = async (item: DeletedItem) => {
    const ok = await confirm({ title: `Restore ${item.label}?`, message: `It will return as an active ${typeLabel(item.content_type).toLowerCase()}.`, confirmLabel: "Restore" });
    if (!ok) return;
    const key = `${item.content_type}-${item.id}`;
    setBusyKey(key);
    try {
      await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/recycle-bin/${item.content_type}/${item.id}/restore/`, { method: "POST" });
      toast.success(`${item.label} restored.`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore the record.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <PanelCard>
      <PanelHeader title="Recycle bin" subtitle="Deactivated records are kept here and can be restored. Restore a parent (for example a school) before its contents." />
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
                  <td className="p-3 text-right sm:p-4"><button disabled={busyKey === key} onClick={() => void restore(item)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Restore</button></td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </PanelCard>
  );
}
