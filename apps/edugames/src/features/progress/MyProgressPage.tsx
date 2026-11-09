import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarPlus, FileText, Minus, RefreshCw } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { apiCall } from "../../shared/utils/apiCall";

type Status = "act_now" | "needs_attention" | "on_track" | "getting_started";
interface Point { date: string; percent: number; kind: string; title: string }
interface Progress {
  course_id?: number; code?: string; name?: string;
  status: Status; average: number | null; recent_average: number | null; trend_slope: number | null;
  results_count: number; past_due_count: number; late_count: number; exam_flags: number;
  missing: { assignment_id: number; title: string; due: string; course_id: number }[];
  tips: { signal: string; text: string }[];
  timeline: Point[];
}

const STATUS: Record<Status, { label: string; line: string; tone: string }> = {
  act_now: { label: "Act now", line: "A few things need your attention this week.", tone: "border-red-200 bg-red-50 text-red-800" },
  needs_attention: { label: "Needs attention", line: "You are close. Sort out the points below to stay on track.", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  on_track: { label: "On track", line: "Good work. Keep it up.", tone: "border-green-200 bg-green-50 text-green-800" },
  getting_started: { label: "Getting started", line: "Nothing has been marked yet.", tone: "border-slate-200 bg-slate-50 text-slate-700" },
};

const Trend: React.FC<{ slope: number | null }> = ({ slope }) => {
  if (slope == null) return <span className="text-xs text-slate-500">Needs 3 marked results</span>;
  if (slope <= -3) return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><ArrowDownRight size={14} />Dropping</span>;
  if (slope >= 3) return <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><ArrowUpRight size={14} />Improving</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Minus size={14} />Steady</span>;
};

/** A small line of marks over time, drawn without a chart library. */
const Sparkline: React.FC<{ points: Point[] }> = ({ points }) => {
  if (points.length < 2) return <p className="text-xs text-slate-500">{points.length ? "One marked result so far." : "No marked results yet."}</p>;
  const w = 240, h = 60, pad = 4;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (p: number) => h - pad - (p / 100) * (h - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label={`Marks over time: ${points.map((p) => `${p.percent}%`).join(", ")}`}>
      <line x1={pad} x2={w - pad} y1={y(70)} y2={y(70)} stroke="#cbd5e1" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="var(--color-brand-blue)" strokeWidth={2} />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.percent)} r={2.5} fill="var(--color-brand-blue)"><title>{`${p.title}: ${p.percent}%`}</title></circle>)}
    </svg>
  );
};

export const MyProgressPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ overall: Progress | null; courses: Progress[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError("");
    const r = await apiCall<{ overall: Progress | null; courses: Progress[] }>("GET", "/analytics/my-progress");
    if (r.ok) setData(r.data); else setError(r.error || "Could not load your progress.");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const overall = data?.overall;
  const s = overall ? STATUS[overall.status] : null;
  const openCourse = (courseId: number) => navigate("/classroom", { state: { courseId } });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>My progress</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>How you are doing in each class, from your marks and hand-ins, and what to do next. Your teachers see the same signals.</p>
        </div>
        <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      {loading && !data ? <p className="py-16 text-center text-sm text-slate-500">Loading your progress...</p> : !overall ? (
        <GlassCard className="p-8 text-center"><p className="font-semibold">You are not in any class yet.</p><p className="text-sm text-slate-500 mt-1">Join a class with the code your teacher gives you, under My Classrooms.</p></GlassCard>
      ) : (
        <>
          <div className={`rounded-2xl border p-5 ${s!.tone}`}>
            <p className="text-xs font-bold uppercase tracking-wide">Overall</p>
            <p className="text-2xl font-black">{s!.label}</p>
            <p className="text-sm">{s!.line}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Recent marks: <strong>{overall.recent_average == null ? "none yet" : `${overall.recent_average}%`}</strong></span>
              <span>All marks: <strong>{overall.average == null ? "none yet" : `${overall.average}%`}</strong> ({overall.results_count})</span>
              <span>Missing: <strong>{overall.missing.length}</strong>{overall.past_due_count ? ` of ${overall.past_due_count} due` : ""}</span>
              <span>Trend: <Trend slope={overall.trend_slope} /></span>
            </div>
          </div>

          <GlassCard className="p-5 space-y-3">
            <p className="font-bold" style={{ color: "var(--color-text-primary)" }}>What to do next</p>
            <ul className="space-y-2 text-sm">
              {overall.tips.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-700" />{t.text}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => navigate("/appointments")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><CalendarPlus size={14} />Book time with a teacher</button>
            </div>
          </GlassCard>

          {overall.missing.length > 0 && (
            <GlassCard className="p-5">
              <p className="font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>Not handed in yet</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {overall.missing.map((m) => (
                  <li key={m.assignment_id} className="flex flex-wrap items-center gap-3 py-2">
                    <FileText size={16} className="text-amber-700" />
                    <span className="flex-1 font-semibold">{m.title}</span>
                    <span className="text-xs text-red-700">Was due {new Date(m.due).toLocaleDateString()}</span>
                    <button onClick={() => openCourse(m.course_id)} className="rounded-md bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white">Hand in</button>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data!.courses.map((c) => {
              const cs = STATUS[c.status];
              return <GlassCard key={c.course_id} className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{c.code}</p><p className="font-bold" style={{ color: "var(--color-text-primary)" }}>{c.name}</p></div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${cs.tone}`}>{cs.label}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-slate-600">
                  <span>Recent {c.recent_average == null ? "none yet" : `${c.recent_average}%`}</span>
                  <span>Missing {c.missing.length}</span>
                  <Trend slope={c.trend_slope} />
                </div>
                <Sparkline points={c.timeline} />
                {c.tips[0] && c.tips[0].signal !== "ok" && <p className="text-xs text-slate-700">{c.tips[0].text}</p>}
                <button onClick={() => openCourse(c.course_id!)} className="text-xs font-bold text-blue-700 hover:underline">Open class</button>
              </GlassCard>;
            })}
          </div>
          <p className="text-xs text-slate-500">The dashed line on each chart is 70%. Live quiz scores are not included here. Attendance is not recorded.</p>
        </>
      )}
    </div>
  );
};
