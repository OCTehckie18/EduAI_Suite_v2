import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { PanelCard, useConfirm, useToast } from "./ui";

type Status = "signed_up" | "not_signed_up" | "deactivated";

interface StaffEntry {
  id: number;
  emp_no: string;
  name: string;
  email: string;
  campus: string;
  school: string;
  department: string;
  designation: string;
  status: Status;
  account_created: boolean;
}

interface StaffList { total: number; signed_up: number; count: number; results: StaffEntry[] }
interface ImportResult { created: number; updated: number; unchanged: number; errors: { row: number; error: string }[] }

const ROSTER = `${API_BASE_URL}/master-admin/staff-roster`;
const FILTERS = [["all", "All"], ["not_signed_up", "Not signed up"], ["signed_up", "Signed up"], ["deactivated", "Deactivated"]] as const;
const STATUS_LABEL: Record<Status, string> = { signed_up: "Signed up", not_signed_up: "Not signed up", deactivated: "Deactivated" };

export function StaffRosterPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<"all" | Status>("all");
  const [data, setData] = useState<StaffList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await requestJson<StaffList>(`${ROSTER}/?status=${status}&search=${encodeURIComponent(search)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the teacher roster.");
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => { void load(); }, [load]);

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
      const response = await fetch(`${ROSTER}/import/`, { method: "POST", headers: authHeaders(), body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "The upload failed.");
      setResult(payload);
      toast.success(`Teacher roster imported: ${payload.created} added, ${payload.updated} updated.`);
      await load();
      onChanged(); // a waiting applicant who was just listed is now approved
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const download = async () => {
    try {
      const response = await fetch(`${ROSTER}/template/`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Could not download the roster.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `teachers_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the roster.");
    }
  };

  const remove = async (entry: StaffEntry) => {
    const ok = await confirm({ title: `Remove ${entry.name || entry.emp_no}?`, message: `${entry.email} will no longer be approved automatically on TeacherBuddy unless you add them again.`, confirmLabel: "Remove", tone: "danger" });
    if (!ok) return;
    try {
      await requestJson(`${ROSTER}/${entry.id}/`, { method: "DELETE" });
      toast.success("Removed from the roster.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this teacher.");
    }
  };

  return <PanelCard className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold">Teacher roster</h3>
        <p className="mt-1 max-w-xl text-xs text-slate-500">Teachers listed here are approved automatically when they sign in on TeacherBuddy, and their department and employee number come from this list. Teachers who are not listed can still apply above.</p>
        <p className="mt-1 max-w-xl text-xs text-slate-500">To add teachers: download the roster, add the new teachers at the bottom and upload the same file. Teachers who are not in the file are kept.</p>
        {data && <p className="mt-2 text-xs text-slate-700">{data.total} listed · {data.signed_up} signed up · {data.total - data.signed_up} not yet</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => void download()} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:text-slate-900"><Download className="h-4 w-4" />{data && data.total ? "Download roster" : "Download template"}</button>
        <button onClick={() => fileInput.current?.click()} disabled={uploading} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Upload className="h-4 w-4" />{uploading ? "Uploading..." : "Upload roster"}</button>
        <input ref={fileInput} type="file" accept=".csv,.xlsx" onChange={upload} className="hidden" />
      </div>
    </div>

    {result && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="font-semibold">Import finished: {result.created} added, {result.updated} updated, {result.unchanged} unchanged{result.errors.length ? `, ${result.errors.length} rows need attention` : ""}.</p>
      {result.errors.length > 0 && <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-amber-800">{result.errors.map((e) => <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>)}</ul>}
    </div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    <div className="flex flex-wrap gap-2">{FILTERS.map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${status === value ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-700 hover:text-slate-900"}`}>{label}</button>)}</div>

    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Teacher</th><th className="p-4">Employee no.</th><th className="p-4">Department</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data?.results.map((entry) => <tr key={entry.id} className="hover:bg-slate-50/40">
            <td className="p-4"><p className="font-semibold">{entry.name || "—"}</p><p className="text-xs text-slate-500">{entry.email}</p></td>
            <td className="p-4 text-slate-700">{entry.emp_no}{entry.designation && <p className="text-xs text-slate-500">{entry.designation}</p>}</td>
            <td className="p-4 text-xs text-slate-700">{entry.campus} › {entry.school} › {entry.department}</td>
            <td className="p-4"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.status === "signed_up" ? "bg-emerald-50 text-emerald-700" : entry.status === "deactivated" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{entry.status === "not_signed_up" && entry.account_created ? "Profile pending" : STATUS_LABEL[entry.status]}</span></td>
            <td className="p-4 text-right">{!entry.account_created && <button onClick={() => void remove(entry)} className="text-rose-700 hover:text-rose-800">Remove</button>}</td>
          </tr>)}
        </tbody>
      </table>
      {loading && <p className="p-8 text-center text-slate-500">Loading roster...</p>}
      {!loading && data && !data.results.length && <p className="p-8 text-center text-slate-500">{data.total ? "No teachers match this filter." : "The roster is empty. Download the template, fill it in and upload it."}</p>}
    </div>
    {data && data.count > data.results.length && <p className="text-xs text-slate-500">Showing the first {data.results.length} of {data.count}. Use the search box to narrow down.</p>}
  </PanelCard>;
}
