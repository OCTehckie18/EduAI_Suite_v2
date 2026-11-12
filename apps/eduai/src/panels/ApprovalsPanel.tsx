import { useCallback, useEffect, useState } from "react";
import { useTerms } from "../shared/university";
import { Check, UserCheck, X } from "lucide-react";
import { API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { TeacherApplication } from "../types";
import { Avatar, Badge, Chips, EmptyState, ErrorState, PanelCard, PanelHeader, SkeletonRows, TableShell, Th, timeAgo, useConfirm, useToast } from "../ui";

const FILTERS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]] as const;

export function ApprovalsPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const t = useTerms();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>("pending");
  const [rows, setRows] = useState<TeacherApplication[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await requestJson<{ results: TeacherApplication[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/teacher-approvals/?status=${status}&search=${encodeURIComponent(search)}`);
      setRows(data.results);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load teacher applications.");
    }
  }, [status, search]);

  useEffect(() => {
    setRows(null);
    const handle = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(handle);
  }, [load]);

  const decide = async (row: TeacherApplication, decision: "approve" | "reject") => {
    let body: string | undefined;
    let addToRoster = false;
    if (decision === "approve") {
      const ok = await confirm({ title: `Approve ${row.name}?`, message: `${row.email} will be able to use TeacherBuddy as a teacher${row.department ? ` for ${row.department}` : ""}.`, confirmLabel: "Approve" });
      if (!ok) return;
      addToRoster = row.profile_complete && Boolean(row.emp_no) && await confirm({ title: `Also add ${row.name} to the teacher roster?`, message: "Listed teachers are approved automatically whenever they sign in. Choose Cancel to approve without listing them.", confirmLabel: "Add to roster" }) === true;
      body = JSON.stringify({ add_to_roster: addToRoster });
    } else {
      const reason = await confirm({ title: `Reject ${row.name}?`, message: "They will see your reason on their waiting screen.", confirmLabel: "Reject", tone: "danger", input: { label: "Reason (optional)", placeholder: "For example: not on the staff list", multiline: true } });
      if (reason === false) return;
      body = JSON.stringify({ reason: typeof reason === "string" ? reason : "" });
    }
    setBusyId(row.id);
    try {
      const saved = await requestJson<{ added_to_roster?: boolean }>(`${API_ENDPOINTS.MASTER_ADMIN}/teacher-approvals/${row.id}/${decision}/`, { method: "POST", body });
      toast.success(decision === "approve" ? `${row.name} approved${addToRoster ? (saved.added_to_roster ? " and added to the roster" : ", but not added to the roster: that email or employee number is already listed") : ""}.` : `${row.name} rejected.`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the decision.");
    } finally {
      setBusyId(null);
    }
  };

  const where = (row: TeacherApplication) => [row.campus, row.school, row.department].filter(Boolean).join(" › ");

  return (
    <PanelCard>
      <PanelHeader title="Teacher applications" subtitle="Teachers who are on the roster below are approved automatically. Anyone else signs in on TeacherBuddy, fills in their profile and waits here until you approve them." actions={<Chips value={status} options={FILTERS} onChange={setStatus} />} />
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      {rows === null ? <SkeletonRows rows={4} cols={4} /> : rows.length === 0 ? (
        <EmptyState icon={<UserCheck className="h-5 w-5" />} title={status === "pending" ? "No applications are waiting" : `No ${status} teachers`} hint={status === "pending" ? "New teacher sign-ups on TeacherBuddy will appear here." : undefined} />
      ) : (
        <TableShell>
          <thead><tr><Th>Applicant</Th><Th>{t('employee_no')}</Th><Th>Placement</Th><Th>{status === "pending" ? "Applied" : "Reviewed"}</Th><Th right>{status === "pending" ? "Decision" : "Outcome"}</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/40">
                <td className="p-3 sm:p-4"><div className="flex items-center gap-3"><Avatar name={row.name} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{row.name}</p><p className="truncate text-xs text-slate-500">{row.email}</p></div></div></td>
                <td className="p-3 text-slate-700 sm:p-4">{row.emp_no || "—"}</td>
                <td className="p-3 text-xs text-slate-700 sm:p-4">{where(row) || <Badge tone="amber">Profile not completed</Badge>}</td>
                <td className="p-3 text-xs text-slate-500 sm:p-4">{timeAgo(status === "pending" ? row.applied_at : row.reviewed_at)}{status !== "pending" && row.reviewed_by ? ` · ${row.reviewed_by}` : ""}</td>
                <td className="p-3 text-right sm:p-4">
                  {status === "pending" ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button disabled={busyId === row.id || !row.profile_complete} title={row.profile_complete ? "" : "The applicant has not finished their profile"} onClick={() => void decide(row, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"><Check className="h-3.5 w-3.5" />Approve</button>
                      <button disabled={busyId === row.id} onClick={() => void decide(row, "reject")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"><X className="h-3.5 w-3.5" />Reject</button>
                    </div>
                  ) : <div className="text-xs"><Badge tone={status === "approved" ? "green" : "red"}>{status === "approved" ? "Approved" : "Rejected"}</Badge>{row.rejection_reason && <p className="mt-1 text-slate-500">“{row.rejection_reason}”</p>}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </PanelCard>
  );
}
