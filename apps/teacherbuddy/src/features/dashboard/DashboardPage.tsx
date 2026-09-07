import React, { useEffect, useState } from "react";
import {
  Users, BrainCircuit, AlertTriangle, TrendingUp, BookOpen,
  Clock, ArrowRight, Activity, Calendar, CheckCircle2,
  Zap, BarChart2, User, Loader2, Mail, FileText, ClipboardList,
  Plus, XCircle
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { useAuthStore } from "../../store/useAuthStore";
import { getGreeting, getFormattedDate } from "../../shared/utils/dateUtils";

const iconMap: Record<string, any> = {
  Users,
  BrainCircuit,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  Clock,
  Activity,
  CheckCircle2,
  Calendar,
  Zap,
  BarChart2,
  User
};

export const DashboardPage: React.FC = () => {
  const { user: authUser } = useAuthStore();
  const [data, setData] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateAppointment = async (appointmentId: number, status: "approved" | "rejected") => {
    try {
      const response = await fetch(`${API_ENDPOINTS.APPOINTMENTS}/${appointmentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {}),
        },
        body: JSON.stringify({
          status,
          notes: status === "approved" ? "Approved from dashboard." : "Rejected from dashboard.",
        }),
      });
      if (!response.ok) throw new Error("Could not update appointment");
      setData((previous: any) => ({
        ...previous,
        pendingAppointments: (previous.pendingAppointments || []).filter(
          (appointment: any) => appointment.id !== appointmentId,
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update appointment");
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const query = authUser?.name ? `?teacher_name=${encodeURIComponent(authUser.name)}` : '';
        const response = await fetch(`${API_ENDPOINTS.DASHBOARD}/summary${query}`);
        if (!response.ok) throw new Error("Failed to fetch dashboard data");
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading academic overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-muted-foreground">{error || "Failed to load dashboard data"}</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary mt-2">
          Try Again
        </button>
      </div>
    );
  }

  const {
    stats = [],
    classrooms = [],
    riskAlerts = [],
    recentActivity = [],
    schedule = [],
    pendingAppointments = [],
    recentReports = [],
    mailStats = { sentThisWeek: 0, lastSentAt: null },
    upcomingExams = [],
    engagementSnapshot = { avgAttendance: 0, avgScore: 0, atRiskCount: 0, studentCount: 0 },
    calendarEventsThisWeek = 0,
  } = data;

  return (
    <div className="space-y-7 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
            {getGreeting()}, {authUser?.name || "Professor"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {getFormattedDate()} — Here's your academic overview for today.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/exams" className="btn btn-outline text-xs"><Plus size={13} /> Create Exam</Link>
          <Link to="/mail" className="btn btn-outline text-xs"><Mail size={13} /> Send Mail</Link>
          <Link to="/reports" className="btn btn-outline text-xs"><FileText size={13} /> Generate Report</Link>
          <Link to="/appointments" className="btn btn-primary text-xs"><Calendar size={13} /> Schedule Appointment</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/exams" className="glass-card flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
          <Plus size={16} className="text-blue-600" /><span className="text-xs font-bold">Create Exam</span>
        </Link>
        <Link to="/mail" className="glass-card flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
          <Mail size={16} className="text-indigo-600" /><span className="text-xs font-bold">Send Mail</span>
        </Link>
        <Link to="/reports" className="glass-card flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
          <FileText size={16} className="text-amber-600" /><span className="text-xs font-bold">Generate Report</span>
        </Link>
        <Link to="/appointments" className="glass-card flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
          <Calendar size={16} className="text-emerald-600" /><span className="text-xs font-bold">Appointments</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((stat: any, i: number) => {
          const Icon = iconMap[stat.icon] || Activity;
          return (
            <div
              key={stat.label}
              className={`glass-card p-5 border-l-4 ${stat.accent} animate-fade-in-up delay-${i}00`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.bg }}>
                  <Icon size={20} style={{ color: stat.color }} />
                </div>
                <span className="badge text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: stat.color === "#dc2626" ? "rgba(220,38,38,0.1)" : "rgba(22,163,74,0.12)",
                    color: stat.color === "#dc2626" ? "#dc2626" : "#16a34a"
                  }}>
                  {stat.delta}
                </span>
              </div>
              <p className="stat-number">{stat.value}</p>
              <p className="text-xs mt-1 font-medium" style={{ color: "var(--color-text-muted)" }}>{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Classrooms */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Ongoing Classrooms</h2>
            <Link to="/classrooms" className="btn btn-ghost text-xs gap-1">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {classrooms.map((cls: any, i: number) => (
              <Link to={`/classrooms/${cls.id}`} key={cls.id}>
                <GlassCard interactive className={`animate-fade-in-up delay-${i % 3}00`}>
                  <div className="gradient-blue rounded-xl mb-4 p-4 h-28 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 bg-white" />
                    <div className="absolute -right-2 -bottom-6 w-20 h-20 rounded-full opacity-8 bg-white" />
                    <div>
                      <span className="badge text-[9px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}>
                        {cls.batch}
                      </span>
                    </div>
                    <div>
                      <p className="text-white text-[10px] font-semibold uppercase tracking-widest opacity-70">{cls.code}</p>
                      <h3 className="text-white font-bold text-sm leading-snug mt-0.5">{cls.name}</h3>
                      <div className="flex items-center gap-1.5 mt-2 opacity-80">
                         <User size={10} className="text-white" />
                         <span className="text-white text-[10px] font-medium">{cls.teacher}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${cls.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <div className="flex items-center gap-1.5">
                        <Users size={13} /> {cls.students} Students
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} /> {cls.time}
                      </div>
                      <span className="font-semibold" style={{ color: "var(--color-brand-blue)" }}>{cls.progress}%</span>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Upcoming */}
          <GlassCard padding="sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={15} style={{ color: "var(--color-brand-blue)" }} />
                <h3 className="section-title text-sm">Today's Schedule</h3>
              </div>
              <Link to="/calendar" className="text-[10px] font-semibold" style={{ color: "var(--color-brand-blue)" }}>
                View all
              </Link>
            </div>
            <div className="space-y-2.5">
              {schedule.map((s: any) => (
                <div key={s.name} className="flex items-center gap-3 p-2.5 rounded-lg border"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg-grad1)" }}>
                  <div className="flex flex-col items-center w-12 shrink-0">
                    <p className="text-[10px] font-bold" style={{ color: "var(--color-brand-blue)" }}>{s.time.split(" ")[0]}</p>
                    <p className="text-[9px] opacity-60">{s.time.split(" ")[1]}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{s.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{s.room}</p>
                  </div>
                  <span className={`badge text-[9px] px-1.5 py-0.5 ${s.status === "live" ? "badge-green" : "badge-blue"}`}>
                    {s.status === "live" ? "● Live" : "Soon"}
                  </span>
                </div>
              ))}
              {schedule.length === 0 && (
                <p className="text-xs text-center py-4 text-muted-foreground italic">No classes scheduled for today.</p>
              )}
            </div>
          </GlassCard>

          {/* Risk Alerts */}
          <GlassCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-red-500" />
              <h3 className="section-title text-sm">AI Risk Alerts</h3>
            </div>
            <div className="space-y-2">
              {riskAlerts.map((alert: any) => (
                <div key={alert.id} className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{}}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-border)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    alert.level === "high" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                  }`}>
                    {alert.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{alert.name}</p>
                    <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--color-text-muted)" }}>{alert.reason}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`badge text-[9px] px-1.5 py-0.5 ${alert.level === "high" ? "badge-red" : "badge-orange"}`}>
                      {alert.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/analytics" className="btn btn-primary w-full mt-3 text-xs py-2">
              <Zap size={13} /> Run Global AI Analysis
            </Link>
          </GlassCard>

          {/* Recent Activity */}
          <GlassCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} style={{ color: "var(--color-brand-blue)" }} />
              <h3 className="section-title text-sm">Recent Activity</h3>
            </div>
            <div className="space-y-3">
              {recentActivity.map((act: any, i: number) => {
                const Icon = iconMap[act.icon] || Activity;
                return (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${act.color}15` }}>
                      <Icon size={13} style={{ color: act.color }} />
                    </div>
                    <div>
                      <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{act.text}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{act.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <GlassCard padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Calendar size={15} className="text-amber-600" /><h3 className="section-title text-sm">Pending Appointments</h3></div>
            <Link to="/appointments" className="text-[10px] font-semibold text-blue-600">View All →</Link>
          </div>
          <div className="space-y-2">
            {pendingAppointments.length === 0 ? <p className="py-4 text-center text-xs italic text-muted-foreground">No pending requests.</p> : pendingAppointments.slice(0, 3).map((appointment: any) => (
              <div key={appointment.id} className="rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)" }}>
                <p className="truncate text-xs font-semibold">{appointment.studentName}</p>
                <p className="truncate text-[10px] text-muted-foreground">{appointment.agenda} · {appointment.timeSlot || "Time pending"}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void updateAppointment(appointment.id, "approved")} className="btn btn-primary flex-1 py-1 text-[10px]">Approve</button>
                  <button onClick={() => void updateAppointment(appointment.id, "rejected")} className="btn btn-outline flex-1 py-1 text-[10px]"><XCircle size={12} /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><FileText size={15} className="text-blue-600" /><h3 className="section-title text-sm">Recent Reports</h3></div>
            <Link to="/reports" className="text-[10px] font-semibold text-blue-600">View All →</Link>
          </div>
          <div className="space-y-2">
            {recentReports.length === 0 ? <p className="py-4 text-center text-xs italic text-muted-foreground">No reports generated.</p> : recentReports.map((report: any) => (
              <div key={report.id} className="flex items-center justify-between rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)" }}>
                <p className="truncate text-xs font-semibold">{report.name}</p>
                <span className="badge badge-blue text-[9px]">{report.status}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Mail size={15} className="text-indigo-600" /><h3 className="section-title text-sm">Mail Activity</h3></div>
            <Link to="/mail" className="text-[10px] font-semibold text-blue-600">View All →</Link>
          </div>
          <p className="text-3xl font-black">{mailStats.sentThisWeek}</p>
          <p className="text-xs text-muted-foreground">emails sent this week</p>
          <p className="mt-3 text-[10px] text-muted-foreground">Last sent: {mailStats.lastSentAt ? new Date(mailStats.lastSentAt).toLocaleString() : "No mail history"}</p>
        </GlassCard>

        <GlassCard padding="sm" className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><ClipboardList size={15} className="text-purple-600" /><h3 className="section-title text-sm">Upcoming Exams</h3></div>
            <Link to="/exams" className="text-[10px] font-semibold text-blue-600">View All →</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcomingExams.length === 0 ? <p className="py-4 text-xs italic text-muted-foreground">No upcoming exams.</p> : upcomingExams.map((exam: any) => (
              <Link to="/exams" key={exam.id} className="min-w-[180px] rounded-xl border p-3 hover:bg-slate-50" style={{ borderColor: "var(--color-border)" }}>
                <p className="truncate text-sm font-bold">{exam.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{exam.scheduledAt ? new Date(exam.scheduledAt).toLocaleDateString() : "Date pending"}</p>
                <span className="mt-2 inline-block badge badge-blue text-[9px]">{exam.status}</span>
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><BarChart2 size={15} className="text-emerald-600" /><h3 className="section-title text-sm">Engagement Health</h3></div>
            <Link to="/analytics" className="text-[10px] font-semibold text-blue-600">View All →</Link>
          </div>
          <div className="mb-2 flex items-end justify-between"><span className="text-3xl font-black">{engagementSnapshot.avgScore}%</span><span className="text-xs text-muted-foreground">avg score</span></div>
          <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, engagementSnapshot.avgScore)}%` }} /></div>
          <p className="mt-3 text-xs text-muted-foreground">{engagementSnapshot.atRiskCount} at-risk of {engagementSnapshot.studentCount} students · {calendarEventsThisWeek} calendar events this week</p>
        </GlassCard>
      </div>
    </div>
  );
};

// inline icon to avoid import mess
const FileTextIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
