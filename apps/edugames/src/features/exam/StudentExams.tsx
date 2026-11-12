import { GradeTag, formatDate, useUniversity } from "../../shared/university";
import React, { useState, useEffect } from "react";
import { Clock, PlayCircle, AlertCircle, FileText } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { ExamPlayer } from "./ExamPlayer";



import { API_BASE_URL } from "../../shared/utils/apiConfig";
export const StudentExams: React.FC = () => {
  const university = useUniversity();
  // Only when the university chose a date format; otherwise the dates look as they always did.
  const customDates = (university.academic?.calendar?.date_format ?? "auto") !== "auto";
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return; // App will show "No Exams Available" or user will be redirected by other logic
      }
      setError("");
      const response = await fetch(`${API_BASE_URL}/exams/`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setExams(data.filter((e: any) => e.status === "published"));
    } catch (err) {
      console.error("Error fetching exams:", err);
      setError("Could not load your exams. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const startExam = async (examId: number) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/exams/${examId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Failed to load exam");
      setError("");
      setActiveExam(data);
    } catch (err: any) {
      console.error("Failed to load exam", err);
      setError(err.message || "Failed to load the exam.");
    }
  };

  if (activeExam) {
     return (
       <ExamPlayer 
         exam={activeExam} 
         onClose={() => setActiveExam(null)} 
         onComplete={() => {
            setActiveExam(null);
            fetchExams(); // Refresh to show completed status if implemented
         }} 
       />
     );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>My Exams & Quizzes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Take your online exams and see your marks.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => void fetchExams()} className="underline text-xs">Retry</button>
        </div>
      )}

      {exams.length === 0 && !error ? (
        <GlassCard className="p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">No Exams Available</h3>
            <p className="text-slate-500 max-w-sm mx-auto">There are currently no published exams for your courses. Check back later!</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {exams.map(exam => {
            // Basic formatting for UI
            const createdDate = customDates ? formatDate(exam.created_at, university) : new Date(exam.created_at).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
            });
            
            const myAttempts: any[] = exam.attempts || [];
            const finished = myAttempts.filter((a) => a.status !== "in_progress");
            const inProgress = myAttempts.some((a) => a.status === "in_progress");
            const scores = finished.filter((a) => a.status === "submitted" && a.score != null).map((a) => a.score as number);
            const bestScore = scores.length ? Math.max(...scores) : null;
            const flagged = myAttempts.some((a) => a.status === "flagged");
            const awaiting = myAttempts.some((a) => a.status === "pending_review");
            // A teacher cleared this student's attempt: say so until they start again.
            const wasReset = !!exam.my_reset && !myAttempts.some((a) => new Date(a.start_time) > new Date(exam.my_reset.at));
            const outOfAttempts = flagged || (!inProgress && finished.length >= (exam.attempts_allowed ?? 1));
            const notOpen = !inProgress && exam.availability === "upcoming";
            const ended = !inProgress && exam.availability === "ended";
            const fmt = (iso: string) => customDates ? formatDate(iso, university, true) : new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

            return (
              <GlassCard key={exam.id} className="p-0 overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
                <div className="p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-500">
                            {exam.course_code || `COURSE-${exam.course_id}`}
                        </p>
                        <span className="badge badge-blue text-[10px]">{flagged ? "Flagged" : inProgress ? "In progress" : awaiting ? "Awaiting marking" : outOfAttempts ? "Done" : notOpen ? "Not open yet" : ended ? "Closed" : "Open"}</span>
                    </div>
                    <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{exam.title}</h2>
                    {exam.course_name && (
                        <p className="text-xs text-slate-500 mt-1">{exam.course_name}</p>
                    )}
                </div>
                
                <div className="p-5 flex justify-between items-center bg-black/[0.02]">
                    <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <p><Clock className="inline mr-1" size={14}/> Released: {createdDate}</p>
                      <p className="mt-1"><FileText className="inline mr-1" size={14}/> {exam.time_limit} Minutes</p>
                      <p className="mt-1 text-xs">
                        Attempts: {finished.length} of {exam.attempts_allowed ?? 1}
                        {bestScore != null && <> · Best score: <strong>{bestScore}%<GradeTag percent={bestScore} /></strong></>}
                      </p>
                      {wasReset && <p className="mt-1 text-xs font-semibold text-green-700">Your attempt was reset by your teacher. You can start again{exam.my_reset.allowed_until ? ` until ${fmt(exam.my_reset.allowed_until)}` : ""}.</p>}
                      {awaiting && <p className="mt-1 text-xs font-semibold text-amber-800">Submitted, awaiting marking. Your teacher will mark your written answers.</p>}
                      {(exam.opens_at || exam.closes_at) && (
                        <p className="mt-1 text-xs">
                          {exam.opens_at && <>Opens {fmt(exam.opens_at)}</>}
                          {exam.opens_at && exam.closes_at && " · "}
                          {exam.closes_at && <>Closes {fmt(exam.closes_at)}</>}
                        </p>
                      )}
                      {flagged && (
                        <p className="mt-1 text-xs font-semibold text-red-600">
                          Flagged for leaving the exam: recorded as failed (0%). You cannot retake it.
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <button 
                        onClick={() => startExam(exam.id)}
                        disabled={outOfAttempts || notOpen || ended}
                        className="btn btn-primary text-xs px-5 shadow-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <PlayCircle size={16} className="mr-1"/> {flagged ? "Not allowed" : inProgress ? "Resume Exam" : outOfAttempts ? "No attempts left" : notOpen ? "Not open yet" : ended ? "Closed" : "Take Exam"}
                      </button>
                    </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
