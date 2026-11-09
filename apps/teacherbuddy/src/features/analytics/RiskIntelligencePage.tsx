import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarPlus, ChevronDown, ChevronRight, Download, Eye,
  Info, Mail, Minus, RefreshCw, Search, ShieldAlert,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { apiCall } from "../../shared/utils/apiCall";
import { API_BASE_URL } from "../../shared/utils/apiConfig";
import { AnalyticsPage } from "./AnalyticsPage";

type Level = "high" | "moderate" | "low" | "no_data";
type Signal = "marks" | "missing" | "late" | "trend" | "integrity";

interface Reason { signal: Signal; points: number; text: string }
interface StudentRow {
  student_id: number; name: string; email: string; register_no: string | null; course_ids: number[];
  score: number | null; level: Level; parts: Record<"marks" | "missing" | "trend" | "integrity", number> | null;
  average: number | null; recent_average: number | null; results_count: number; missing_count: number; past_due_count: number; late_count: number;
  trend_slope: number | null; integrity_flags: number; z_score: number | null; reasons: Reason[]; next_step: string;
  timeline: { date: string; percent: number; kind: string; title: string }[];
  watch: { id: number; note: string; score_at_start: number | null; since: string } | null;
}
interface Dashboard {
  generated_at: string;
  scope: { course_id: number | null; classrooms: { id: number; name: string; code: string }[] };
  summary: {
    students: number; levels: Record<Level, number>; class_average: number | null; class_sd: number | null;
    drivers: Record<Signal, number>; distribution: { range: string; students: number }[];
    weekly_average: { week: string; average: number; results: number }[]; graded_results: number;
  };
  courses: { id: number; name: string; code: string; students: number; high: number; moderate: number; average: number | null }[];
  students: StudentRow[];
  method: { max_points: Record<string, number>; levels: { high: number; moderate: number }; marks_safe_from: number; marks_full_at: number; not_counted: string[] };
}
interface Watch { id: number; student_id: number; student_name: string; note: string; status: "open" | "resolved"; score_at_start: number | null; score_now: number | null; created_at: string; resolved_at: string | null }

const LEVEL_STYLE: Record<Level, { label: string; badge: string; bar: string }> = {
  high: { label: "High", badge: "bg-red-100 text-red-800", bar: "#dc2626" },
  moderate: { label: "Moderate", badge: "bg-amber-100 text-amber-800", bar: "#d97706" },
  low: { label: "Low", badge: "bg-green-100 text-green-800", bar: "#16a34a" },
  no_data: { label: "Not enough data", badge: "bg-slate-100 text-slate-700", bar: "#94a3b8" },
};
const PART_STYLE: { key: "marks" | "missing" | "trend" | "integrity"; label: string; color: string }[] = [
  { key: "marks", label: "Low marks", color: "var(--color-brand-blue)" },
  { key: "missing", label: "Missing or late work", color: "#d97706" },
  { key: "trend", label: "Falling marks", color: "#0284c7" },
  { key: "integrity", label: "Exam flags", color: "#dc2626" },
];
const SIGNAL_LABEL: Record<Signal, string> = {
  marks: "Low marks", missing: "Missing work", late: "Late work", trend: "Falling marks", integrity: "Exam flags",
};
const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200";

const bucketColor = (range: string) => {
  const start = Number(range.split("-")[0]);
  return start >= 50 ? LEVEL_STYLE.high.bar : start >= 25 ? LEVEL_STYLE.moderate.bar : LEVEL_STYLE.low.bar;
};

const Trend: React.FC<{ slope: number | null }> = ({ slope }) => {
  if (slope == null) return <span className="text-xs text-slate-400">Too few results</span>;
  if (slope <= -3) return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><ArrowDownRight size={14} />{slope} per result</span>;
  if (slope >= 3) return <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><ArrowUpRight size={14} />+{slope} per result</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Minus size={14} />Steady</span>;
};

/** One bar per student showing which signals make up the score. */
const PartsBar: React.FC<{ parts: StudentRow["parts"] }> = ({ parts }) => {
  if (!parts) return <div className="h-2 w-full rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {PART_STYLE.map((p) => parts[p.key] > 0 && <div key={p.key} style={{ width: `${parts[p.key]}%`, background: p.color }} title={`${p.label}: ${parts[p.key]}`} />)}
    </div>
  );
};

export const RiskIntelligencePage: React.FC = () => {
  const [view, setView] = useState<"risk" | "upload">("risk");
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2">
      <div className="flex gap-1 bg-slate-100/60 p-1 rounded-2xl w-fit">
        <button onClick={() => setView("risk")} className={`px-5 py-2 rounded-xl text-xs font-bold ${view === "risk" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}>Risk intelligence</button>
        <button onClick={() => setView("upload")} className={`px-5 py-2 rounded-xl text-xs font-bold ${view === "upload" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}>Spreadsheet analysis</button>
      </div>
      {view === "risk" ? <RiskBoard /> : <AnalyticsPage />}
    </div>
  );
};

const RiskBoard: React.FC = () => {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState<string>("all");
  const [data, setData] = useState<Dashboard | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [levelFilter, setLevelFilter] = useState<Level | "all" | "watch">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"score" | "average" | "missing" | "trend">("score");
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [showMethod, setShowMethod] = useState(false);
  const [watchFor, setWatchFor] = useState<StudentRow | null>(null);
  const [meetFor, setMeetFor] = useState<StudentRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [board, list] = await Promise.all([
      apiCall<Dashboard>("GET", `/analytics/risk${courseId === "all" ? "" : `?course_id=${courseId}`}`),
      apiCall<Watch[]>("GET", "/analytics/watchlist"),
    ]);
    if (board.ok) setData(board.data); else setError(board.error || "Could not load the risk dashboard.");
    if (list.ok) setWatches(list.data);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let list = data.students.filter((s) =>
      (levelFilter === "all" || (levelFilter === "watch" ? !!s.watch : s.level === levelFilter)) &&
      (!q || `${s.name} ${s.register_no ?? ""} ${s.email}`.toLowerCase().includes(q)));
    const by = {
      score: (s: StudentRow) => -(s.score ?? -1),
      average: (s: StudentRow) => s.average ?? 999,
      missing: (s: StudentRow) => -s.missing_count,
      trend: (s: StudentRow) => s.trend_slope ?? 999,
    }[sort];
    list = [...list].sort((a, b) => by(a) - by(b));
    return list;
  }, [data, levelFilter, query, sort]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/analytics/risk?export=csv${courseId === "all" ? "" : `&course_id=${courseId}`}`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = "risk_report.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export failed. Try again.");
    }
  };

  const message = (ids: number[]) => navigate("/mail", { state: { studentIds: ids } });

  const resolve = async (w: Watch) => {
    const r = await apiCall("PATCH", `/analytics/watchlist/${w.id}`, { status: "resolved" });
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice(`${w.student_name} marked as resolved.`);
    void load();
  };

  const s = data?.summary;
  const openWatches = watches.filter((w) => w.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-blue-900" style={{ fontFamily: "var(--font-display)" }}>Risk intelligence</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">Which students need help, why, and what to do next. Every score is built from recorded marks, hand-ins and exam conduct, and says exactly where it comes from.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Classroom" className={field} value={courseId} onChange={(e) => { setCourseId(e.target.value); setOpen(null); setSelected([]); }}>
            <option value="all">All my classrooms</option>
            {data?.scope.classrooms.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.name}</option>)}
          </select>
          <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={() => void exportCsv()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={14} />Export CSV</button>
          <button onClick={() => setShowMethod((v) => !v)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Info size={14} />How the score works</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{notice}</p>}

      {showMethod && data && (
        <GlassCard className="p-5 text-sm text-slate-700 space-y-2">
          <p className="font-bold text-slate-900">How the risk score is worked out</p>
          <p>Each student gets a score from 0 to 100. It is the sum of four parts, and each part comes from something the platform recorded:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Low marks</strong> (up to {data.method.max_points.marks}): based on the average of the last three results, so a recent drop is not hidden by good early marks. Nothing at {data.method.marks_safe_from}% or above, the full amount at {data.method.marks_full_at}% or below. Counts graded assignments, exams and verified OMR sheets.</li>
            <li><strong>Missing or late work</strong> (up to {data.method.max_points.missing_and_late}): the share of past-due assignments not handed in, plus a little for each late hand-in.</li>
            <li><strong>Falling marks</strong> (up to {data.method.max_points.trend}): how fast marks are dropping over the last six results. Needs at least three results.</li>
            <li><strong>Exam flags</strong> (up to {data.method.max_points.integrity}): exam attempts ended for leaving the exam window.</li>
          </ul>
          <p><strong>High</strong> is {data.method.levels.high} or more, <strong>Moderate</strong> is {data.method.levels.moderate} to {data.method.levels.high - 1}. A student with no graded work and nothing overdue is shown as <strong>Not enough data</strong>, never as low risk.</p>
          <p className="text-slate-500">Not counted: {data.method.not_counted.join("; ")}.</p>
        </GlassCard>
      )}

      {loading && !data ? (
        <div className="py-24 text-center text-sm font-semibold text-slate-500">Working out risk for your students...</div>
      ) : data && s ? (
        <>
          {/* Headline numbers */}
          <GlassCard className="p-5">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Students</p><p className="text-2xl font-black text-slate-900">{s.students}</p></div>
              <button className="text-left" onClick={() => setLevelFilter("high")}><p className="text-xs font-bold uppercase tracking-wide text-red-700">High risk</p><p className="text-2xl font-black text-red-700">{s.levels.high}</p></button>
              <button className="text-left" onClick={() => setLevelFilter("moderate")}><p className="text-xs font-bold uppercase tracking-wide text-amber-700">Moderate</p><p className="text-2xl font-black text-amber-700">{s.levels.moderate}</p></button>
              <button className="text-left" onClick={() => setLevelFilter("no_data")}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Not enough data</p><p className="text-2xl font-black text-slate-700">{s.levels.no_data}</p></button>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Class average</p><p className="text-2xl font-black text-slate-900">{s.class_average == null ? "Not recorded" : `${s.class_average}%`}</p>{s.class_sd != null && <p className="text-xs text-slate-500">spread ±{s.class_sd} points</p>}</div>
              <button className="text-left" onClick={() => setLevelFilter("watch")}><p className="text-xs font-bold uppercase tracking-wide text-blue-800">On your watchlist</p><p className="text-2xl font-black text-blue-800">{openWatches.length}</p></button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Based on {s.graded_results} graded results. Updated {new Date(data.generated_at).toLocaleTimeString()}.</p>
          </GlassCard>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <p className="text-sm font-bold text-slate-900">Class average over time</p>
              <p className="text-xs text-slate-500 mb-3">Average of all results marked each week.</p>
              {s.weekly_average.length < 2 ? <p className="py-12 text-center text-sm text-slate-500">Needs results from at least two weeks.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={s.weekly_average}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
                    <Line type="monotone" dataKey="average" stroke="var(--color-brand-blue)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm font-bold text-slate-900">What is driving risk</p>
              <p className="text-xs text-slate-500 mb-3">How many students each signal affects. Fix the biggest one first.</p>
              <div className="space-y-2">
                {(Object.keys(SIGNAL_LABEL) as Signal[]).map((k) => {
                  const n = s.drivers[k];
                  const pct = s.students ? (100 * n) / s.students : 0;
                  return <div key={k}>
                    <div className="flex justify-between text-xs"><span className="font-semibold text-slate-700">{SIGNAL_LABEL[k]}</span><span className="font-bold">{n}</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-800" style={{ width: `${pct}%` }} /></div>
                  </div>;
                })}
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GlassCard className="p-5">
              <p className="text-sm font-bold text-slate-900">Risk score spread</p>
              <p className="text-xs text-slate-500 mb-3">Students in each score band: green is low, amber moderate, red high.</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={s.distribution}>
                  <XAxis dataKey="range" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [String(v), "Students"]} />
                  <Bar dataKey="students">{s.distribution.map((d) => <Cell key={d.range} fill={bucketColor(d.range)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
            <GlassCard className="p-5 overflow-x-auto">
              <p className="text-sm font-bold text-slate-900">{data.courses.length ? "Classroom comparison" : "Your watchlist"}</p>
              {data.courses.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2">Classroom</th><th>Students</th><th>High</th><th>Moderate</th><th>Average</th><th></th></tr></thead>
                  <tbody>
                    {data.courses.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="py-2 font-semibold">{c.code}: {c.name}</td>
                        <td>{c.students}</td>
                        <td className={c.high ? "font-bold text-red-700" : ""}>{c.high}</td>
                        <td className={c.moderate ? "font-bold text-amber-700" : ""}>{c.moderate}</td>
                        <td>{c.average == null ? "Not recorded" : `${c.average}%`}</td>
                        <td className="text-right"><button className="text-xs font-bold text-blue-700 hover:underline" onClick={() => setCourseId(String(c.id))}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <WatchList watches={watches} onResolve={resolve} />}
            </GlassCard>
          </div>

          {data.courses.length > 0 && (
            <GlassCard className="p-5"><p className="text-sm font-bold text-slate-900 mb-2">Your watchlist</p><WatchList watches={watches} onResolve={resolve} /></GlassCard>
          )}

          {/* Students */}
          <GlassCard className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm font-bold text-slate-900">Students ({rows.length})</p>
              <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input aria-label="Search students" className={`${field} pl-8`} placeholder="Name or register no." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
              <select aria-label="Show" className={field} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}>
                <option value="all">Everyone</option><option value="high">High risk</option><option value="moderate">Moderate</option><option value="low">Low</option><option value="no_data">Not enough data</option><option value="watch">On watchlist</option>
              </select>
              <select aria-label="Sort by" className={field} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="score">Highest risk first</option><option value="average">Lowest average first</option><option value="missing">Most missing work</option><option value="trend">Fastest falling</option>
              </select>
              <button disabled={!selected.length} onClick={() => message(selected)} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Mail size={14} />Message {selected.length || ""}</button>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {PART_STYLE.map((p) => <span key={p.key} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}
            </div>

            {rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{data.students.length ? "No students match." : "No students are enrolled in these classrooms yet."}</p> : (
              <ul className="divide-y divide-slate-100">
                {rows.map((st) => {
                  const isOpen = open === st.student_id;
                  const style = LEVEL_STYLE[st.level];
                  return <li key={st.student_id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input type="checkbox" aria-label={`Select ${st.name}`} checked={selected.includes(st.student_id)} onChange={() => setSelected((x) => x.includes(st.student_id) ? x.filter((i) => i !== st.student_id) : [...x, st.student_id])} />
                      <button onClick={() => setOpen(isOpen ? null : st.student_id)} className="flex min-w-[12rem] flex-1 items-center gap-2 text-left" aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        <span>
                          <span className="block font-semibold text-slate-900">{st.name} {st.watch && <Eye size={13} className="inline text-blue-700" aria-label="On watchlist" />}</span>
                          <span className="block text-xs text-slate-500">{st.register_no || st.email}</span>
                        </span>
                      </button>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}>{st.score == null ? style.label : `${style.label} · ${st.score}`}</span>
                      <div className="w-28"><PartsBar parts={st.parts} /></div>
                      <span className="w-28 text-xs text-slate-700">{st.average == null ? "No marks yet" : st.recent_average != null && st.recent_average !== st.average ? <>Recent {st.recent_average}%<span className="block text-slate-500">overall {st.average}%</span></> : `Avg ${st.average}%`}</span>
                      <span className="w-24 text-xs text-slate-700">{st.past_due_count ? `${st.missing_count}/${st.past_due_count} missing` : "Nothing due"}</span>
                      <span className="w-28"><Trend slope={st.trend_slope} /></span>
                      {st.integrity_flags > 0 && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><ShieldAlert size={13} />{st.integrity_flags}</span>}
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => setWatchFor(st)} className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">{st.watch ? "Note" : "Watch"}</button>
                        <button onClick={() => message([st.student_id])} className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Message</button>
                        <button onClick={() => setMeetFor(st)} className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Meet</button>
                      </span>
                    </div>

                    {isOpen && <div className="mt-3 grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="rounded-lg border border-blue-100 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Suggested next step</p>
                          <p className="text-sm text-slate-800">{st.next_step}</p>
                        </div>
                        {st.reasons.length > 0 ? <ul className="space-y-1.5 text-sm">
                          {st.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="w-12 shrink-0 text-right text-xs font-bold text-slate-500">+{r.points}</span><span className="text-slate-700">{r.text}</span></li>)}
                        </ul> : <p className="text-sm text-slate-600">{st.level === "no_data" ? "No graded work and nothing overdue yet." : "Nothing is raising this student's risk."}</p>}
                        {st.z_score != null && <p className="text-xs text-slate-500">{Math.abs(st.z_score) < 0.5 ? "About the class average." : `${Math.abs(st.z_score)} standard deviations ${st.z_score < 0 ? "below" : "above"} the class average.`}</p>}
                        {st.watch && <p className="text-xs text-slate-600">On your watchlist since {new Date(st.watch.since).toLocaleDateString()}{st.watch.score_at_start != null ? `, when the score was ${st.watch.score_at_start}` : ""}.{st.watch.note ? ` Note: ${st.watch.note}` : ""}</p>}
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Results over time</p>
                        {st.timeline.length < 2 ? <p className="py-8 text-center text-xs text-slate-500">{st.timeline.length ? "Only one result so far." : "No graded results yet."}</p> : (
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={st.timeline}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                              <Tooltip formatter={(v) => [`${v}%`, "Mark"]} labelFormatter={(_l, p) => (p && p[0] ? `${p[0].payload.title} (${p[0].payload.kind})` : "")} />
                              {s.class_average != null && <Line type="monotone" dataKey={() => s.class_average} stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Class average" />}
                              <Line type="monotone" dataKey="percent" stroke={style.bar} strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>}
                  </li>;
                })}
              </ul>
            )}
          </GlassCard>
        </>
      ) : null}

      {watchFor && <WatchDialog student={watchFor} onClose={() => setWatchFor(null)} onSaved={(msg) => { setWatchFor(null); setNotice(msg); void load(); }} />}
      {meetFor && <MeetDialog student={meetFor} onClose={() => setMeetFor(null)} onSaved={(msg) => { setMeetFor(null); setNotice(msg); }} />}
    </div>
  );
};

const WatchList: React.FC<{ watches: Watch[]; onResolve: (w: Watch) => void }> = ({ watches, onResolve }) => {
  if (!watches.length) return <p className="py-6 text-sm text-slate-500">Nobody yet. Use Watch on a student to follow them up with private notes.</p>;
  return (
    <ul className="mt-2 divide-y divide-slate-100 text-sm">
      {watches.map((w) => {
        const change = w.score_at_start != null && w.score_now != null ? Math.round((w.score_now - w.score_at_start) * 10) / 10 : null;
        return <li key={w.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="min-w-[10rem] flex-1"><span className="font-semibold">{w.student_name}</span>{w.note && <span className="block text-xs text-slate-500">{w.note}</span>}</span>
          <span className="text-xs text-slate-600">Since {new Date(w.created_at).toLocaleDateString()}</span>
          <span className="text-xs">{change == null ? <span className="text-slate-400">No score to compare</span> : change < 0 ? <span className="font-bold text-green-700">Risk down {Math.abs(change)}</span> : change > 0 ? <span className="font-bold text-red-700">Risk up {change}</span> : <span className="text-slate-600">No change</span>}</span>
          {w.status === "open"
            ? <button onClick={() => onResolve(w)} className="rounded-md px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50">Mark resolved</button>
            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Resolved</span>}
        </li>;
      })}
    </ul>
  );
};

const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
    <div role="dialog" aria-label={title} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
      <p className="text-lg font-bold text-slate-900">{title}</p>
      {children}
    </div>
  </div>
);

const WatchDialog: React.FC<{ student: StudentRow; onClose: () => void; onSaved: (msg: string) => void }> = ({ student, onClose, onSaved }) => {
  const [note, setNote] = useState(student.watch?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError("");
    const r = student.watch
      ? await apiCall("PATCH", `/analytics/watchlist/${student.watch.id}`, { note })
      : await apiCall("POST", "/analytics/watchlist", { student_id: student.student_id, note });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    onSaved(student.watch ? "Note saved." : `${student.name} added to your watchlist.`);
  };
  return <Dialog title={student.watch ? `Note on ${student.name}` : `Watch ${student.name}`} onClose={onClose}>
    <p className="text-sm text-slate-600">Only you can see this note. Mark the student resolved when they are back on track; the watchlist shows whether their risk went down.</p>
    <textarea aria-label="Note" rows={4} maxLength={2000} className={`${field} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={student.next_step} />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save"}</button></div>
  </Dialog>;
};

const MeetDialog: React.FC<{ student: StudentRow; onClose: () => void; onSaved: (msg: string) => void }> = ({ student, onClose, onSaved }) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [mode, setMode] = useState("In-person");
  const [agenda, setAgenda] = useState("Progress check");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const book = async () => {
    if (!date) { setError("Choose a date."); return; }
    setBusy(true); setError("");
    const r = await apiCall("POST", "/appointments/invite", { student_id: student.student_id, time_slot: `${date} ${time}`, meeting_mode: mode, agenda, details: student.next_step });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    onSaved(`Meeting booked with ${student.name}. They have been notified.`);
  };
  return <Dialog title={`Meet ${student.name}`} onClose={onClose}>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm font-semibold">Date<input type="date" className={`${field} mt-1 w-full`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="text-sm font-semibold">Time<input type="time" className={`${field} mt-1 w-full`} value={time} onChange={(e) => setTime(e.target.value)} /></label>
    </div>
    <label className="block text-sm font-semibold">Where<select className={`${field} mt-1 w-full`} value={mode} onChange={(e) => setMode(e.target.value)}><option>In-person</option><option>Online</option></select></label>
    <label className="block text-sm font-semibold">Agenda<input className={`${field} mt-1 w-full`} maxLength={500} value={agenda} onChange={(e) => setAgenda(e.target.value)} /></label>
    <p className="text-xs text-slate-500 flex gap-1"><AlertTriangle size={13} className="shrink-0" />The meeting is confirmed straight away and appears in the student's appointments.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={() => void book()} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><CalendarPlus size={14} />{busy ? "Booking..." : "Book meeting"}</button></div>
  </Dialog>;
};
