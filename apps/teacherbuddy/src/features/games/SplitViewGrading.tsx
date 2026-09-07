// TeacherBuddy - Split View Grading Interface
// Displays presentation preview on the left and grading rubric on the right
import React, { useState, useEffect } from "react";
import {
  Save,
  X,
  MessageSquare,
  Award,
  AlertCircle,
  ArrowLeft,
  Loader2,
  ChevronDown,
  CheckCircle,
  Star,
  BarChart3,
  Eye,
  Sparkles,
  Zap,
  FileText,
  Clock,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

// ─── Types ────────────────────────────────────────────────────
interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  file_name: string;
  file_url: string;
  submitted_at: string;
  is_late: boolean;
  grade?: number;
  teacher_feedback?: string;
  graded_at?: string;
  status: string;
}

interface RubricItem {
  id: string;
  label: string;
  description: string;
  weight: number;
  score: number;
  maxScore: number;
}

// ─── Constants ────────────────────────────────────────────────
const BRAND_BLUE = "#264796";
const BRAND_BLUE_LIGHT = "#3460c4";

const DEFAULT_RUBRIC: RubricItem[] = [
  { id: "content", label: "Content & Accuracy", description: "Depth of research, factual accuracy, and relevance", weight: 25, score: 0, maxScore: 25 },
  { id: "delivery", label: "Delivery & Presentation", description: "Voice clarity, confidence, pacing, and eye contact", weight: 25, score: 0, maxScore: 25 },
  { id: "visuals", label: "Visual Design", description: "Slide aesthetics, layout, readability, and graphics", weight: 20, score: 0, maxScore: 20 },
  { id: "engagement", label: "Audience Engagement", description: "Interaction, questions, and overall engagement", weight: 20, score: 0, maxScore: 20 },
  { id: "time", label: "Time Management", description: "Staying within time limits, pacing across slides", weight: 10, score: 0, maxScore: 10 },
];

const FEEDBACK_TEMPLATES = [
  { mark: "EX", text: "Excellent work! Your research was thorough and well-presented." },
  { mark: "DL", text: "Great delivery — confident and clear communication." },
  { mark: "VD", text: "Beautiful slides with professional visual design." },
  { mark: "TM", text: "Work on pacing — some sections felt rushed." },
  { mark: "AI", text: "Consider adding more audience interaction next time." },
  { mark: "DA", text: "Strong data visualization and supporting evidence." },
  { mark: "RF", text: "Add more citations and references to strengthen arguments." },
  { mark: "VC", text: "Try varying your tone to keep the audience engaged." },
];

// ─── Component ────────────────────────────────────────────────
const SplitViewGrading: React.FC = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rubric, setRubric] = useState<RubricItem[]>(DEFAULT_RUBRIC);
  const [feedback, setFeedback] = useState("");
  const [expandedRubric, setExpandedRubric] = useState<string | null>("content");

  const totalGrade = rubric.reduce((sum, r) => sum + r.score, 0);

  // ─── Fetch Submission ─────────────────────────────────────
  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const res = await fetch(`/api/slido/submissions/${submissionId}`);
        if (res.ok) {
          const data = await res.json();
          setSubmission(data);
          if (data.grade != null) {
            // Pre-fill rubric proportionally from existing grade
            const ratio = data.grade / 100;
            setRubric(DEFAULT_RUBRIC.map(r => ({ ...r, score: Math.round(r.maxScore * ratio) })));
          }
          if (data.teacher_feedback) {
            setFeedback(data.teacher_feedback);
          }
        }
      } catch (err) {
        console.error("Failed to fetch submission:", err);
      } finally {
        setLoading(false);
      }
    };
    if (submissionId) fetchSubmission();
  }, [submissionId]);

  // ─── Update rubric score ──────────────────────────────────
  const updateRubricScore = (id: string, score: number) => {
    setRubric(prev => prev.map(r => r.id === id ? { ...r, score: Math.min(Math.max(0, score), r.maxScore) } : r));
  };

  // ─── Submit Grade ─────────────────────────────────────────
  const handleSubmitGrade = async () => {
    if (!user?.id) {
      setError("User not authenticated");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/slido/submissions/${submissionId}/grade?teacher_id=${user.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grade: totalGrade,
            teacher_feedback: feedback,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to save grade");

      setSuccess(true);
      setTimeout(() => navigate(-1), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save grade");
    } finally {
      setSaving(false);
    }
  };

  // ─── Grade color ──────────────────────────────────────────
  const gradeColor = (score: number) => {
    if (score >= 90) return "#16a34a";
    if (score >= 80) return "#2563eb";
    if (score >= 70) return "#d97706";
    if (score >= 60) return "#ea580c";
    return "#dc2626";
  };

  const gradeLabel = (score: number) => {
    if (score >= 90) return "Outstanding";
    if (score >= 80) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 60) return "Satisfactory";
    if (score >= 50) return "Needs Improvement";
    return "Below Expectations";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: BRAND_BLUE }} />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Grading Interface...</p>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-lg font-bold text-slate-600">Submission not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 hover:underline font-medium">
          ← Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50" style={{ margin: "-1.5rem" }}>
      {/* ─── Header Bar ──────────────────────────────────────── */}
      <div
        className="px-6 py-3 flex items-center justify-between sticky top-0 z-30 border-b"
        style={{
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderColor: "rgba(38,71,150,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="bg-blue-50 p-1.5 rounded-lg">
            <Award className="w-5 h-5" style={{ color: BRAND_BLUE }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Split View Grading</h1>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>
              Live Evaluation Mode
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Grade Display */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg"
              style={{
                background: `linear-gradient(135deg, ${gradeColor(totalGrade)}, ${gradeColor(totalGrade)}dd)`,
                boxShadow: `0 4px 12px ${gradeColor(totalGrade)}40`,
              }}
            >
              {totalGrade}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">/ 100</p>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: gradeColor(totalGrade) }}>
                {gradeLabel(totalGrade)}
              </p>
            </div>
          </div>

          <button
            onClick={handleSubmitGrade}
            disabled={saving || success}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition text-white disabled:opacity-50"
            style={{
              background: success
                ? "linear-gradient(135deg, #16a34a, #22c55e)"
                : `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`,
              boxShadow: success
                ? "0 4px 12px rgba(22, 163, 74, 0.25)"
                : "0 4px 12px rgba(38, 71, 150, 0.25)",
            }}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : success ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-4 h-4" /> Save Grade</>
            )}
          </button>
        </div>
      </div>

      {/* ─── Error Banner ────────────────────────────────────── */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Split View Layout ───────────────────────────────── */}
      <div className="flex h-[calc(100vh-130px)]">
        {/* LEFT: Presentation Preview */}
        <div className="flex-1 bg-slate-900 flex flex-col overflow-hidden">
          {/* Presentation Header */}
          <div className="px-5 py-3 flex items-center justify-between border-b border-slate-700/50 bg-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-1.5 rounded-lg">
                <Eye className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Presentation Preview</p>
                <p className="text-[10px] text-slate-400">Student #{submission.student_id} • {submission.file_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {submission.is_late && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
                  Late Submission
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {new Date(submission.submitted_at).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                })}
              </span>
            </div>
          </div>

          {/* Presentation Iframe */}
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-8">
            {submission.file_url ? (
              <div className="w-full h-full rounded-2xl overflow-hidden bg-white shadow-2xl border-4 border-white/10">
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(submission.file_url)}`}
                  className="w-full h-full border-0"
                  title="Presentation Preview"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            ) : (
              <div className="text-center">
                <FileText className="w-20 h-20 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 font-bold">No preview available</p>
                <p className="text-slate-500 text-sm mt-1">
                  The presentation file hasn't been uploaded to cloud storage yet.
                </p>
                <a
                  href={submission.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" /> Try opening directly
                </a>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Grading Panel */}
        <div className="w-[420px] flex flex-col overflow-hidden bg-white border-l border-slate-200 shadow-xl">
          {/* Panel Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: BRAND_BLUE }} />
              <span className="font-bold text-sm text-slate-700">Evaluation Rubric</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Score each category to calculate the final grade</p>
          </div>

          {/* Rubric List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {rubric.map((item) => {
              const isExpanded = expandedRubric === item.id;
              const percentage = (item.score / item.maxScore) * 100;
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden transition hover:border-blue-200 hover:shadow-md"
                >
                  {/* Rubric Header */}
                  <button
                    onClick={() => setExpandedRubric(isExpanded ? null : item.id)}
                    className="w-full p-3.5 flex items-center gap-3 text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{
                        background: percentage >= 80 ? "rgba(22,163,74,0.1)" : percentage >= 50 ? "rgba(234,179,8,0.1)" : "rgba(220,38,38,0.06)",
                        color: percentage >= 80 ? "#16a34a" : percentage >= 50 ? "#d97706" : "#dc2626",
                      }}
                    >
                      {item.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{item.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              background: percentage >= 80
                                ? "linear-gradient(90deg, #16a34a, #22c55e)"
                                : percentage >= 50
                                  ? "linear-gradient(90deg, #d97706, #eab308)"
                                  : "linear-gradient(90deg, #dc2626, #ef4444)",
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">/{item.maxScore}</span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-3.5 pb-4 border-t border-slate-50">
                      <p className="text-xs text-slate-500 mt-3 mb-3">{item.description}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={item.maxScore}
                          value={item.score}
                          onChange={(e) => updateRubricScore(item.id, parseInt(e.target.value))}
                          className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          style={{
                            accentColor: BRAND_BLUE,
                          }}
                        />
                        <input
                          type="number"
                          min={0}
                          max={item.maxScore}
                          value={item.score}
                          onChange={(e) => updateRubricScore(item.id, parseInt(e.target.value) || 0)}
                          className="w-14 text-center bg-slate-50 border border-slate-200 rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      {/* Quick Score Presets */}
                      <div className="flex gap-1.5 mt-2">
                        {[0, Math.round(item.maxScore * 0.25), Math.round(item.maxScore * 0.5), Math.round(item.maxScore * 0.75), item.maxScore].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => updateRubricScore(item.id, preset)}
                            className="flex-1 py-1 text-[10px] font-bold rounded-lg transition"
                            style={{
                              background: item.score === preset ? `${BRAND_BLUE}15` : "rgba(241,245,249,1)",
                              color: item.score === preset ? BRAND_BLUE : "#94a3b8",
                              border: item.score === preset ? `1.5px solid ${BRAND_BLUE}30` : "1.5px solid transparent",
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Feedback Section */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                <span className="text-sm font-bold text-slate-700">Teacher Feedback</span>
                <span className="text-[10px] text-slate-400 ml-auto">{feedback.length} chars</span>
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write specific, constructive feedback for the student..."
                rows={4}
                disabled={saving || success}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition disabled:opacity-50"
              />

              {/* Quick Feedback Templates */}
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Templates</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {FEEDBACK_TEMPLATES.map((tmpl, i) => (
                    <button
                      key={i}
                      onClick={() => setFeedback((prev) => prev ? prev + "\n" + tmpl.text : tmpl.text)}
                      disabled={saving || success}
                      className="flex items-start gap-1.5 text-left text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-700 rounded-lg p-2 transition disabled:opacity-50 leading-tight"
                    >
                      <span className="text-xs font-semibold flex-shrink-0">{tmpl.mark}</span>
                      <span className="line-clamp-2">{tmpl.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Stats Bar */}
          <div className="p-4 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grade Breakdown</p>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-500">{totalGrade} / 100</span>
              </div>
            </div>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-slate-100">
              {rubric.map((item) => (
                <div
                  key={item.id}
                  className="transition-all duration-500 rounded-full"
                  style={{
                    width: `${item.score}%`,
                    background:
                      item.id === "content" ? "#2563eb"
                        : item.id === "delivery" ? "#7c3aed"
                          : item.id === "visuals" ? "#059669"
                            : item.id === "engagement" ? "#d97706"
                              : "#ec4899",
                  }}
                  title={`${item.label}: ${item.score}/${item.maxScore}`}
                />
              ))}
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {rubric.map((item) => (
                <span
                  key={item.id}
                  className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1"
                  style={{ color: "#94a3b8" }}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{
                      background:
                        item.id === "content" ? "#2563eb"
                          : item.id === "delivery" ? "#7c3aed"
                            : item.id === "visuals" ? "#059669"
                              : item.id === "engagement" ? "#d97706"
                                : "#ec4899",
                    }}
                  />
                  {item.label.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitViewGrading;
