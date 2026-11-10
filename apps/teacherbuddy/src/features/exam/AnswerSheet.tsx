import React, { useState } from "react";
import { 
  CheckCircle2, XCircle, AlertCircle, 
  ArrowLeft, FileText, User, 
  Calendar, Clock, Award 
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface AnswerSheetProps {
  attempt: any; // ExamAttemptDetailResponse
  onClose: () => void;
  /** Called after marks were saved, so the list behind the sheet can refresh. */
  onMarked?: () => void;
}

type MarkDraft = Record<number, { points: string; feedback: string }>;

const draftFrom = (attempt: any): MarkDraft => {
  const draft: MarkDraft = {};
  for (const answer of attempt?.answers ?? []) {
    draft[answer.question_id] = { points: answer.awarded_points == null ? "" : String(answer.awarded_points), feedback: answer.feedback ?? "" };
  }
  return draft;
};

export const AnswerSheet: React.FC<AnswerSheetProps> = ({ attempt: initialAttempt, onClose, onMarked }) => {
  const [attempt, setAttempt] = useState<any>(initialAttempt);
  const [marks, setMarks] = useState<MarkDraft>(() => draftFrom(initialAttempt));
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState<number | null>(null);
  const [markError, setMarkError] = useState("");
  const [saved, setSaved] = useState("");
  if (!attempt) return null;

  const questions: any[] = attempt.exam?.questions ?? [];
  const totalPoints = attempt.total_points ?? questions.reduce((acc: number, q: any) => acc + q.points, 0);
  const earnedPoints = attempt.earned_points ?? 0;
  const waiting = attempt.status === "pending_review";
  const answerFor = (questionId: number) => attempt.answers.find((a: any) => a.question_id === questionId);
  const isWritten = (q: any) => q.question_type === "fill_blank" || q.question_type === "long_answer";
  const marksFor = (q: any): number | null => answerFor(q.id)?.awarded_points ?? null;
  const answered = (q: any) => (isWritten(q) ? (answerFor(q.id)?.text_answer ?? "").trim() !== "" : answerFor(q.id)?.selected_choice_id != null);
  const awaitingMark = (q: any) => isWritten(q) && answered(q) && marksFor(q) === null;
  const isRight = (q: any) => {
    if (isWritten(q)) return (marksFor(q) ?? -1) >= q.points;
    const picked = answerFor(q.id)?.selected_choice_id;
    return picked != null && !!q.choices.find((c: any) => c.id === picked)?.is_correct;
  };
  const canMark = (attempt.status === "pending_review" || attempt.status === "submitted") && questions.some(isWritten);
  const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
  const setMark = (id: number, patch: Partial<{ points: string; feedback: string }>) =>
    setMarks((current) => ({ ...current, [id]: { ...{ points: "", feedback: "" }, ...current[id], ...patch } }));

  const saveMarks = async () => {
    setMarkError("");
    setSaved("");
    const body = questions.filter(isWritten).filter((q: any) => (marks[q.id]?.points ?? "") !== "").map((q: any) => ({
      question_id: q.id, awarded_points: Number(marks[q.id].points), feedback: marks[q.id].feedback,
    }));
    if (body.length === 0) { setMarkError("Enter marks for at least one answer."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${attempt.exam.id}/attempts/${attempt.id}/mark`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ marks: body }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not save the marks.");
      setAttempt(data);
      setMarks(draftFrom(data));
      setSaved(data.status === "submitted" ? `Marked. The score is ${data.score}% and the student has been told.` : "Marks saved. The score appears once every written answer is marked.");
      onMarked?.();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Could not save the marks.");
    } finally {
      setSaving(false);
    }
  };

  const suggest = async (questionId: number) => {
    setMarkError("");
    setSuggesting(questionId);
    try {
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/${attempt.exam.id}/attempts/${attempt.id}/suggest-mark`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ question_id: questionId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "No suggestion could be made.");
      setMark(questionId, { points: String(data.points), feedback: data.feedback ?? "" });
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "No suggestion could be made.");
    } finally {
      setSuggesting(null);
    }
  };
  const correctCount = questions.filter(isRight).length;
  const wrongCount = questions.filter((q: any) => answered(q) && !isRight(q) && !awaitingMark(q)).length;
  const finished = attempt.end_time
    ? new Date(attempt.end_time).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not finished";

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-fade-in">
      {/* Top Header */}
      <header className="h-16 border-b px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <h2 className="font-bold text-slate-800">{attempt.exam?.title}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Answer Sheet Evaluation</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Student</p>
              <p className="text-sm font-bold text-slate-700">{attempt.student_name}</p>
           </div>
           <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
              {attempt.student_name?.charAt(0)}
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto py-8 px-4 md:px-8 space-y-6">
          
          {/* Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <Award size={20} className="text-blue-600 mb-2" />
                {waiting ? <p className="text-lg font-black text-amber-800">Awaiting marking</p> : <p className="text-2xl font-black text-slate-800">{earnedPoints} <span className="text-sm font-normal text-slate-400">/ {totalPoints} ({attempt.score ?? 0}%)</span></p>}
                <p className="text-[10px] font-bold text-slate-400 uppercase">Final Score</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <CheckCircle2 size={20} className="text-green-500 mb-2" />
                <p className="text-2xl font-black text-slate-800">
                  {correctCount}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Correct</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <XCircle size={20} className="text-red-500 mb-2" />
                <p className="text-2xl font-black text-slate-800">
                   {wrongCount}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Wrong</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <Calendar size={20} className="text-slate-400 mb-2" />
                <p className="text-sm font-bold text-slate-800 text-nowrap">
                   {finished}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Date</p>
             </GlassCard>
          </div>

          {/* Question List */}
          <div className="space-y-4">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Detailed Breakdown</h3>
             {questions.map((question: any, idx: number) => {
                const studentAnswer = answerFor(question.id);
                const isCorrect = isRight(question);
                const isUnanswered = !answered(question);

                return (
                  <div key={question.id} className={`p-6 rounded-3xl border-2 transition-all ${
                    isCorrect ? "bg-green-50/30 border-green-100" : awaitingMark(question) ? "bg-amber-50/30 border-amber-200" : isUnanswered ? "bg-slate-50 border-slate-100" : "bg-red-50/30 border-red-100"
                  }`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex gap-3">
                         <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                           {idx + 1}
                         </span>
                         <p className="font-semibold text-slate-800">{question.question_text}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                         {awaitingMark(question) ? (
                           <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider">
                             <AlertCircle size={12} /> Awaiting marking
                           </span>
                         ) : isCorrect ? (
                           <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider">
                             <CheckCircle2 size={12} /> Correct
                           </span>
                         ) : isUnanswered ? (
                           <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-400 text-white text-[10px] font-bold uppercase tracking-wider">
                             <AlertCircle size={12} /> Unanswered
                           </span>
                         ) : (
                           <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider">
                             <XCircle size={12} /> Incorrect
                           </span>
                         )}
                         <span className="text-[10px] font-bold text-slate-400">{isWritten(question) && marksFor(question) !== null ? `${marksFor(question)} / ${question.points}` : question.points} pts</span>
                      </div>
                    </div>

                    {isWritten(question) && (
                      <div className="mb-3 space-y-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 whitespace-pre-wrap">
                          <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Answer given</p>
                          {answered(question) ? answerFor(question.id)?.text_answer : <span className="text-slate-400">No answer</span>}
                        </div>
                        {Array.isArray(question.accepted_answers) && question.accepted_answers.length > 0 && (
                          <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                            <p className="mb-1 text-[10px] font-bold uppercase text-green-800">Accepted answers</p>
                            {question.accepted_answers.map((group: string[]) => group.join(" or ")).join("  ·  ")}
                          </div>
                        )}
                        {question.answer_guide && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Marking notes</p>
                            {question.answer_guide}
                          </div>
                        )}
                        {canMark ? (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                                Marks
                                <input
                                  type="number" min={0} max={question.points} step={0.5}
                                  className="w-20 rounded-lg border border-blue-200 bg-white px-2 py-1 text-sm"
                                  value={marks[question.id]?.points ?? ""}
                                  onChange={(e) => setMark(question.id, { points: e.target.value })}
                                />
                                <span className="text-blue-700">out of {question.points}</span>
                              </label>
                              {question.question_type === "long_answer" && answered(question) && (
                                <button type="button" disabled={suggesting === question.id} onClick={() => void suggest(question.id)} className="rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                                  {suggesting === question.id ? "Thinking..." : "Suggest a mark with AI"}
                                </button>
                              )}
                            </div>
                            <textarea
                              className="w-full rounded-xl border border-blue-200 bg-white p-2 text-sm"
                              rows={2}
                              placeholder="Feedback for the student (optional)"
                              value={marks[question.id]?.feedback ?? ""}
                              onChange={(e) => setMark(question.id, { feedback: e.target.value })}
                            />
                          </div>
                        ) : answerFor(question.id)?.feedback && (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                            <p className="mb-1 text-[10px] font-bold uppercase text-blue-800">Teacher feedback</p>
                            {answerFor(question.id)?.feedback}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {question.choices.map((choice: any) => {
                         const isSelected = studentAnswer?.selected_choice_id === choice.id;
                         const isChoiceCorrect = choice.is_correct;
                         
                         let stateStyles = "bg-white border-slate-100 text-slate-600";
                         if (isChoiceCorrect) {
                            stateStyles = "bg-green-100 border-green-200 text-green-800 font-bold shadow-sm";
                         } else if (isSelected && !isChoiceCorrect) {
                            stateStyles = "bg-red-100 border-red-200 text-red-800 font-bold";
                         }

                         return (
                           <div key={choice.id} className={`px-4 py-3 rounded-2xl border flex items-center justify-between text-sm transition-all ${stateStyles}`}>
                              <div className="flex items-center gap-3">
                                 <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold">
                                    {isSelected ? (isChoiceCorrect ? "" : "") : ""}
                                 </span>
                                 {choice.choice_text}
                              </div>
                              {isChoiceCorrect && <span className="text-[9px] uppercase font-black opacity-50">Correct Answer</span>}
                              {isSelected && !isChoiceCorrect && <span className="text-[9px] uppercase font-black opacity-50">Your Choice</span>}
                           </div>
                         );
                       })}
                    </div>
                  </div>
                );
             })}
          </div>

          {canMark && (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-blue-200 bg-blue-50 p-4">
              {markError && <p role="alert" className="text-sm font-semibold text-red-700">{markError}</p>}
              {saved && <p className="text-sm font-semibold text-green-700">{saved}</p>}
              <button onClick={() => void saveMarks()} disabled={saving} className="btn btn-primary px-10 py-2.5 font-bold disabled:opacity-50">{saving ? "Saving..." : "Save marks"}</button>
              <p className="text-xs text-blue-800">The score is worked out and the student is told once every written answer has marks.</p>
            </div>
          )}

          <div className="pt-4 pb-12 flex justify-center">
             <button onClick={onClose} className="btn bg-white border-slate-200 text-slate-600 px-12 py-3 rounded-2xl font-bold shadow-sm hover:shadow-md transition-all">
               Close Answer Sheet
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
