import { useEffect, useState } from "react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/modules/`;

interface ModuleRow { key: string; label: string; audience: string; description: string; enabled: boolean }

/** Switch whole modules on or off for the university. Switching off hides and blocks; it never deletes. */
export function ModulesPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [saved, setSaved] = useState<ModuleRow[] | null>(null);
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const show = (rows: ModuleRow[]) => {
    setSaved(rows);
    setStates(Object.fromEntries(rows.map((row) => [row.key, row.enabled])));
  };

  const load = async () => {
    setError("");
    try {
      show((await requestJson<{ modules: ModuleRow[] }>(ENDPOINT)).modules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the modules.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!saved) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading modules...</p>;

  const changes = saved.filter((row) => states[row.key] !== row.enabled);
  const turningOff = changes.filter((row) => !states[row.key]);

  const save = async () => {
    if (turningOff.length) {
      const ok = await confirm({
        title: `Switch off ${turningOff.length === 1 ? turningOff[0].label : `${turningOff.length} modules`}?`,
        message: `${turningOff.map((row) => row.label).join(", ")} will disappear for everyone and stop working straight away. Nothing is deleted: switch it back on at any time and everything returns.`,
        confirmLabel: "Switch off", tone: "danger",
      });
      if (!ok) return;
    }
    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(changes.map((row) => [row.key, states[row.key]]));
      const data = await requestJson<{ modules: ModuleRow[]; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(body) });
      show(data.modules);
      setUniversity(data.university);
      toast.success("Modules saved. Every portal now follows them.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the modules.");
    } finally {
      setSaving(false);
    }
  };

  return <PanelCard className="space-y-4">
    <div>
      <h3 className="text-base font-semibold">Modules</h3>
      <p className="mt-1 text-xs text-slate-500">Switch off what your university does not use. It disappears from every portal and its features stop working, but nothing is deleted: switch it back on and everything returns as it was.</p>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {saved.map((row) => {
        const on = states[row.key];
        return <li key={row.key} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{row.description} <span className="text-slate-400">· {row.audience}</span></p>
          </div>
          <button
            type="button" role="switch" aria-checked={on} aria-label={`${row.label}: ${on ? "on" : "off"}`}
            onClick={() => setStates((current) => ({ ...current, [row.key]: !current[row.key] }))}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-600" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </li>;
      })}
    </ul>
    <div className="flex items-center justify-end gap-3">
      {changes.length > 0 && <span className="text-xs text-slate-500">{changes.length} unsaved change{changes.length === 1 ? "" : "s"}</span>}
      <button type="button" onClick={() => void save()} disabled={saving || changes.length === 0} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save modules"}</button>
    </div>
  </PanelCard>;
}
