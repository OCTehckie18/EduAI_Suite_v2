import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, ChevronRight, Circle, GraduationCap, Layers, School, UserCheck, Users } from "lucide-react";
import { API_BASE_URL, API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { Campus, Overview, TabKey } from "../types";
import { Badge, EmptyState, ErrorState, PanelCard, PanelHeader, SkeletonRows, timeAgo } from "../ui";

const ACTION_LABELS: Record<string, string> = {
  create_campus: "Created a campus",
  update_campus: "Updated a campus",
  deactivate_campus: "Deactivated a campus",
  create_user: "Created a user",
  update_user: "Updated a user",
  deactivate_user: "Deactivated a user",
  restore_user: "Restored a user",
  restore_record: "Restored a record from the recycle bin",
  approve_teacher: "Approved a teacher",
  reject_teacher: "Rejected a teacher application",
  import_student_roster: "Imported the student roster",
  remove_roster_entry: "Removed a roster entry",
  update_university: "Updated the university details",
  upload_university_logo: "Uploaded the university logo",
  remove_university_logo: "Removed the university logo",
};

const describeTarget = (target?: string) => {
  if (!target) return "";
  const [type, id] = target.split(":");
  const name = (type.split(".").pop() ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return id ? `${name} #${id}` : name;
};

export function OverviewPanel({ overview, loadFailed, onRetry, onNavigate, refreshKey }: { overview: Overview | null; loadFailed: boolean; onRetry: () => void; onNavigate: (tab: TabKey) => void; refreshKey: number }) {
  const [campuses, setCampuses] = useState<Campus[] | null>(null);
  const [universityName, setUniversityName] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    // Roster totals and the recent actions (with who did them) come with the overview itself.
    const [campusRes, universityRes] = await Promise.allSettled([
      requestJson<{ results: Campus[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/`),
      requestJson<{ configured: boolean; name: string }>(`${API_BASE_URL}/institution/university/`),
    ]);
    if (campusRes.status === "fulfilled") setCampuses(campusRes.value.results);
    else setError("Some overview details could not be loaded.");
    setUniversityName(universityRes.status === "fulfilled" && universityRes.value.configured ? universityRes.value.name : "");
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // A failed load must say so, with a way to try again; a skeleton that never ends looks like a slow server.
  if (!overview && loadFailed) return <ErrorState message="The overview could not be loaded. Check that the server is running, then try again." onRetry={onRetry} />;
  if (!overview) return <PanelCard><SkeletonRows rows={6} cols={5} /></PanelCard>;

  const pending = overview.users.pending_teacher_approvals ?? 0;
  const kpis: { label: string; value: number; hint: string; Icon: typeof Users; tab?: TabKey; tone?: string }[] = [
    { label: "Campuses", value: overview.institution.campuses, hint: "Manage campuses", Icon: Building2, tab: "campuses" },
    { label: "Student accounts", value: overview.users.students, hint: "Signed up so far; see the roster", Icon: GraduationCap, tab: "roster" },
    { label: "Teachers", value: overview.users.teachers, hint: "View users", Icon: Users, tab: "users" },
    { label: "Awaiting approval", value: pending, hint: pending ? "Review applications" : "Nothing waiting", Icon: UserCheck, tab: "approvals", tone: pending ? "border-violet-200 bg-violet-50" : "" },
    { label: "Classrooms", value: overview.classrooms, hint: "Created by teachers", Icon: School },
  ];

  const steps: { done: boolean; title: string; hint: string; tab: TabKey; Icon: typeof Users }[] = [
    { done: Boolean(universityName), title: "Add your university", hint: "Name, logo and contact details shown to everyone.", tab: "university", Icon: Building2 },
    { done: overview.institution.campuses > 0, title: "Add campuses", hint: "Each campus of the university.", tab: "campuses", Icon: Building2 },
    { done: overview.institution.programs > 0 && overview.institution.batches > 0, title: "Build the structure", hint: "Schools, departments, programs, classes and sections.", tab: "structure", Icon: Layers },
    { done: overview.roster.total > 0, title: "Upload the student roster", hint: overview.roster.total > 0 ? `${overview.roster.signed_up} of ${overview.roster.total} admitted students have signed up.` : "Only admitted students can sign up.", tab: "roster", Icon: GraduationCap },
    { done: overview.users.teachers > 0, title: "Approve your first teacher", hint: "Teachers apply on TeacherBuddy and wait for you.", tab: "approvals", Icon: UserCheck },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {kpis.map(({ label, value, hint, Icon, tab, tone }) => {
          const body = (
            <>
              <div className="mb-3 flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wide">{label}</span><Icon className="h-4 w-4 text-brand-blue" /></div>
              <div className="text-3xl font-bold text-slate-900">{value}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-700">{hint}{tab && <ChevronRight className="h-3 w-3" />}</div>
            </>
          );
          // A card only becomes a button when it leads somewhere; there is no classroom screen in this portal.
          return tab
            ? <button key={label} onClick={() => onNavigate(tab)} className={`group rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 sm:p-5 ${tone ?? ""}`}>{body}</button>
            : <div key={label} className={`group rounded-2xl border border-slate-200 bg-white p-4 text-left sm:p-5 ${tone ?? ""}`}>{body}</div>;
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCard>
          <PanelHeader title="Getting started" subtitle={`${doneCount} of ${steps.length} steps done${universityName ? ` for ${universityName}` : ""}.`} />
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.title}>
                <button onClick={() => onNavigate(step.tab)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-400 hover:bg-slate-50">
                  {step.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-400" />}
                  <div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${step.done ? "text-slate-500 line-through" : "text-slate-900"}`}>{step.title}</p><p className="truncate text-xs text-slate-500">{step.hint}</p></div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ol>
        </PanelCard>

        <PanelCard>
          <PanelHeader title="Recent activity" subtitle="The latest changes made by master admins." />
          {overview.recent_actions.length === 0 ? (
            <EmptyState title="No activity yet" hint="Changes you make in this portal will be listed here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.recent_actions.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0"><p className="font-medium text-slate-800">{ACTION_LABELS[entry.action ?? ""] ?? (entry.action ?? "Action").replace(/_/g, " ")}</p>
                    <p className="truncate text-xs text-slate-500">{entry.actor}{entry.target ? ` · ${describeTarget(entry.target)}` : ""}</p></div>
                  <span className="shrink-0 text-xs text-slate-500">{timeAgo(entry.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <PanelCard>
        <PanelHeader title="Campuses at a glance" actions={<button onClick={() => onNavigate("structure")} className="text-sm text-brand-blue hover:text-brand-blue-dark">Open institution structure →</button>} />
        {campuses === null ? <SkeletonRows rows={3} cols={4} /> : campuses.length === 0 ? (
          <EmptyState icon={<Building2 className="h-5 w-5" />} title="No campuses yet" hint="Add your first campus to start building the structure." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campuses.map((campus) => (
              <div key={campus.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{campus.name}</p><p className="text-xs text-slate-500">{campus.code} · {campus.city}</p></div><Badge tone={campus.is_active ? "green" : "stone"}>{campus.is_active ? "Active" : "Inactive"}</Badge></div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {[["Schools", campus.schools], ["Depts", campus.departments], ["Students", campus.students]].map(([label, value]) => (
                    <div key={label as string} className="rounded-lg bg-slate-100 py-2"><dt className="text-slate-500">{label}</dt><dd className="text-base font-bold text-slate-900">{value}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
