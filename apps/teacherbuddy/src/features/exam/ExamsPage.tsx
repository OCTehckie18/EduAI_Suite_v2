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
  upcoming: { color: "#264796", bg: "rgba(38,71,150,0.1)", label: "Upcoming" },
  ongoing: { color: "#d97706", bg: "rgba(217,119,6,0.1)", label: "Ongoing" },
  completed: { color: "#16a34a", bg: "rgba(22,163,74,0.1)", label: "Completed" },
  published: { color: "#264796", bg: "rgba(38,71,150,0.1)", label: "Live" },
  draft: { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: "Draft" },
};

export const ExamsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();
  const [examsList, setExamsList] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "take" | "review">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [editingExam, setEditingExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [stats, setStats] = useState<any>({ total_exams: 0, submissions_today: 0, avg_completion: "0%", pending_ai_review: 0 });

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
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
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
      if (data.length > 0 && !selectedExam) {
        setSelectedExam(data[0]);
      }
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
        setShowCreator(false);
        setEditingExam(null);
        fetchExams();
        return true;
      }
    } catch (err) {
      console.error("Save failed", err);
    }
    return false;
  };

  const handleDeleteExam = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this exam? This action cannot be undone.")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        setExamsList(prev => prev.filter(e => e.id !== id));
        if (selectedExam?.id === id) setSelectedExam(null);
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleExportStats = () => {
    if (!selectedExam) return;

    // Prepare CSV content
    const headers = ["Student Name", "Email", "Score", "Finished Date", "Status"];
    const rows = attempts.map(a => [
      a.student_name,
      a.student_email,
      a.score,
      a.end_time ? new Date(a.end_time).toLocaleDateString() : "N/A",
      a.status
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedExam.title}_stats.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePublishExam = async () => {
    if (!selectedExam) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${selectedExam.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ ...selectedExam, status: "published" }),
      });
      if (response.ok) {
        const updated = await response.json();
        setExamsList(prev => prev.map(e => e.id === updated.id ? updated : e));
        setSelectedExam(updated);
      }
    } catch (err) {
      console.error("Publish failed", err);
    }
  };

  const handleUnpublishExam = async () => {
    if (!selectedExam) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${selectedExam.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ ...selectedExam, status: "draft" }),
      });
      if (response.ok) {
        const updated = await response.json();
        setExamsList(prev => prev.map(e => e.id === updated.id ? updated : e));
        setSelectedExam(updated);
      }
    } catch (err) {
      console.error("Unpublish failed", err);
    }
  };

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
      if (!response.ok) throw new Error("Failed to fetch attempts");
      const data = await response.json();
      setAttempts(data);
    } catch (err) {
      console.error("Error fetching attempts:", err);
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
      if (!response.ok) throw new Error("Failed to fetch attempt details");
      const data = await response.json();
      setSelectedAttempt(data);
    } catch (err) {
      console.error("Error fetching attempt details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedExam && activeTab === "review") {
      fetchAttempts(selectedExam.id);
    }
  }, [selectedExam, activeTab]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            {getGreeting()}, {authUser?.name || "Professor"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {getFormattedDate()} — Manage and track your examinations.
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
          { label: "Total Exams", value: String(stats.total_exams), icon: ClipboardList, color: "#264796" },
          { label: "Submissions Today", value: String(stats.submissions_today), icon: CheckCircle2, color: "#16a34a" },
          { label: "Avg Completion", value: stats.avg_completion, icon: Users, color: "#7c3aed" },
        ].map(s => (
          <GlassCard key={s.label} padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${s.color}18` }}>
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
                  onClick={() => setSelectedExam(exam)}
                  className={`glass-card p-4 cursor-pointer transition-all hover:shadow-md border-l-4 ${selectedExam?.id === exam.id ? "border-l-[#264796] shadow-lg" : "border-l-transparent"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug" style={{ color: "var(--color-text-primary)" }}>{exam.title}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>Course {exam.course_id}</p>
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
                          Course {selectedExam.course_id}
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
                <div className="flex border-b" style={{ borderColor: "rgba(38,71,150,0.1)" }}>
                  {(["overview", "take", "review"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-5 py-3.5 text-sm font-semibold capitalize transition-colors flex items-center gap-1.5 ${activeTab === tab ? "border-b-2 border-[#264796] text-[#264796]" : "text-slate-400 hover:text-slate-600"
                        }`}>
                      {tab === "take" && <Play size={13} />}
                      {tab === "review" && <Eye size={13} />}
                      {tab}
                    </button>
                  ))}
                </div>

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
                            style={{ background: "rgba(38,71,150,0.05)", border: "1px solid rgba(38,71,150,0.1)" }}>
                            <p className="text-xl font-bold" style={{ color: "var(--color-brand-blue)" }}>{item.value}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{item.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        {selectedExam.status === "draft" ? (
                          <>
                            <button onClick={handlePublishExam} className="btn btn-primary flex-1 text-sm bg-green-600 hover:bg-green-700 border-green-600">
                              <CheckCircle2 size={14} /> Publish Now
                            </button>
                            <button onClick={() => openEditCreator(selectedExam)} className="btn btn-outline flex-1 text-sm">
                              <Settings size={14} /> Edit Exam
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={handleUnpublishExam} className="btn btn-primary flex-1 text-sm bg-orange-600 hover:bg-orange-700 border-orange-600">
                              <X size={14} /> Unpublish
                            </button>
                            <button onClick={handleExportStats} className="btn btn-outline text-sm flex-1">
                              <FileText size={14} /> Export Stats
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Take Exam (Student View) */}
                  {activeTab === "take" && (
                    <div className="space-y-5">
                      <div className="p-10 text-center text-slate-400">
                        Take exam preview not yet implemented for teacher view.
                      </div>
                    </div>
                  )}

                  {/* Review Submissions */}
                  {activeTab === "review" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Users size={16} className="text-blue-600" />
                          Student Submissions ({attempts.length})
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
                                </div>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-center">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5" style={{ fontSize: '9px' }}>Finished</p>
                                  <p className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                                    {attempt.end_time ? new Date(attempt.end_time.endsWith('Z') ? attempt.end_time : attempt.end_time + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : "-"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5" style={{ fontSize: '9px' }}>Score</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-black text-blue-600">{attempt.score || 0}</span>
                                    <span className="text-[10px] font-bold text-slate-400">pts</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => fetchAttemptDetail(selectedExam.id, attempt.id)}
                                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
                                >
                                  {loadingDetail && selectedAttempt?.id === attempt.id ? "..." : "View Sheet"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Answer Sheet Viewer Modal */}
              {selectedAttempt && (
                <AnswerSheet attempt={selectedAttempt} onClose={() => setSelectedAttempt(null)} />
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
