import React, { useState, useEffect, useRef } from "react";
import { 
  Timer, ChevronRight, ChevronLeft, CheckCircle2, 
  AlertTriangle, ArrowRight, Home
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { AnswerSheet } from "./AnswerSheet";

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
  choices: Choice[];
}

interface Exam {
  id: number;
  title: string;
  description?: string;
  time_limit: number;
  randomize_questions: boolean;
  questions: Question[];
}

interface ExamPlayerProps {
  exam: Exam;
  onComplete: (results: any) => void;
  onClose: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const ExamPlayer: React.FC<ExamPlayerProps> = ({ exam, onComplete, onClose }) => {
  const navigate = useNavigate();
  const [displayQuestions, setDisplayQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(exam.time_limit * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [fullSubmissionDetail, setFullSubmissionDetail] = useState<any>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to shuffle array
  const shuffle = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  useEffect(() => {
    // Randomize questions and choices if needed
    let processedQuestions = [...exam.questions];
    if (exam.randomize_questions) {
      processedQuestions = shuffle(processedQuestions);
    }
    
    // Always randomize choices for better integrity
    processedQuestions = processedQuestions.map(q => ({
      ...q,
      choices: shuffle(q.choices)
    }));

    setDisplayQuestions(processedQuestions);
    startAttempt();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startAttempt = async () => {
    try {
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("You are not logged in. Please log in to take the exam.");
      }
      const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/start`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to start attempt");
      }
      const data = await response.json();
      setAttemptId(data.id);
    } catch (err: any) {
      console.error("Failed to start attempt", err);
      setError(err.message || "Connection error. Please check your internet.");
    }
  };

  const handleAutoSubmit = () => {
    if (!isSubmitted) {
      submitExam("time_up");
    }
  };

  const submitExam = async (status: "submitted" | "time_up" = "submitted") => {
    if (isSubmitted || isSubmitting) return;

    if (!attemptId) {
      alert("No active session found. Please try refreshing the page or contact support.");
      return;
    }

    if (status === "submitted") {
      const unansweredCount = displayQuestions.length - Object.keys(answers).length;
      if (unansweredCount > 0) {
        if (!confirm(`You have ${unansweredCount} unanswered questions. Are you sure you want to finish?`)) {
          return;
        }
      }
    }
    
    setIsSubmitting(true);
    setError(null);
    const token = localStorage.getItem("token");
    const submissionData = {
      answers: Object.entries(answers).map(([qId, cId]) => ({
        question_id: parseInt(qId),
        selected_choice_id: cId
      }))
    };

    try {
      const response = await fetch(`${API_BASE_URL}/exams/${exam.id}/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(submissionData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Submission failed");
      }
      
      const data = await response.json();
      
      setIsSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      
      const maxPoints = displayQuestions.reduce((acc, q) => acc + (q.points || 1.0), 0);
      const percentage = (data.score / maxPoints) * 100;

      setResults({
        score: data.score,
        maxPoints: maxPoints,
        percentage: percentage.toFixed(1),
        status: data.status
      });
    } catch (err: any) {
      console.error("Submission failed", err);
      setError(err.message || "Failed to submit exam. Please try again.");
    } finally {
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
      if (response.ok) {
        const data = await response.json();
        setFullSubmissionDetail(data);
        setShowReview(true);
      }
    } catch (err) {
      console.error("Failed to fetch full review", err);
    } finally {
      setIsLoadingReview(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!exam || !displayQuestions || displayQuestions.length === 0) {
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
  const timerColor = timeLeft < 300 ? "text-red-500 animate-pulse" : "text-blue-600";

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
              {results.status === "time_up" ? "Time ran out, but your answers were saved." : "Your submission has been evaluated successfully."}
            </p>
          </div>
          
          <div className="py-6 px-4 bg-blue-50/50 rounded-3xl border border-blue-100/50">
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Final Results</p>
             <div className="flex items-end justify-center gap-1">
                <span className="text-5xl font-black text-blue-600 leading-none">{results.percentage}%</span>
             </div>
             <p className="text-sm font-semibold text-blue-400 mt-2">
               Score: {results.score} / {results.maxPoints}
             </p>
          </div>

          <div className="flex gap-3">
             <button onClick={fetchFullReview} disabled={isLoadingReview} className="btn bg-white border-blue-200 text-blue-600 flex-1 py-3 font-bold hover:bg-blue-50">
                {isLoadingReview ? "Loading..." : "Review Answers"}
             </button>
             <button onClick={onClose} className="btn btn-primary flex-1 py-3 flex items-center justify-center gap-2">
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

      {/* Top Bar */}
      <div className="h-16 border-b px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
             <Home size={20} />
          </button>
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
             <p className="text-lg font-medium text-slate-800 leading-relaxed mb-8">
                {currentQuestion.question_text}
             </p>

             <div className="space-y-3">
                {currentQuestion.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => setAnswers({...answers, [currentQuestion.id]: choice.id})}
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
