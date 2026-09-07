import React, { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2, RefreshCw, Users } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Course { id: number; name: string; code?: string; }
interface Analytics { overview?: { avg_score?: string; total_students?: number; at_risk_count?: number; attendance_rate?: string }; risk_students?: Array<{ id: string; name: string; risk: number; level: string; attendance: number; avgScore: number }>; performance_trend?: Array<{ month: string; score?: number; avg?: number }>; subject_breakdown?: Array<{ subject: string; avg: number }>; }

export const AnalyticsPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const summaryResponse = await fetch(`${API_ENDPOINTS.BASE}/dashboard/student-summary?student_name=${encodeURIComponent(user.name || "")}`);
      if (!summaryResponse.ok) throw new Error("Unable to load your courses");
      const summary = await summaryResponse.json();
      const availableCourses = Array.isArray(summary.courses) ? summary.courses : [];
      setCourses(availableCourses);
      const courseId = selectedCourse && availableCourses.some((course: Course) => course.id === selectedCourse) ? selectedCourse : availableCourses[0]?.id ?? null;
      setSelectedCourse(courseId);
      if (courseId) {
        const analyticsResponse = await fetch(`${API_ENDPOINTS.ANALYTICS}/course/${courseId}`);
        if (!analyticsResponse.ok) throw new Error("Unable to load course analytics");
        setAnalytics(await analyticsResponse.json());
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load analytics");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (error) return <div className="p-6 text-center"><AlertTriangle className="mx-auto mb-3 text-red-500" /><p>{error}</p><button className="btn btn-primary mt-4" onClick={() => void load()}><RefreshCw size={14} /> Retry</button></div>;

  const overview = analytics?.overview;
  return <div className="space-y-6 animate-fade-in">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Analytics</h1><p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Performance data from your enrolled courses.</p></div><button className="btn btn-outline" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>
    <select className="form-input max-w-md" value={selectedCourse ?? ""} onChange={async event => { const id = Number(event.target.value); setSelectedCourse(id); const response = await fetch(`${API_ENDPOINTS.ANALYTICS}/course/${id}`); if (response.ok) setAnalytics(await response.json()); }}>{courses.map(course => <option key={course.id} value={course.id}>{course.code ? `${course.code} — ` : ""}{course.name}</option>)}</select>
    {!selectedCourse || !analytics ? <GlassCard className="py-16 text-center"><BarChart3 className="mx-auto mb-3 text-slate-400" /><p style={{ color: "var(--color-text-muted)" }}>No analytics data is available yet.</p></GlassCard> : <><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[
      ["Average Score", overview?.avg_score || "0%"], ["Students", overview?.total_students ?? 0], ["At Risk", overview?.at_risk_count ?? 0], ["Attendance", overview?.attendance_rate || "0%"]
    ].map(([label, value]) => <GlassCard key={label} padding="sm"><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p><p className="text-2xl font-black mt-2" style={{ color: "var(--color-brand-blue)" }}>{value}</p></GlassCard>)}</div>
    <GlassCard><h2 className="font-bold mb-4 flex items-center gap-2"><Users size={16} /> Students needing support</h2>{analytics.risk_students?.length ? <div className="space-y-2">{analytics.risk_students.map(student => <div key={student.id} className="flex items-center justify-between border-b pb-2"><span>{student.name}</span><span className="text-sm text-red-600">{student.risk}% risk</span></div>)}</div> : <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No at-risk students found.</p>}</GlassCard>
    <GlassCard><h2 className="font-bold mb-4">Subject performance</h2>{analytics.subject_breakdown?.length ? <div className="space-y-3">{analytics.subject_breakdown.map(item => <div key={item.subject}><div className="flex justify-between text-sm mb-1"><span>{item.subject}</span><span>{item.avg.toFixed(1)}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.avg)}%` }} /></div></div>)}</div> : <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No subject data is available yet.</p>}</GlassCard></>}
  </div>;
};
