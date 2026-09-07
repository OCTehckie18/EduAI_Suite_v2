import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { supabase } from "../../lib/supabase";

const get_user = () => {
  const storedUser = localStorage.getItem("user");
  return storedUser ? JSON.parse(storedUser) : null;
};

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`;
const CURRENT_STUDENT = get_user()?.name || "Student";

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

type AppointmentMode = "In-person" | "Online";
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

type TeacherGroup = {
  teacher_name: string;
  courses: Course[];
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

const statusMeta: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  approved: { label: "Approved", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
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

export const AppointmentBookingPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedTeacherName, setSelectedTeacherName] = useState("");
  const [mode, setMode] = useState<AppointmentMode>("In-person");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [agenda, setAgenda] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const teacherGroups = useMemo<TeacherGroup[]>(() => {
    const groups = new Map<string, Course[]>();
    courses
      .filter((course) => course.teacher_name)
      .forEach((course) => {
        const key = course.teacher_name as string;
        const existing = groups.get(key) ?? [];
        groups.set(key, [...existing, course]);
      });

    return Array.from(groups.entries()).map(([teacher_name, teacherCourses]) => ({
      teacher_name,
      courses: teacherCourses,
    }));
  }, [courses]);

  const selectedTeacher = useMemo(
    () => teacherGroups.find((teacher) => teacher.teacher_name === selectedTeacherName) ?? teacherGroups[0] ?? null,
    [teacherGroups, selectedTeacherName]
  );

  const bookingMatchesTeacher = Boolean(selectedTeacher);

  const loadData = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);

    try {
      const headers = await getAuthHeaders();
      const [courseResponse, appointmentResponse] = await Promise.all([
        fetch(`${API_URL}/courses/`, { headers }),
        fetch(`${API_URL}/appointments/student/${encodeURIComponent(CURRENT_STUDENT)}`, { headers }),
      ]);

      if (!courseResponse.ok) {
        throw new Error(`Failed to load teachers (${courseResponse.status})`);
      }

      if (!appointmentResponse.ok) {
        throw new Error(`Failed to load bookings (${appointmentResponse.status})`);
      }

      const [courseData, appointmentData] = await Promise.all([courseResponse.json(), appointmentResponse.json()]);
      setCourses(Array.isArray(courseData) ? courseData : []);
      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to sync appointments.");
      setCourses([]);
      setAppointments([]);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedTeacherName && teacherGroups.length > 0) {
      setSelectedTeacherName(teacherGroups[0].teacher_name);
    }
    if (selectedTeacherName && !teacherGroups.some((teacher) => teacher.teacher_name === selectedTeacherName)) {
      setSelectedTeacherName(teacherGroups[0]?.teacher_name ?? "");
    }
  }, [teacherGroups, selectedTeacherName]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeacher) return;

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch(`${API_URL}/appointments/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          student_name: CURRENT_STUDENT,
          student_email: get_user()?.email || get_user()?.sub || "student@christuniversity.in",
          teacher_name: selectedTeacher.teacher_name,
          meeting_mode: mode,
          time_slot: `${preferredDate} ${preferredTime}`.trim(),
          agenda: agenda || "Meeting Request",
          details: details,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create booking (${response.status})`);
      }

      await loadData();
      setNotice(`Appointment request sent to ${selectedTeacher.teacher_name}.`);
      setPreferredDate("");
      setPreferredTime("");
      setAgenda("");
      setDetails("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to book appointment.");
    } finally {
      setSubmitting(false);
    }
  };

  const myAppointments = appointments.filter((appointment) => appointment.student_name === CURRENT_STUDENT);

  const handleReschedule = (appointment: Appointment) => {
    setSelectedTeacherName(appointment.teacher_name);
    setAgenda(appointment.agenda);
    setDetails(appointment.details || "");
    
    // Parse suggestion if exists: [RESCHEDULE SUGGESTION: 2026-05-16 at 19:56]
    const suggestionMatch = appointment.rejection_reason?.match(/\[RESCHEDULE SUGGESTION: (.*?) at (.*?)\]/);
    if (suggestionMatch) {
      setPreferredDate(suggestionMatch[1]);
      setPreferredTime(suggestionMatch[2]);
    } else {
      // Fallback to original slot if no suggestion, but usually better to let student pick fresh
      setPreferredDate("");
      setPreferredTime("");
    }
    
    // Scroll to the top where the booking form is
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{ background: "rgba(208,174,97,0.12)", color: "var(--color-brand-gold-dark)" }}>
            <Sparkles size={12} />
            Student Appointment Center
          </div>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
            Book a Teacher Appointment
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Choose a teacher, add a preferred date and time, and track the approval status from the same shared backend.
          </p>
        </div>


      </div>

      {(syncing || syncError || notice) && (
        <div className="grid gap-3">
          {syncing && (
            <GlassCard className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-brand-blue)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Syncing booking status...</p>
            </GlassCard>
          )}
          {syncError && (
            <GlassCard variant="gold" className="flex items-center gap-3">
              <AlertCircle size={18} style={{ color: "var(--color-brand-gold-dark)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{syncError}</p>
            </GlassCard>
          )}
          {notice && (
            <GlassCard variant="gold" className="flex items-center gap-3">
              <CheckCircle2 size={18} style={{ color: "var(--color-brand-gold-dark)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{notice}</p>
            </GlassCard>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">Choose a Teacher</h2>
            </div>

            {teacherGroups.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {teacherGroups.map((teacher) => {
                  const active = teacher.teacher_name === selectedTeacherName;
                  return (
                    <button
                      key={teacher.teacher_name}
                      type="button"
                      onClick={() => setSelectedTeacherName(teacher.teacher_name)}
                      className={`text-left rounded-2xl p-4 transition-all border ${active ? "shadow-lg" : "hover:shadow-sm"}`}
                      style={{
                        background: active ? "rgba(38,71,150,0.06)" : "var(--color-surface-base)",
                        borderColor: active ? "rgba(38,71,150,0.28)" : "var(--color-border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                          style={{ background: "linear-gradient(135deg, #264796, #3460c4)" }}>
                          {teacher.teacher_name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                        </div>
                        {active && <ChevronRight size={16} style={{ color: "var(--color-brand-blue)" }} />}
                      </div>
                      <p className="mt-3 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{teacher.teacher_name}</p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                        {teacher.courses.length} linked course{teacher.courses.length !== 1 ? "s" : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {teacher.courses.slice(0, 2).map((course) => (
                          <span key={course.id} className="badge text-[10px]" style={{ background: "rgba(38,71,150,0.08)", color: "var(--color-brand-blue)" }}>
                            {course.code}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl p-6 text-center border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>No teachers are available yet.</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Teacher cards will appear once courses with teachers are loaded.</p>
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">Appointment Details</h2>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Meeting Mode</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["In-person", "Online"] as AppointmentMode[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMode(item)}
                        className="rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                        style={{
                          background: mode === item ? "linear-gradient(135deg, #264796, #3460c4)" : "rgba(100,116,139,0.08)",
                          color: mode === item ? "white" : "var(--color-text-secondary)",
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Selected Teacher</span>
                  <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "var(--color-border)", background: "rgba(38,71,150,0.03)" }}>
                    <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{selectedTeacher?.teacher_name ?? "No teacher selected"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {selectedTeacher?.courses.map((course) => course.code).join(" · ") || "Choose a teacher above"}
                    </p>
                  </div>
                </label>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Preferred Date</span>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(event) => setPreferredDate(event.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-base)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Preferred Time</span>
                  <input
                    type="time"
                    value={preferredTime}
                    onChange={(event) => setPreferredTime(event.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-base)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Agenda (Subject)</span>
                <input
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  placeholder="e.g., Project Proposal Discussion"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-base)",
                    border: "1px solid var(--color-border)",
                  }}
                />
              </label>

              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Details (Body)</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Add more context about what you want to discuss..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-base)",
                    border: "1px solid var(--color-border)",
                  }}
                />
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="submit"
                  className="btn btn-primary text-sm font-semibold"
                  disabled={submitting || !selectedTeacher || !preferredDate || !preferredTime}
                >
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {submitting ? "Booking..." : "Book Appointment"}
                </button>
                <div className="flex items-center gap-2 text-xs" style={{ color: bookingMatchesTeacher ? "#16a34a" : "#d97706" }}>
                  <MapPin size={14} />
                  {bookingMatchesTeacher ? "Booking will be sent to the selected teacher." : "Select a teacher to continue."}
                </div>
              </div>
            </form>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <User size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">Sync Status</h2>
            </div>
            <div className="space-y-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>1</span>
                <p>Booking requests are saved to the shared backend so teacher approvals update the same record.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(208,174,97,0.12)", color: "#d97706" }}>2</span>
                <p>Use the refresh button below to manually sync statuses from the teacher portal.</p>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="btn btn-outline w-full text-sm mt-2"
              >
                <RefreshCw size={14} /> Refresh Now
              </button>
            </div>
          </GlassCard>

          <GlassCard variant="blue">
            <div className="flex items-center gap-2 mb-4">
              <BadgeCheck size={18} style={{ color: "var(--color-brand-blue)" }} />
              <h2 className="section-title text-sm">My Appointments</h2>
            </div>

            <div className="space-y-3">
              {myAppointments.length > 0 ? (
                myAppointments.map((appointment) => {
                  const meta = statusMeta[appointment.status];
                  return (
                    <div key={appointment.id} className="rounded-xl p-3 border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{appointment.teacher_name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{appointment.agenda}</p>
                        </div>
                        <span className="badge text-[10px]" style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </div>
                      {appointment.status === "rejected" && appointment.rejection_reason && (
                        <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-100">
                          <p className="text-[10px] font-bold text-red-600 uppercase">Reason for Rejection</p>
                          <p className="text-[11px] text-red-700 italic">{appointment.rejection_reason}</p>
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 font-bold text-slate-400 uppercase tracking-widest text-[9px]">Date</span>
                          <span className="flex items-center gap-1"><Calendar size={12} /> {formatSlot(appointment.time_slot).date}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 font-bold text-slate-400 uppercase tracking-widest text-[9px]">Time</span>
                          <span className="flex items-center gap-1 font-bold" style={{ color: "var(--color-text-primary)" }}><Clock size={12} /> {formatSlot(appointment.time_slot).time}</span>
                        </div>
                      </div>
                      {appointment.status === "rejected" && (
                        <button
                          onClick={() => handleReschedule(appointment)}
                          className="mt-3 w-full btn btn-primary text-[10px] font-black uppercase tracking-widest py-2 h-auto"
                          style={{ background: "linear-gradient(135deg, #264796, #3460c4)" }}
                        >
                          <RefreshCw size={12} strokeWidth={3} /> Reschedule Meeting
                        </button>
                      )}
                      {appointment.reviewed_by && (
                        <p className="text-[11px] mt-2 italic flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                          <BadgeCheck size={12} className="text-blue-500" /> Reviewed by {appointment.reviewed_by}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl p-4 border text-center" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>No appointments yet.</p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Your booking requests will appear here after submission.</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
