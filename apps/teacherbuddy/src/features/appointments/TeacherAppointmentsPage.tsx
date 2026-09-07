import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Clock,
  CircleDashed,
  Loader2,
  RefreshCw,
  Search,
  Users,
  User,
  XCircle,
  MessageSquareText,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/useAuthStore";

import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

const API_URL = API_ENDPOINTS.BASE;

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const storedToken = localStorage.getItem("token");
  if (storedToken) return { Authorization: `Bearer ${storedToken}` };

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) {
    localStorage.setItem("token", accessToken);
    return { Authorization: `Bearer ${accessToken}` };
  }
  return {};
};

type AppointmentStatus = "pending" | "approved" | "rejected";

type Course = {
  id: number;
  code: string;
  name: string;
  batch: string;
  students: number;
  progress: number;
  color: string;
  description: string;
  teacher_name?: string | null;
};

type Appointment = {
  id: number;
  student_name: string;
  student_email?: string | null;
  teacher_name: string;
  teacher_department?: string | null;
  meeting_mode: string;
  time_slot: string;
  agenda: string;
  details?: string | null;
  status: AppointmentStatus;
  rejection_reason?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  notes?: string | null;
};

const formatTimestamp = (value: string) => {
  if (!value) return "";
  
  // Ensure the timestamp is treated as UTC if it's an ISO-like string without a timezone
  const isoValue = (value.includes("T") && !value.includes("Z") && !value.includes("+")) 
    ? `${value}Z` 
    : value;
    
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(parsed);
};

const formatSlot = (slot: string) => {
  if (!slot) return { date: "No date set", time: "No time set" };
  
  const parts = slot.split(" ");
  if (parts.length < 2) return { date: slot, time: "" };

  const [datePart, timePart] = parts;
  
  // Date formatting
  let dateDisplay = datePart;
  try {
    const d = new Date(datePart);
    if (!isNaN(d.getTime())) {
      dateDisplay = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  } catch (e) {}

  // Time formatting (12h)
  let timeDisplay = timePart;
  try {
    const [hoursStr, minutes] = timePart.split(":");
    const hours = parseInt(hoursStr, 10);
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    timeDisplay = `${h12}:${minutes} ${ampm}`;
  } catch (e) {}

  return { date: dateDisplay, time: timeDisplay };
};

const statusTabs: Array<{ id: "all" | AppointmentStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const statusCopy: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending Review", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  approved: { label: "Approved", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
};

export const TeacherAppointmentsPage: React.FC = () => {
  const authUser = useAuthStore((state) => state.user);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState("All Teachers");
  const [statusTab, setStatusTab] = useState<"all" | AppointmentStatus>("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [rejectingAppointment, setRejectingAppointment] = useState<Appointment | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [suggestedDate, setSuggestedDate] = useState("");
  const [suggestedTime, setSuggestedTime] = useState("");

  useEffect(() => {
    if (authUser?.role === "teacher" && authUser.name) {
      setSelectedTeacher(authUser.name);
    }
  }, [authUser?.name, authUser?.role]);

  const teacherOptions = useMemo(() => {
    const names = new Set<string>();
    courses.forEach((course) => {
      if (course.teacher_name) names.add(course.teacher_name);
    });
    appointments.forEach((appointment) => {
      if (appointment.teacher_name) names.add(appointment.teacher_name);
    });
    return ["All Teachers", ...Array.from(names).sort()];
  }, [appointments, courses]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();

      const [appointmentsResponse, coursesResponse] = await Promise.all([
        fetch(`${API_URL}/appointments/`, { headers }),
        fetch(`${API_URL}/courses/`, { headers }),
      ]);

      if (!appointmentsResponse.ok) {
        throw new Error(`Failed to load appointments (${appointmentsResponse.status})`);
      }

      if (!coursesResponse.ok) {
        throw new Error(`Failed to load courses (${coursesResponse.status})`);
      }

      const [appointmentData, courseData] = await Promise.all([appointmentsResponse.json(), coursesResponse.json()]);
      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
      setCourses(Array.isArray(courseData) ? courseData : []);
      setSelectedId((current) => current ?? appointmentData?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments.");
      setAppointments([]);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (authUser?.role !== "teacher" && selectedTeacher !== "All Teachers" && !teacherOptions.includes(selectedTeacher)) {
      setSelectedTeacher("All Teachers");
    }
  }, [authUser?.role, selectedTeacher, teacherOptions]);

  const teacherAppointments = useMemo(() => appointments.filter((appointment) => (
    selectedTeacher === "All Teachers"
      || appointment.teacher_name.trim().toLowerCase() === selectedTeacher.trim().toLowerCase()
  )), [appointments, selectedTeacher]);

  const filteredAppointments = useMemo(() => {
    return teacherAppointments
      .filter((appointment) => statusTab === "all" ? true : appointment.status === statusTab)
      .filter((appointment) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [
          appointment.student_name,
          appointment.teacher_name,
          appointment.agenda,
          appointment.details || "",
          appointment.meeting_mode,
          appointment.time_slot,
        ].some((value) => value.toLowerCase().includes(query));
      });
  }, [search, statusTab, teacherAppointments]);

  useEffect(() => {
    if (!filteredAppointments.some((appointment) => appointment.id === selectedId)) {
      setSelectedId(filteredAppointments[0]?.id ?? null);
    }
  }, [filteredAppointments, selectedId]);

  const selectedAppointment = filteredAppointments.find((appointment) => appointment.id === selectedId) ?? filteredAppointments[0] ?? null;

  const counts = useMemo(() => ({
    total: teacherAppointments.length,
    pending: teacherAppointments.filter((appointment) => appointment.status === "pending").length,
    approved: teacherAppointments.filter((appointment) => appointment.status === "approved").length,
    rejected: teacherAppointments.filter((appointment) => appointment.status === "rejected").length,
  }), [teacherAppointments]);

  const respondToAppointment = async (appointment: Appointment, status: AppointmentStatus, rejectionReason?: string) => {
    setActioningId(appointment.id);
    try {
      const response = await fetch(`${API_URL}/appointments/${appointment.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          status,
          reviewed_by: appointment.teacher_name,
          rejection_reason: rejectionReason,
          notes: decisionNotes[appointment.id] ?? (status === "approved" ? "Approved for the requested slot." : "Declined with a reschedule recommendation."),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update appointment (${response.status})`);
      }

      // Log history
      await fetch(`${API_URL}/history/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: "appointment",
          action: status === "approved" ? "approve_appointment" : "reject_appointment",
          reaction: rejectionReason ? "rejection_reason_provided" : "processed",
          result: "success",
          user_id: appointment.teacher_name,
          metadata_json: { appointment_id: appointment.id, student_name: appointment.student_name }
        }),
      });

      await fetchData();
    } finally {
      setActioningId(null);
      setRejectingAppointment(null);
      setRejectionReasonInput("");
      setSuggestedDate("");
      setSuggestedTime("");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{ background: "rgba(208,174,97,0.12)", color: "var(--color-brand-gold-dark)" }}>
            <BadgeCheck size={12} />
            Teacher Appointment Review
          </div>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
            Student Booking Approvals
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Review student appointment requests, approve or reject them, and keep the student portal synced automatically.
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bookings, students, or agendas..."
            className="w-full rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none transition-all focus:shadow-lg"
            style={{ 
              background: "var(--color-surface-base)", 
              border: "1px solid var(--color-border)", 
              color: "var(--color-text-primary)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.02)"
            }}
          />
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {rejectingAppointment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <GlassCard className="w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <XCircle size={24} />
              <h2 className="text-xl font-bold font-display">Reject Appointment</h2>
            </div>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Please provide a reason for rejecting the appointment from <strong>{rejectingAppointment.student_name}</strong>.
            </p>
            <textarea
              value={rejectionReasonInput}
              onChange={(e) => setRejectionReasonInput(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
              style={{ background: "var(--color-surface-base)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              placeholder="e.g., I have a conflicting lecture. Please reschedule for tomorrow."
              rows={3}
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggest New Date</span>
                <input
                  type="date"
                  value={suggestedDate}
                  onChange={(e) => setSuggestedDate(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                  style={{ background: "var(--color-surface-base)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggest New Time</span>
                <input
                  type="time"
                  value={suggestedTime}
                  onChange={(e) => setSuggestedTime(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                  style={{ background: "var(--color-surface-base)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setRejectingAppointment(null);
                  setSuggestedDate("");
                  setSuggestedTime("");
                }}
                className="btn btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const finalReason = suggestedDate && suggestedTime 
                    ? `${rejectionReasonInput}\n\n[RESCHEDULE SUGGESTION: ${suggestedDate} at ${suggestedTime}]`
                    : rejectionReasonInput;
                  respondToAppointment(rejectingAppointment, "rejected", finalReason);
                }}
                className="btn btn-primary bg-red-600 hover:bg-red-700 flex-1"
                disabled={!rejectionReasonInput.trim() || actioningId === rejectingAppointment.id}
              >
                {actioningId === rejectingAppointment.id ? <Loader2 size={16} className="animate-spin" /> : "Confirm Rejection"}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: counts.total, icon: Users, color: "#264796" },
          { label: "Pending", value: counts.pending, icon: Clock, color: "#d97706" },
          { label: "Approved", value: counts.approved, icon: CheckCircle2, color: "#16a34a" },
          { label: "Rejected", value: counts.rejected, icon: XCircle, color: "#dc2626" },
        ].map((stat) => (
          <GlassCard key={stat.label} padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${stat.color}18` }}>
              <stat.icon size={18} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>{stat.value}</p>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{stat.label}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusTab(tab.id)}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
            style={{
              background: statusTab === tab.id ? "linear-gradient(135deg, #264796, #3460c4)" : "rgba(100,116,139,0.08)",
              color: statusTab === tab.id ? "white" : "var(--color-text-secondary)",
            }}
          >
            {tab.label}
          </button>
        ))}
        {authUser?.role !== "teacher" && (
          <label className="ml-2">
            <span className="sr-only">Filter by teacher</span>
            <select
              value={selectedTeacher}
              onChange={(event) => setSelectedTeacher(event.target.value)}
              className="rounded-full px-4 py-2 text-sm font-semibold outline-none"
              style={{
                background: "var(--color-surface-base)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              {teacherOptions.map((teacher) => <option key={teacher} value={teacher}>{teacher}</option>)}
            </select>
          </label>
        )}
        <button
          onClick={fetchData}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all"
          style={{ background: "rgba(208,174,97,0.12)", color: "var(--color-brand-gold-dark)" }}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {error && (
        <GlassCard variant="gold" className="flex items-center gap-3">
          <AlertCircle size={18} style={{ color: "var(--color-brand-gold-dark)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{error}</p>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          {loading ? (
            <GlassCard className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-brand-blue)" }} />
            </GlassCard>
          ) : filteredAppointments.length > 0 ? (
            filteredAppointments.map((appointment) => {
              const meta = statusCopy[appointment.status];
              const selected = appointment.id === selectedId;
              return (
                <GlassCard
                  key={appointment.id}
                  interactive
                  className={`cursor-pointer border-l-4 ${selected ? "shadow-lg" : ""}`}
                  style={{ borderLeftColor: selected ? "#264796" : "transparent" }}
                  onClick={() => setSelectedId(appointment.id)}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="badge text-[10px] font-black uppercase tracking-wider" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                        <span className="badge text-[10px] font-black uppercase tracking-wider" style={{ background: "rgba(38,71,150,0.08)", color: "var(--color-brand-blue)" }}>
                          {appointment.teacher_name}
                        </span>
                      </div>
                      <h4 className="text-xl font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>{appointment.student_name}</h4>
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold leading-tight" style={{ color: "var(--color-brand-blue)" }}>{appointment.agenda}</p>
                        {appointment.details && <p className="text-xs line-clamp-1 italic" style={{ color: "var(--color-text-muted)" }}>{appointment.details}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest pt-1" style={{ color: "var(--color-text-muted)" }}>
                        <Clock size={12} /> {formatTimestamp(appointment.requested_at)}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-8 lg:px-8 lg:border-x border-slate-100">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Calendar size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Scheduled Slot</p>
                          <div className="leading-tight">
                            <p className="text-[13px] font-bold text-slate-600">
                              {formatSlot(appointment.time_slot).date}
                            </p>
                            <p className="text-lg font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>
                              {formatSlot(appointment.time_slot).time}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                          <Users size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mode</p>
                          <p className="text-sm font-black" style={{ color: "var(--color-text-secondary)" }}>
                            {appointment.meeting_mode}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start lg:items-end gap-2">
                      {appointment.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={(event) => { event.stopPropagation(); respondToAppointment(appointment, "approved"); }}
                            className="btn btn-primary text-xs"
                            disabled={actioningId === appointment.id}
                          >
                            {actioningId === appointment.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Approve
                          </button>
                          <button
                            onClick={(event) => { event.stopPropagation(); setRejectingAppointment(appointment); }}
                            className="btn btn-outline text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={actioningId === appointment.id}
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      )}
                      {appointment.status !== "pending" && (
                        <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          Reviewed by {appointment.reviewed_by ?? "TeacherBuddy"}
                        </p>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })
          ) : (
            <GlassCard className="py-16 text-center">
              <CircleDashed size={28} className="mx-auto mb-3" style={{ color: "var(--color-text-muted)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>No bookings match this view.</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Try adjusting your search or status filter.</p>
            </GlassCard>
          )}
        </div>

        <div className="space-y-6">
          <GlassCard variant="blue">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareText size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">Selected Booking</h2>
            </div>
            {selectedAppointment ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{selectedAppointment.student_name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{selectedAppointment.student_email}</p>
                </div>
                <div className="rounded-xl p-3 border space-y-2" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Agenda (Subject)</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{selectedAppointment.agenda}</p>
                  </div>
                  {selectedAppointment.details && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Details (Body)</p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{selectedAppointment.details}</p>
                    </div>
                  )}
                  {selectedAppointment.status === "rejected" && selectedAppointment.rejection_reason && (
                    <div className="pt-2 border-t mt-2" style={{ borderColor: "rgba(220,38,38,0.2)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Rejection Reason</p>
                      <p className="text-xs italic text-red-700">{selectedAppointment.rejection_reason}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl p-4 border flex items-center gap-4" style={{ borderColor: "var(--color-border)", background: "rgba(38,71,150,0.02)" }}>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Teacher</p>
                      <p className="text-sm font-black" style={{ color: "var(--color-text-primary)" }}>{selectedAppointment.teacher_name}</p>
                      <p className="text-[11px] font-bold" style={{ color: "var(--color-text-muted)" }}>{selectedAppointment.teacher_department || "General Department"}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 border flex items-center gap-4" style={{ borderColor: "var(--color-border)", background: "rgba(208,174,97,0.05)" }}>
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <Calendar size={20} />
                    </div>
                    <div className="leading-tight">
                      <p className="text-[10px] font-black text-amber-600/60 uppercase tracking-widest mb-0.5">Meeting Schedule</p>
                      <p className="text-[12px] font-bold text-slate-500">{formatSlot(selectedAppointment.time_slot).date}</p>
                      <p className="text-sm font-black" style={{ color: "var(--color-text-primary)" }}>{formatSlot(selectedAppointment.time_slot).time}</p>
                      <p className="text-[11px] font-black uppercase tracking-widest mt-0.5" style={{ color: "var(--color-text-muted)" }}>{selectedAppointment.meeting_mode}</p>
                    </div>
                  </div>
                </div>

                <label className="space-y-2 block">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Decision Note</span>
                  <textarea
                    value={decisionNotes[selectedAppointment.id] ?? selectedAppointment.notes ?? ""}
                    onChange={(event) => setDecisionNotes((current) => ({ ...current, [selectedAppointment.id]: event.target.value }))}
                    rows={4}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-base)",
                      border: "1px solid var(--color-border)",
                    }}
                    placeholder="Add a note for the student..."
                  />
                </label>

                {selectedAppointment.status === "pending" && (
                  <div className="flex gap-3">
                    <button
                      className="btn btn-primary flex-1 text-sm"
                      onClick={() => respondToAppointment(selectedAppointment, "approved")}
                    >
                      <CheckCircle2 size={15} /> Approve
                    </button>
                    <button
                      className="btn btn-outline flex-1 text-sm text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setRejectingAppointment(selectedAppointment)}
                    >
                      <XCircle size={15} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select a booking to review its details.</p>
            )}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">Approval Flow</h2>
            </div>
            <div className="space-y-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}>1</span>
                <p>Pending bookings arrive from EduGames through the shared backend.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>2</span>
                <p>Approve or reject a booking using the action buttons on the list or detail pane.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(38,71,150,0.12)", color: "#264796" }}>3</span>
                <p>The student portal refreshes the same appointment record and shows the updated status.</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
