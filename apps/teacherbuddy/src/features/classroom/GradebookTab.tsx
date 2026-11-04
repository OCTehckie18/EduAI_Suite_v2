import React, { useCallback, useEffect, useState } from "react";
import { Download, Loader } from "lucide-react";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Cell { assignment_id: number; submission_id: number | null; submitted: boolean; grade: number | null }
interface Row { student_id: number; name: string; email: string; register_no: string | null; cells: Cell[]; earned: number; possible: number; percentage: number | null }
interface Gradebook {
  course: { id: number; code: string; name: string };
  assignments: { id: number; title: string; max_points: number }[];
  students: Row[];
}

const auth = (): Record<string, string> => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const GradebookTab: React.FC<{ courseId: number }> = ({ courseId }) => {
  const [data, setData] = useState<Gradebook | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`${API_ENDPOINTS.ASSIGNMENTS}/gradebook/${courseId}`, { headers: auth() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Could not load the gradebook.");
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load the gradebook.");
    }
  }, [courseId]);

  useEffect(() => { setData(null); void load(); }, [load]);

  const saveGrade = async (cell: Cell, raw: string) => {
    if (!cell.submission_id || raw.trim() === "" || Number(raw) === cell.grade) return;
    setSaving(cell.submission_id);
    setNotice("");
    try {
      const res = await fetch(`${API_ENDPOINTS.SUBMISSIONS}/grade/${cell.submission_id}`, {
        method: "PUT",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ grade: Number(raw) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Could not save the grade.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save the grade.");
      await load();
    } finally {
      setSaving(null);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.ASSIGNMENTS}/gradebook/${courseId}?export=csv`, { headers: auth() });
      if (!res.ok) throw new Error("Could not export the gradebook.");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `gradebook_${data?.course.code ?? courseId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not export the gradebook.");
    }
  };

  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>;
  if (!data) return <div className="flex justify-center py-16 text-slate-400"><Loader className="animate-spin" /></div>;
  if (data.students.length === 0) return <div className="rounded-2xl border border-slate-200 bg-white/60 py-16 text-center text-slate-500">No students are enrolled yet, so there are no marks to show.</div>;
  if (data.assignments.length === 0) return <div className="rounded-2xl border border-slate-200 bg-white/60 py-16 text-center text-slate-500">Create an assignment to start recording marks.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Type a mark and press Tab or Enter to save it. Percentages count graded work only.</p>
        <button onClick={() => void exportCsv()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download size={14} /> Export CSV</button>
      </div>
      {notice && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{notice}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 p-3">Student</th>
              {data.assignments.map((a) => <th key={a.id} className="p-3 text-center" title={a.title}><span className="block max-w-[9rem] truncate">{a.title}</span><span className="font-normal normal-case text-slate-400">/ {a.max_points}</span></th>)}
              <th className="p-3 text-center">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.students.map((row) => (
              <tr key={row.student_id}>
                <td className="sticky left-0 bg-white p-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-xs text-slate-400">{row.register_no || row.email}</p></td>
                {row.cells.map((cell, index) => (
                  <td key={cell.assignment_id} className="p-2 text-center">
                    {cell.submitted ? (
                      <input
                        type="number" min={0} max={data.assignments[index].max_points} step="any"
                        defaultValue={cell.grade ?? ""} key={`${cell.submission_id}-${cell.grade}`}
                        disabled={saving === cell.submission_id} placeholder="—"
                        onBlur={(event) => void saveGrade(cell, event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 focus:border-brand-blue focus:outline-none"
                        aria-label={`Mark for ${row.name}, ${data.assignments[index].title}`}
                      />
                    ) : <span className="text-xs text-slate-300">Not submitted</span>}
                  </td>
                ))}
                <td className="p-3 text-center font-bold text-slate-800">{row.percentage == null ? <span className="font-normal text-slate-300">—</span> : `${row.percentage}%`}<span className="block text-[11px] font-normal text-slate-400">{row.possible ? `${row.earned} / ${row.possible}` : "no graded work"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
