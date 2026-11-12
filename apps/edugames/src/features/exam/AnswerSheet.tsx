import { GradeTag, PrintLetterhead } from "../../shared/university";
import React from "react";
import { 
  CheckCircle2, XCircle, AlertCircle, 
  ArrowLeft, Calendar, Award 
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

interface AnswerSheetProps {
  attempt: any; // ExamAttemptDetailResponse
  onClose: () => void;
}

export const AnswerSheet: React.FC<AnswerSheetProps> = ({ attempt, onClose }) => {
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
  const correctCount = questions.filter(isRight).length;
  const wrongCount = questions.filter((q: any) => answered(q) && !isRight(q) && !awaitingMark(q)).length;
  const finished = attempt.end_time
    ? new Date(attempt.end_time).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not finished";

  return (
    <div className="print-sheet fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-fade-in text-slate-800">
      {/* Top Header */}
      <header className="no-print h-16 border-b px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <h2 className="font-bold text-slate-800">{attempt.exam?.title}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Your Performance Review</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Personal Score</p>
              <p className="text-sm font-bold text-blue-600">{waiting ? "Awaiting marking" : `${earnedPoints} / ${totalPoints}`}</p>
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto py-8 px-4 md:px-8 space-y-6">
          <PrintLetterhead />
          <p className="hidden print:block text-lg font-bold">{attempt.exam?.title} · Answer sheet</p>
          
          {/* Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <Award size={20} className="text-blue-600 mb-2" />
                {waiting ? <p className="text-lg font-black text-amber-800">Awaiting marking</p> : <p className="text-2xl font-black text-slate-800">{earnedPoints} <span className="text-sm font-normal text-slate-400">/ {totalPoints} ({attempt.score ?? 0}%<GradeTag percent={attempt.score ?? 0} />)</span></p>}
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
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Review Your answers</h3>
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
                        {answerFor(question.id)?.feedback && (
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
                              {isSelected && !isChoiceCorrect && <span className="text-[9px] uppercase font-black opacity-50">Your Answer</span>}
                           </div>
                         );
                       })}
                    </div>
                  </div>
                );
             })}
          </div>

          <div className="pt-4 pb-12 flex justify-center">
             <button onClick={() => window.print()} className="no-print btn btn-outline mr-3 px-8 py-3 rounded-2xl font-bold transition-all">Print</button>
             <button onClick={onClose} className="no-print btn btn-primary px-12 py-3 rounded-2xl font-bold shadow-lg transition-all">
               Close & Exit Review
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
