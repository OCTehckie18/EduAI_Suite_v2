import { GradeTag, useRules } from "../../shared/university";
import React, { useState, useEffect } from "react";
import {
  ClipboardList, Clock, Users, Plus, CheckCircle2, AlertCircle,
  Play, ChevronRight, BrainCircuit, Eye, Check, X, Timer,
  FileText, Layers, Trash2, Settings, RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { ExamCreator } from "./ExamCreator";
import { useAuthStore } from "../../store/useAuthStore";
import { AnswerSheet } from "./AnswerSheet";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { getGreeting, getFormattedDate } from "../../shared/utils/dateUtils";

type ExamView = "list" | "take" | "review";

const statusStyle: Record<string, { color: string; bg: string; label: string }> = {
  upcoming: { color: "var(--color-brand-blue)", bg: "color-mix(in srgb, var(--color-brand-blue) 10%, transparent)", label: "Upcoming" },
  ongoing: { color: "#d97706", bg: "rgba(217,119,6,0.1)", label: "Ongoing" },
  completed: { color: "#16a34a", bg: "rgba(22,163,74,0.1)", label: "Completed" },
  closed: { color: "#b45309", bg: "rgba(180,83,9,0.1)", label: "Closed" },
  published: { color: "var(--color-brand-blue)", bg: "color-mix(in srgb, var(--color-brand-blue) 10%, transparent)", label: "Live" },
  draft: { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: "Draft" },
};

export const ExamsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();
  // The university may keep resets for its administration (Master Admin > Rules).
  const resetByAdmins = useRules().exam.reset_by === "admins";
  const canReset = !resetByAdmins || /admin/i.test(String(authUser?.role ?? ""));
  const [examsList, setExamsList] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "review" | "resets">("overview");
  const [resets, setResets] = useState<any[]>([]);
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetReason, setResetReason] = useState("");
  const [resetUntil, setResetUntil] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [editingExam, setEditingExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [stats, setStats] = useState<any>({ total_exams: null, submissions_today: null, avg_completion_rate: null });

  useEffect(() => {
    fetchExams();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/stats`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      // On failure the cards say "Not available" rather than showing made-up zeros.
      setStats(response.ok ? await response.json() : { total_exams: null, submissions_today: null, avg_completion_rate: null });
    } catch {
      setStats({ total_exams: null, submissions_today: null, avg_completion_rate: null });
    }
  };

  const fetchExams = async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/`, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      if (response.status === 401) {
        throw new Error("Session expired. Please log out and log back in.");
      }
      if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      const data = await response.json();
      setExamsList(data);
      setSelectedExam((current: any) => (current ? data.find((e: any) => e.id === current.id) ?? data[0] ?? null : data[0] ?? null));
    } catch (err: any) {
      console.error("Error fetching exams:", err);
      setError(err.message === "Session expired. Please log out and log back in." ? err.message : (err.name === 'TimeoutError' ? "Request timed out. Is the backend running?" : "Failed to load exams. Please refresh."));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExam = async (examData: any) => {
    try {
      const url = editingExam
        ? `${API_ENDPOINTS.EXAMS}/${editingExam.id}`
        : `${API_ENDPOINTS.EXAMS}/`;

      const token = localStorage.getItem("token");
      const response = await fetch(url, {
        method: editingExam ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(examData),
      });
      if (response.ok) {
        const saved = await response.json().catch(() => null);
        setShowCreator(false);
        setEditingExam(null);
        await fetchExams();
        if (saved?.id) setSelectedExam(saved);
        setActiveTab("overview");
        void fetchStats();
        return true;
      }
      // Pass the server's reason back so the creator can show it (for example "questions are locked").
      const body = await response.json().catch(() => ({}));
      return body.detail || body.error?.message || "Failed to save the exam.";
    } catch (err) {
      console.error("Save failed", err);
    }
    return "Failed to save the exam. Check your connection and try again.";
  };

  const changeStatus = async (status: "draft" | "published" | "closed") => {
    if (!selectedExam) return;
    try {
      const token = localStorage.getItem("token");
      // Only the status is sent, so the questions (which may already have answers) are never touched.
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${selectedExam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.detail || "Could not change the exam status.");
        return;
      }
      setNotice("");
      setExamsList(prev => prev.map(e => e.id === body.id ? body : e));
      setSelectedExam(body);
      void fetchStats();
    } catch (err) {
      console.error("Status change failed", err);
      setNotice("Could not change the exam status. Check your connection.");
    }
  };

  const handleDeleteExam = async (id: number) => {
    const exam = examsList.find((e) => e.id === id);
    const hasAttempts = !!exam?.attempts?.length;
    const warning = hasAttempts
      ? "Students have already attempted this exam. Deleting it also deletes their attempts and scores. This cannot be undone. Delete anyway?"
      : "Are you sure you want to delete this exam? This action cannot be undone.";
    if (!window.confirm(warning)) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(body.detail || "Could not delete the exam.");
        return;
      }
      setNotice("");
      setExamsList(prev => prev.filter(e => e.id !== id));
      if (selectedExam?.id === id) setSelectedExam(null);
      void fetchStats();
    } catch (err) {
      console.error("Delete failed", err);
      setNotice("Could not delete the exam. Check your connection.");
    }
  };

  const handleExportStats = async () => {
    if (!selectedExam) return;
    let rowsSource: any[] = attempts;
    try {
      // Always load fresh attempts, so the export works without visiting the Review tab first.
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${selectedExam.id}/attempts`, { headers: { "Authorization": `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load the attempts.");
      rowsSource = await response.json();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not export the results.");
      return;
    }
    if (rowsSource.length === 0) {
      setNotice("No one has attempted this exam yet, so there is nothing to export.");
      return;
    }
    setNotice("");

    // Quote every cell, and defuse anything a spreadsheet would run as a formula.
    const cell = (value: unknown) => {
      let text = value == null ? "" : String(value);
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = ["Student Name", "Email", "Score (%)", "Points", "Finished", "Status", "Flag reason"];
    const rows = rowsSource.map((a: any) => [
      a.student_name,
      a.student_email,
      a.status === "submitted" || a.status === "flagged" ? a.score : "",
      a.status === "submitted" && a.total_points != null ? `${a.earned_points} / ${a.total_points}` : "",
      a.end_time ? new Date(a.end_time).toLocaleString() : "",
      a.status,
      a.flag_reason || "",
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedExam.title}_results.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePublishExam = () => changeStatus("published");

  const handleUnpublishExam = () => changeStatus("draft");

  const openEditCreator = (exam: any) => {
    setEditingExam(exam);
    setShowCreator(true);
  };

  const fetchAttempts = async (examId: number) => {
    try {
      setLoadingAttempts(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${examId}/attempts`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Could not load the submissions.");
      const data = await response.json();
      setAttempts(data);
    } catch (err) {
      console.error("Error fetching attempts:", err);
      setAttempts([]);
      setNotice(err instanceof Error ? err.message : "Could not load the submissions.");
    } finally {
      setLoadingAttempts(false);
    }
  };

  const fetchAttemptDetail = async (examId: number, attemptId: number) => {
    try {
      setLoadingDetail(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${examId}/attempts/${attemptId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Could not open that answer sheet.");
      const data = await response.json();
      setSelectedAttempt(data);
    } catch (err) {
      console.error("Error fetching attempt details:", err);
      setNotice(err instanceof Error ? err.message : "Could not open that answer sheet.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const fetchResets = async (examId: number) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${examId}/resets`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!response.ok) throw new Error("Could not load the reset history.");
      setResets(await response.json());
    } catch (err) {
      setResets([]);
      setNotice(err instanceof Error ? err.message : "Could not load the reset history.");
    }
  };

  const submitReset = async () => {
    if (!resetTarget || !selectedExam) return;
    setResetError("");
    if (!resetReason.trim()) { setResetError("Give a reason. It is kept with the exam record."); return; }
    setResetting(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${selectedExam.id}/attempts/${resetTarget.id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ reason: resetReason.trim(), allowed_until: resetUntil ? new Date(resetUntil).toISOString() : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not reset the attempt.");
      setNotice(`${resetTarget.student_name || "The student"}'s attempt was reset. They can take the exam again with a new set of questions.`);
      setResetTarget(null);
      setResetReason("");
      setResetUntil("");
      await fetchAttempts(selectedExam.id);
      await fetchResets(selectedExam.id);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not reset the attempt.");
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (selectedExam && activeTab === "review") {
      fetchAttempts(selectedExam.id);
    }
    if (selectedExam && activeTab === "resets") {
      fetchResets(selectedExam.id);
    }
  }, [selectedExam, activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            {getGreeting()}, {authUser?.name || "Professor"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {getFormattedDate()}. Manage and track your examinations.
          </p>
        </div>
        <button onClick={() => { setEditingExam(null); setShowCreator(true); }} className="btn btn-primary text-sm">
          <Plus size={15} /> Create Exam
        </button>
      </div>

      {showCreator && (
        <ExamCreator
          onClose={() => { setShowCreator(false); setEditingExam(null); }}
          onSave={handleSaveExam}
          initialData={editingExam}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Total Exams", value: stats.total_exams == null ? "Not available" : String(stats.total_exams), icon: ClipboardList, color: "var(--color-brand-blue)" },
          { label: "Submissions Today", value: stats.submissions_today == null ? "Not available" : String(stats.submissions_today), icon: CheckCircle2, color: "#16a34a" },
          { label: "Completion Rate", value: stats.avg_completion_rate == null ? "Not available" : `${stats.avg_completion_rate}%`, icon: Users, color: "var(--color-brand-accent)" },
        ].map(s => (
          <GlassCard key={s.label} padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `color-mix(in srgb, ${s.color} 9%, transparent)` }}>
              <s.icon size={19} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{s.value}</p>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{s.label}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Exam List */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
              Loading exams...
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-100">
              <AlertCircle size={24} className="text-red-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-red-600">{error}</p>
              <button onClick={fetchExams} className="btn bg-white border-red-200 text-red-600 text-xs mt-3 px-4 py-1.5 hover:bg-red-100">Try Again</button>
            </div>
          ) : examsList.length === 0 ? (
            <div className="p-10 text-center text-slate-400">No exams found.</div>
          ) : (
            examsList.map(exam => {
              const s = statusStyle[exam.status] || statusStyle.draft;
              return (
                <div
                  key={exam.id}
                  onClick={() => { setSelectedExam(exam); setAttempts([]); setNotice(""); }}
                  className={`glass-card p-4 cursor-pointer transition-all hover:shadow-md border-l-4 ${selectedExam?.id === exam.id ? "border-l-brand-blue shadow-lg" : "border-l-transparent"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug" style={{ color: "var(--color-text-primary)" }}>{exam.title}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{exam.course_code ? `${exam.course_code} · ${exam.course_name}` : `Course ${exam.course_id}`}</p>
                    </div>
                    <span className="badge shrink-0 text-[9px] px-2 py-0.5" style={{ color: s.color, background: s.bg }}>
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    <span className="flex items-center gap-1"><Clock size={10} /> {exam.time_limit}m</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {exam.attempts_allowed} attempts</span>
                    <span className="flex items-center gap-1"><Layers size={10} /> MCQ</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Exam Detail */}
        <div className="xl:col-span-2">
          {selectedExam ? (
            <>
              <GlassCard padding="none">
                {/* Hero */}
                <div className="gradient-blue rounded-t-2xl p-5 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge text-[9px] px-2" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                          MCQ
                        </span>
                        <span className="badge text-[9px] px-2" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                          {selectedExam.course_code ? `${selectedExam.course_code} · ${selectedExam.course_name}` : `Course ${selectedExam.course_id}`}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold">{selectedExam.title}</h2>
                      <p className="text-white/70 text-sm mt-1">Created: {new Date(selectedExam.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-3xl font-black">{selectedExam.questions?.reduce((acc: number, q: any) => acc + (q.points || 0), 0) || 0}</p>
                        <p className="text-white/60 text-xs">Total Marks</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteExam(selectedExam.id)}
                          className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-lg transition-colors text-white"
                          title="Delete Exam"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-6 mt-4 pt-4 border-t border-white/15 text-xs text-white/75">
                    <span className="flex items-center gap-1.5"><Timer size={12} /> {selectedExam.time_limit} minutes</span>
                    <span className="flex items-center gap-1.5"><ClipboardList size={12} /> {selectedExam.questions?.length || 0} questions</span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b" style={{ borderColor: "color-mix(in srgb, var(--color-brand-blue) 10%, transparent)" }}>
                  {(["overview", "review", "resets"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-5 py-3.5 text-sm font-semibold capitalize transition-colors flex items-center gap-1.5 ${activeTab === tab ? "border-b-2 border-brand-blue text-brand-blue" : "text-slate-400 hover:text-slate-600"
                        }`}>
                      {tab === "review" && <Eye size={13} />}
                      {tab === "resets" ? "Reset history" : tab}
                    </button>
                  ))}
                </div>

                {notice && (
                  <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-start justify-between gap-3">
                    <span>{notice}</span>
                    <button onClick={() => setNotice("")} aria-label="Dismiss" className="text-red-400 hover:text-red-600"><X size={12} /></button>
                  </div>
                )}

                <div className="p-5">
                  {/* Overview */}
                  {activeTab === "overview" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Questions", value: `${selectedExam.questions?.length || 0}` },
                          { label: "Status", value: `${selectedExam.status}` },
                          { label: "Time Limit", value: `${selectedExam.time_limit}m` },
                          { label: "Randomized", value: selectedExam.randomize_questions ? "Yes" : "No" },
                        ].map(item => (
                          <div key={item.label} className="p-3 rounded-xl text-center"
                            style={{ background: "color-mix(in srgb, var(--color-brand-blue) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--color-brand-blue) 10%, transparent)" }}>
                            <p className="text-xl font-bold" style={{ color: "var(--color-brand-blue)" }}>{item.value}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{item.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {selectedExam.status === "published" ? (
                          <>
                            <button onClick={() => changeStatus("closed")} className="btn btn-primary flex-1 text-sm bg-amber-600 hover:bg-amber-700 border-amber-600">
                              <X size={14} /> Close Exam
                            </button>
                            <button onClick={handleUnpublishExam} className="btn btn-outline flex-1 text-sm">
                              Unpublish
                            </button>
                          </>
                        ) : (
                          <button onClick={handlePublishExam} className="btn btn-primary flex-1 text-sm bg-green-600 hover:bg-green-700 border-green-600">
                            <CheckCircle2 size={14} /> {selectedExam.status === "closed" ? "Reopen Exam" : "Publish Now"}
                          </button>
                        )}
                        <button onClick={() => openEditCreator(selectedExam)} className="btn btn-outline flex-1 text-sm">
                          <Settings size={14} /> Edit Exam
                        </button>
                        <button onClick={() => void handleExportStats()} className="btn btn-outline text-sm flex-1">
                          <FileText size={14} /> Export Results
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {selectedExam.status === "draft" && "Students cannot see this exam until you publish it."}
                        {selectedExam.status === "published" && "Students in this class can take the exam now."}
                        {selectedExam.status === "closed" && "Closed: students can no longer start it, and their results are kept."}
                      </p>
                    </div>
                  )}

                  {/* Review Submissions */}
                  {activeTab === "review" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Users size={16} className="text-blue-600" />
                          Student Submissions ({attempts.length}){attempts.some((a: any) => a.status === "pending_review") && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Needs marking ({attempts.filter((a: any) => a.status === "pending_review").length})</span>}
                        </h3>
                        <button onClick={() => fetchAttempts(selectedExam.id)} className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                          <RefreshCw size={12} /> Refresh
                        </button>
                      </div>

                      {loadingAttempts ? (
                        <div className="py-10 text-center text-slate-400">
                          <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                          Loading submissions...
                        </div>
                      ) : attempts.length === 0 ? (
                        <div className="py-10 text-center text-slate-400 rounded-2xl border-2 border-dashed border-slate-100 italic text-sm">
                          No submissions found for this exam yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {attempts.map(attempt => (
                            <div key={attempt.id} className="p-4 rounded-2xl border transition-all hover:shadow-sm flex items-center justify-between gap-4"
                              style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                                  {attempt.student_name?.charAt(0) || "S"}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{attempt.student_name}</p>
                                  <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{attempt.student_email}</p>
                                  {attempt.status === "flagged" && (
                                    <p className="text-[10px] font-semibold text-red-600 mt-0.5">{attempt.flag_reason || "Left the exam"}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-center">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5" style={{ fontSize: '9px' }}>Finished</p>
                                  <p className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                                    {attempt.end_time ? new Date(attempt.end_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : "-"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5" style={{ fontSize: '9px' }}>Score</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-black text-blue-600">{attempt.status === "flagged" ? "Flagged: cheating" : attempt.status === "expired" ? "Timed out" : attempt.status === "in_progress" ? "In progress" : attempt.status === "pending_review" ? "Needs marking" : <>{attempt.score ?? 0}%<GradeTag percent={attempt.score ?? 0} /></>}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => fetchAttemptDetail(selectedExam.id, attempt.id)}
                                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
                                >
                                  {loadingDetail ? "..." : attempt.status === "pending_review" ? "Mark answers" : "View Sheet"}
                                </button>
                                {attempt.status !== "in_progress" && canReset && (
                                  <button
                                    onClick={() => { setResetTarget(attempt); setResetError(""); }}
                                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-50 transition-colors"
                                  >
                                    Reset attempt
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </GlassCard>

              {activeTab === "resets" && (
                <GlassCard padding="md" className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700">Reset history</h3>
                  {resets.length === 0 ? (
                    <p className="py-6 text-center text-sm italic text-slate-400">No attempts have been reset for this exam.</p>
                  ) : resets.map((item: any) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{item.student_name || item.student_email}</p>
                        <p className="text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString()} · by {item.reset_by || "a teacher"}</p>
                      </div>
                      <p className="mt-1 text-slate-700">Reason: {item.reason}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Cleared attempt: {item.previous?.status === "flagged" ? `flagged (${item.previous.flag_reason || "left the exam"})` : item.previous?.status === "expired" ? "timed out" : item.previous?.score != null ? `${item.previous.score}%` : item.previous?.status}
                        {item.allowed_until ? ` · allowed until ${new Date(item.allowed_until).toLocaleString()}` : ""}
                      </p>
                    </div>
                  ))}
                </GlassCard>
              )}

              {resetTarget && (
                <div role="dialog" aria-modal="true" aria-label="Reset attempt" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-slate-800 shadow-2xl">
                    <h3 className="text-lg font-bold">Reset {resetTarget.student_name || "this student"}'s attempt?</h3>
                    <p className="text-sm text-slate-600">
                      Use this when something went wrong on the student's side, such as a power cut or crash. The attempt, its score and any cheating flag are cleared, and the student gets a new set of questions. The old attempt is kept in the reset history.
                    </p>
                    <label className="block text-sm font-semibold">Reason (required)
                      <textarea value={resetReason} onChange={(e) => setResetReason(e.target.value)} rows={3} maxLength={500} placeholder="For example: power cut during the exam" className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" />
                    </label>
                    <label className="block text-sm font-semibold">Allow until (optional)
                      <input type="datetime-local" value={resetUntil} onChange={(e) => setResetUntil(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" />
                      <span className="mt-1 block text-xs font-normal text-slate-500">Only needed if the exam window has already closed.</span>
                    </label>
                    {resetError && <p role="alert" className="text-sm font-semibold text-red-700">{resetError}</p>}
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setResetTarget(null)} className="btn btn-outline px-5 py-2">Cancel</button>
                      <button onClick={() => void submitReset()} disabled={resetting} className="btn btn-primary px-5 py-2 font-bold disabled:opacity-50">{resetting ? "Resetting..." : "Reset attempt"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Answer Sheet Viewer Modal */}
              {selectedAttempt && (
                <AnswerSheet key={selectedAttempt.id} attempt={selectedAttempt} onClose={() => setSelectedAttempt(null)} onMarked={() => { if (selectedExam) void fetchAttempts(selectedExam.id); }} />
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-12 text-slate-400">
              Select an exam from the list to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
