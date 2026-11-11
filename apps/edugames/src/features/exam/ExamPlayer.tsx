import React, { Fragment, useState, useEffect, useRef } from "react";
import { 
  Timer, ChevronRight, ChevronLeft, CheckCircle2, 
  AlertTriangle, ArrowRight, Home, ShieldAlert, Maximize, Lock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { AnswerSheet } from "./AnswerSheet";
import { useRules, type ExamEvent, type PublicRules } from "../../shared/university";

import { API_BASE_URL } from "../../shared/utils/apiConfig";
interface Choice {
  id: number;
  choice_text: string;
  is_correct?: boolean;
}

interface Question {
  id: number;
  question_text: string;
  question_type: string;
  points: number;
  order: number;
  word_limit?: number | null;
  choices: Choice[];
}

const BLANK = /_{3,}\d*/;
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const hasText = (value: string | undefined) => (value ?? "").split("\n").some((part) => part.trim() !== "");

interface Exam {
  id: number;
  title: string;
  description?: string;
  time_limit: number;
  randomize_questions: boolean;
  questions: Question[];
  question_count?: number;
}

// What the student sees when the server ends their attempt, keyed by the event the player detected.
const VIOLATION_TEXT: Record<string, string> = {
  tab_hidden: "You switched to another tab or opened a new tab or window.",
  window_blur: "You left the exam window (switched window or desktop).",
  fullscreen_exit: "You exited full-screen mode.",
  page_unload: "You closed or refreshed the exam page.",
};

interface ExamPlayerProps {
  exam: Exam;
  onComplete: (results: any) => void;
  onClose: () => void;
}



// How the rules describe each way of leaving the exam.
const EVENT_WORDS: Record<ExamEvent, string> = {
  tab_hidden: "switching tabs or opening a new tab or window",
  window_blur: "switching windows or desktops",
  fullscreen_exit: "pressing Esc to leave full screen",
  page_unload: "refreshing or closing the page",
};
const joinWords = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The rules shown before the exam, written from the university's settings. */
function examRuleLines(rules: PublicRules["exam"]): string[] {
  if (rules.rules_text.trim()) return rules.rules_text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const events = Object.keys(EVENT_WORDS) as ExamEvent[];
  const ends = events.filter((e) => rules.events[e] === "end").map((e) => EVENT_WORDS[e]);
  const warns = events.filter((e) => rules.events[e] === "warn").map((e) => EVENT_WORDS[e]);
  const lines = ["The exam runs in full screen and cannot be paused."];
  if (ends.length) lines.push(`${capital(joinWords(ends))} ends the exam immediately.`);
  if (warns.length) lines.push(`${capital(joinWords(warns))} gives you a warning. After ${rules.warnings_allowed} warning${rules.warnings_allowed === 1 ? "" : "s"}, the next one ends the exam.`);
  if (ends.length || warns.length) lines.push("An ended attempt is recorded as cheating: failed, score 0, and you cannot retake the exam.");
  lines.push("Close other programs and silence notifications first, so nothing steals focus.");
  lines.push(`If something goes wrong on your computer, such as a power cut or a crash, tell your ${rules.reset_by === "admins" ? "administration" : "teacher"}. They can reset your attempt.`);
  return lines;
}

export const ExamPlayer: React.FC<ExamPlayerProps> = ({ exam, onComplete, onClose }) => {
  const navigate = useNavigate();
  const examRules = useRules().exam;
  const examRulesRef = useRef(examRules);
  examRulesRef.current = examRules;
  // A warning the university's rules give instead of ending the attempt.
  const [warning, setWarning] = useState<{ kind: string; count: number } | null>(null);
  // The student's own paper arrives when the attempt starts (drawn from the exam's pool, in their order).
  // Until then only the number of questions is known, so the intro is shown and the paper is empty.
  const [paper, setPaper] = useState<Question[]>(exam.questions ?? []);
  const displayQuestions = paper;
  const questionTotal = displayQuestions.length || exam.question_count || 0;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  // Fill in the blanks (one line per blank) and long answers, by question id.
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [fullSubmissionDetail, setFullSubmissionDetail] = useState<any>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  // intro: rules and the Start button; running: the exam; flagged: the attempt was ended for leaving the exam.
  const [phase, setPhase] = useState<"intro" | "running" | "flagged">("intro");
  const [starting, setStarting] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The timer callback outlives any one render, so it reads the latest values through refs.
  const answersRef = useRef(answers);
  const textsRef = useRef(texts);
  const attemptIdRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const submittingRef = useRef(false);
  // Monitoring is armed shortly after the exam begins so entering full screen itself is not counted.
  const armedRef = useRef(false);
  answersRef.current = answers;
  textsRef.current = texts;
  useEffect(() => {
    if (!attemptId || doneRef.current) return;
    try {
      localStorage.setItem(`exam-draft-${attemptId}`, JSON.stringify({ choices: answers, texts }));
    } catch {
      /* storage unavailable: answers stay in memory only */
    }
  }, [answers, texts, attemptId]);

  const answeredCount = () => displayQuestions.filter((q) => (q.question_type === "mcq" || !q.question_type ? answersRef.current[q.id] !== undefined : hasText(textsRef.current[q.id]))).length;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fullscreenElement = () => document.fullscreenElement || (document as any).webkitFullscreenElement;
  const canFullscreen = !!(document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);

  const enterFullscreen = async () => {
    const el: any = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request) throw new Error("unsupported");
    await request.call(el);
  };

  const leaveFullscreen = () => {
    try {
      if (fullscreenElement()) void ((document as any).exitFullscreen || (document as any).webkitExitFullscreen)?.call(document);
    } catch {
      /* already out of full screen */
    }
  };

  // Tell the server the student left. It ends the attempt (flagged, score 0) and blocks any retake.
  const sendViolation = async (attempt: number, kind: string) => {
    const token = localStorage.getItem("token");
    for (let i = 0; i < 3; i++) {
      try {
        // keepalive lets the request finish even while the page is being closed or refreshed.
        const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/attempts/${attempt}/violation`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ type: kind }),
        });
        if (response.ok) return await response.json().catch(() => null);
      } catch {
        /* retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const endAsFlagged = (kind: string, reason?: string) => {
    doneRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    try { localStorage.removeItem(`exam-draft-${attemptIdRef.current}`); } catch { /* ignore */ }
    setWarning(null);
    setFlagReason(reason || VIOLATION_TEXT[kind] || "You left the exam.");
    setPhase("flagged");
    leaveFullscreen();
  };

  const reportViolation = (kind: string) => {
    if (!armedRef.current || doneRef.current) return;
    const action = examRulesRef.current.events[kind as ExamEvent] ?? "end";
    if (action === "ignore") return; // the university does not count this
    armedRef.current = false;
    const attempt = attemptIdRef.current;
    if (action === "warn") {
      // The server counts the warnings and decides when they have run out.
      if (attempt) void sendViolation(attempt, kind).then((data) => {
        if (data?.status === "flagged") endAsFlagged(kind, data.flag_reason);
        else setWarning({ kind, count: data?.warnings ?? 1 });
      });
      return;
    }
    endAsFlagged(kind);
    if (attempt) void sendViolation(attempt, kind);
  };

  const resumeAfterWarning = async () => {
    if (!fullscreenElement()) {
      try { await enterFullscreen(); } catch { /* the student can still continue; leaving again counts */ }
    }
    setWarning(null);
    setTimeout(() => { if (!doneRef.current) armedRef.current = true; }, 1500);
  };

  // Watch for anything that means the student left the exam.
  useEffect(() => {
    if (phase !== "running") return;
    const armTimer = setTimeout(() => { armedRef.current = true; }, 1500);
    const onVisibility = () => { if (document.hidden) reportViolation("tab_hidden"); };
    const onBlur = () => {
      // A short grace avoids reacting to a focus change that corrects itself straight away.
      setTimeout(() => {
        if (!document.hasFocus()) reportViolation(document.hidden ? "tab_hidden" : "window_blur");
      }, 150);
    };
    const onFullscreen = () => { if (!fullscreenElement()) reportViolation("fullscreen_exit"); };
    const onPageHide = () => reportViolation("page_unload");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearTimeout(armTimer);
      armedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase]);

  // The Start button: full screen needs a click, so the attempt only begins once it is granted.
  const beginExam = async () => {
    setStarting(true);
    setError(null);
    try {
      await enterFullscreen();
    } catch {
      setError("Full screen was blocked. Allow full screen for this site, then press Start again.");
      setStarting(false);
      return;
    }
    const started = await startAttempt();
    setStarting(false);
    if (started) setPhase("running");
    else leaveFullscreen();
  };

  const startClock = (remainingSeconds: number) => {
    // Count down against the clock rather than ticking once a second, so a throttled tab stays accurate.
    const deadline = Date.now() + remainingSeconds * 1000;
    if (timerRef.current) clearInterval(timerRef.current);
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        void submitExam("time_up");
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const startAttempt = async (): Promise<boolean> => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("You are not logged in. Please log in to take the exam.");
      }
      const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/attempts/start`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to start attempt");
      }
      const data = await response.json();
      if (Array.isArray(data.paper) && data.paper.length > 0) setPaper(data.paper);
      attemptIdRef.current = data.id;
      setAttemptId(data.id);
      try {
        const saved = localStorage.getItem(`exam-draft-${data.id}`);
        if (saved) {
          const draft = JSON.parse(saved);
          // Drafts saved before written questions existed are a plain map of choices.
          if (draft && typeof draft === "object" && "choices" in draft) {
            setAnswers(draft.choices ?? {});
            setTexts(draft.texts ?? {});
          } else {
            setAnswers(draft);
          }
        }
      } catch {
        /* a missing or unreadable draft just means starting blank */
      }
      // The server owns the clock: resuming after a refresh continues from the time that is really left.
      startClock(data.remaining_seconds ?? exam.time_limit * 60);
      return true;
    } catch (err: any) {
      console.error("Failed to start attempt", err);
      setError(err.message || "Connection error. Please check your internet.");
      return false;
    }
  };

  const submitExam = async (status: "submitted" | "time_up" = "submitted", confirmed = false) => {
    if (doneRef.current || submittingRef.current) return;

    if (!attemptIdRef.current) {
      setError("No active session found. Please contact your instructor.");
      return;
    }

    // An in-page prompt, not confirm(): a browser dialog would take focus and count as leaving the exam.
    if (status === "submitted" && !confirmed && displayQuestions.length - answeredCount() > 0) {
      setConfirmFinish(true);
      return;
    }
    setConfirmFinish(false);

    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    const token = localStorage.getItem("token");
    const submissionData = {
      answers: displayQuestions.flatMap((q): Record<string, unknown>[] => {
        if (!q.question_type || q.question_type === "mcq") {
          const choice = answersRef.current[q.id];
          return choice === undefined ? [] : [{ question_id: q.id, selected_choice_id: choice }];
        }
        const text = textsRef.current[q.id];
        return hasText(text) ? [{ question_id: q.id, text_answer: text }] : [];
      }),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/attempts/${attemptIdRef.current}/submit`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(submissionData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Submission failed");
      }
      
      const data = await response.json();
      
      doneRef.current = true;
      try { localStorage.removeItem(`exam-draft-${attemptIdRef.current}`); } catch { /* ignore */ }
      setIsSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      leaveFullscreen();

      // The server's score is already a percentage of the exam's total points.
      // Written answers are marked by the teacher, so there is no score until they have been.
      const waiting = data.status === "pending_review" || data.score === null || data.score === undefined;
      setResults({
        percentage: waiting ? null : Number(data.score).toFixed(1),
        earned: data.earned_points,
        maxPoints: data.total_points,
        status: status,
        awaitingMarking: waiting,
      });
    } catch (err: any) {
      console.error("Submission failed", err);
      setError(err.message || "Failed to submit exam. Please try again.");
      if (status === "time_up") {
        // The server closes an attempt that is past its deadline; stop the clock instead of retrying forever.
        doneRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const fetchFullReview = async () => {
    if (!attemptId) return;
    try {
      setIsLoadingReview(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/attempts/${attemptId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Could not load your answers.");
      const data = await response.json();
      setFullSubmissionDetail(data);
      setShowReview(true);
    } catch (err: any) {
      setError(err.message || "Could not load your answers.");
    } finally {
      setIsLoadingReview(false);
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds == null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!exam || (displayQuestions.length === 0 && !(phase === "intro" && questionTotal > 0))) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full text-center p-8 space-y-4">
          <AlertTriangle className="mx-auto text-orange-500" size={48} />
          <h2 className="text-xl font-bold">No Questions Found</h2>
          <p className="text-slate-500">This exam doesn't seem to have any questions. Please contact your instructor.</p>
          <button onClick={onClose} className="btn btn-outline w-full">Go Back</button>
        </GlassCard>
      </div>
    );
  }

  const currentQuestion = displayQuestions[currentIdx];
  const progress = ((currentIdx + 1) / displayQuestions.length) * 100;
  const timerColor = timeLeft != null && timeLeft < 300 ? "text-red-500 animate-pulse" : "text-blue-600";

  if (phase === "flagged") {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center p-4 animate-fade-in">
        <GlassCard className="max-w-md w-full text-center p-10 space-y-6 shadow-2xl">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-red-700">Exam ended: flagged for cheating</h2>
            <p className="text-slate-600 mt-3">{flagReason}</p>
            <p className="text-slate-500 mt-3 text-sm">
              Leaving the exam is not allowed. This attempt is recorded as failed with a score of 0, your instructor can see why, and you cannot take this exam again.
            </p>
          </div>
          <button onClick={() => onComplete({ flagged: true })} className="btn btn-primary w-full py-3 flex items-center justify-center gap-2">
            <Home size={18} /> Exit
          </button>
        </GlassCard>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
        <GlassCard className="max-w-lg w-full p-8 space-y-5 shadow-2xl">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Maximize size={30} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{exam.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{questionTotal} questions · {exam.time_limit} minutes</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-bold flex items-center gap-2"><ShieldAlert size={16} /> Strict exam rules</p>
            <ul className="list-disc pl-5 space-y-1">
              {examRuleLines(examRules).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>

          {!canFullscreen && (
            <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 font-semibold">
              This browser or device cannot run exams in full screen. Use a laptop or desktop with Chrome, Edge, Firefox or Safari.
            </p>
          )}
          {error && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 font-semibold">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} disabled={starting} className="btn btn-outline flex-1 py-3 disabled:opacity-50">Back</button>
            <button
              onClick={() => void beginExam()}
              disabled={starting || !canFullscreen}
              className="btn btn-primary flex-1 py-3 font-bold disabled:opacity-50"
            >
              {starting ? "Starting..." : "I understand, start the exam"}
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (isSubmitted && results) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center p-4 animate-fade-in">
        <GlassCard className="max-w-md w-full text-center p-10 space-y-6 shadow-2xl">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Exam Completed!</h2>
            <p className="text-slate-500 mt-2">
              {results.status === "time_up" ? "Time ran out, so your answers so far were handed in." : results.awaitingMarking ? "Your answers were handed in." : "Your submission has been evaluated successfully."}
            </p>
          </div>
          
          {results.awaitingMarking ? (
            <div className="py-6 px-4 bg-amber-50 rounded-3xl border border-amber-200">
               <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">Awaiting marking</p>
               <p className="text-sm text-amber-900">Your teacher will mark your written answers. You will get a notification when your score is ready.</p>
            </div>
          ) : (
          <div className="py-6 px-4 bg-blue-50/50 rounded-3xl border border-blue-100/50">
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Final Results</p>
             <div className="flex items-end justify-center gap-1">
                <span className="text-5xl font-black text-blue-600 leading-none">{results.percentage}%</span>
             </div>
             <p className="text-sm font-semibold text-blue-400 mt-2">
               Score: {results.earned} / {results.maxPoints}
             </p>
          </div>
          )}

          <div className="flex gap-3">
             <button onClick={fetchFullReview} disabled={isLoadingReview} className="btn bg-white border-blue-200 text-blue-600 flex-1 py-3 font-bold hover:bg-blue-50">
                {isLoadingReview ? "Loading..." : "Review Answers"}
             </button>
             <button onClick={() => onComplete(results)} className="btn btn-primary flex-1 py-3 flex items-center justify-center gap-2">
               <Home size={18} /> Exit
             </button>
          </div>
        </GlassCard>

        {showReview && fullSubmissionDetail && (
           <AnswerSheet attempt={fullSubmissionDetail} onClose={() => setShowReview(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
      {warning && (
        <div role="alertdialog" aria-modal="true" aria-label="Exam warning" className="absolute inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-center text-slate-800 shadow-2xl">
            <ShieldAlert className="mx-auto text-amber-600" size={40} />
            <h2 className="text-lg font-bold">Warning {warning.count} of {examRules.warnings_allowed}</h2>
            <p className="text-sm text-slate-600">{VIOLATION_TEXT[warning.kind] || "You left the exam."} {warning.count >= examRules.warnings_allowed ? "Next time, the exam ends and is recorded as cheating." : "If it keeps happening, the exam ends and is recorded as cheating."}</p>
            <button onClick={() => void resumeAfterWarning()} className="btn btn-primary w-full py-3 font-bold">Back to the exam</button>
          </div>
        </div>
      )}
      {/* Error Overlay */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <ChevronRight size={20} className="rotate-45" />
              </button>
            </div>
            {(error.includes("log in") || error.includes("credentials")) && (
              <button 
                onClick={() => navigate("/login")}
                className="w-full py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
              >
                Go to Login Page
              </button>
            )}
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="absolute inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4">
          <GlassCard className="max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <AlertTriangle className="mx-auto text-orange-500" size={36} />
            <p className="font-semibold text-slate-800">
              You have {displayQuestions.length - answeredCount()} unanswered question(s). Finish anyway?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmFinish(false)} className="btn btn-outline flex-1 py-2">Keep working</button>
              <button onClick={() => void submitExam("submitted", true)} className="btn btn-primary flex-1 py-2">Finish exam</button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Top Bar */}
      <div className="h-16 border-b px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400" title="Leaving the exam window ends the exam">
             <Lock size={14} /> Full-screen exam
          </div>
                    <div className="h-6 w-px bg-slate-200"></div>
          <h2 className="font-bold text-slate-700 truncate max-w-[200px] md:max-w-md">{exam.title}</h2>
        </div>

        <div className={`flex items-center gap-2 font-mono font-bold text-lg ${timerColor}`}>
          <Timer size={20} />
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        <div className="max-w-3xl mx-auto py-10 px-6 space-y-8">
          {/* Progress */}
          <div className="space-y-2">
             <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Question {currentIdx + 1} of {displayQuestions.length}</span>
                <span>{Math.round(progress)}% Complete</span>
             </div>
             <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-500" 
                  style={{ width: `${progress}%` }}
                ></div>
             </div>
          </div>

          {/* Question Card */}
          <GlassCard padding="lg" className="shadow-xl border-0">
             {currentQuestion.question_type !== "fill_blank" && (
               <p className="text-lg font-medium text-slate-800 leading-relaxed mb-8">
                  {currentQuestion.question_text}
               </p>
             )}

             {currentQuestion.question_type === "fill_blank" ? (
               <p className="text-lg font-medium text-slate-800 leading-[2.6]">
                 {currentQuestion.question_text.split(BLANK).map((part, i, parts) => {
                   const values = (texts[currentQuestion.id] ?? "").split("\n");
                   return (
                     <Fragment key={i}>
                       {part}
                       {i < parts.length - 1 && (
                         <input
                           aria-label={`Blank ${i + 1}`}
                           value={values[i] ?? ""}
                           autoComplete="off"
                           onChange={(event) => {
                             const next = Array.from({ length: parts.length - 1 }, (_, k) => values[k] ?? "");
                             next[i] = event.target.value.replace(/\n/g, " ");
                             setTexts((prev) => ({ ...prev, [currentQuestion.id]: next.join("\n") }));
                           }}
                           className="mx-1 w-40 rounded-lg border-2 border-slate-200 bg-white px-3 py-1 text-base focus:border-blue-500 focus:outline-none"
                         />
                       )}
                     </Fragment>
                   );
                 })}
               </p>
             ) : currentQuestion.question_type === "long_answer" ? (
               <div className="space-y-2">
                 <textarea
                   aria-label="Your answer"
                   value={texts[currentQuestion.id] ?? ""}
                   rows={10}
                   onChange={(event) => {
                     const value = event.target.value;
                     const limit = currentQuestion.word_limit;
                     if (limit && wordCount(value) > limit && wordCount(value) > wordCount(texts[currentQuestion.id] ?? "")) return;
                     setTexts((prev) => ({ ...prev, [currentQuestion.id]: value }));
                   }}
                   className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base leading-relaxed focus:border-blue-500 focus:outline-none"
                   placeholder="Type your answer here"
                 />
                 <p className="text-xs text-slate-500">
                   {wordCount(texts[currentQuestion.id] ?? "")} word{wordCount(texts[currentQuestion.id] ?? "") === 1 ? "" : "s"}
                   {currentQuestion.word_limit ? ` of ${currentQuestion.word_limit} allowed` : ""}
                 </p>
               </div>
             ) : (
             <div className="space-y-3">
                {currentQuestion.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: choice.id }))}
                    className={`w-full text-left px-6 py-4 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                      answers[currentQuestion.id] === choice.id
                        ? "border-blue-500 bg-blue-50/50 text-blue-700 shadow-md"
                        : "border-slate-100 hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium">{choice.choice_text}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      answers[currentQuestion.id] === choice.id ? "border-blue-500 bg-blue-500" : "border-slate-300 group-hover:border-blue-300"
                    }`}>
                      {answers[currentQuestion.id] === choice.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                  </button>
                ))}
             </div>
             )}
          </GlassCard>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
             <button 
               onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
               disabled={currentIdx === 0}
               className="btn btn-outline px-6 py-2.5 flex items-center gap-2 disabled:opacity-30"
             >
                <ChevronLeft size={18} /> Previous
             </button>

              {currentIdx === displayQuestions.length - 1 ? (
                <button 
                  onClick={() => submitExam()}
                  disabled={isSubmitting}
                  className="btn btn-primary px-10 py-2.5 flex items-center gap-2 font-bold shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  {isSubmitting ? "Submitting..." : "Finish Exam"}
                </button>
             ) : (
               <button 
                 onClick={() => setCurrentIdx(currentIdx + 1)}
                 className="btn btn-primary px-8 py-2.5 flex items-center gap-2"
               >
                  Next <ChevronRight size={18} />
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
