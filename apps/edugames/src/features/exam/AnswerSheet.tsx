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

  const totalPoints = attempt.exam.questions.reduce((acc: number, q: any) => acc + q.points, 0);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-fade-in text-slate-800">
      {/* Top Header */}
      <header className="h-16 border-b px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <h2 className="font-bold text-slate-800">{attempt.exam.title}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Your Performance Review</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Personal Score</p>
              <p className="text-sm font-bold text-blue-600">{attempt.score} / {totalPoints}</p>
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto py-8 px-4 md:px-8 space-y-6">
          
          {/* Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <Award size={20} className="text-blue-600 mb-2" />
                <p className="text-2xl font-black text-slate-800">{attempt.score} <span className="text-sm font-normal text-slate-400">/ {totalPoints}</span></p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Final Score</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <CheckCircle2 size={20} className="text-green-500 mb-2" />
                <p className="text-2xl font-black text-slate-800">
                  {attempt.answers.filter((a: any) => {
                    const q = a.question;
                    const correctChoice = q.choices.find((c: any) => c.is_correct);
                    return a.selected_choice_id === correctChoice?.id;
                  }).length}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Correct</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <XCircle size={20} className="text-red-500 mb-2" />
                <p className="text-2xl font-black text-slate-800">
                   {attempt.answers.filter((a: any) => {
                    const q = a.question;
                    const correctChoice = q.choices.find((c: any) => c.is_correct);
                    return a.selected_choice_id && a.selected_choice_id !== correctChoice?.id;
                  }).length}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Wrong</p>
             </GlassCard>
             <GlassCard className="flex flex-col items-center justify-center p-4 text-center">
                <Calendar size={20} className="text-slate-400 mb-2" />
                <p className="text-sm font-bold text-slate-800 text-nowrap">
                   {new Date(attempt.end_time.endsWith('Z') ? attempt.end_time : attempt.end_time + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Date</p>
             </GlassCard>
          </div>

          {/* Question List */}
          <div className="space-y-4">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Review Your answers</h3>
             {attempt.exam.questions.map((question: any, idx: number) => {
                const studentAnswer = attempt.answers.find((a: any) => a.question_id === question.id);
                const correctChoice = question.choices.find((c: any) => c.is_correct);
                const isCorrect = studentAnswer?.selected_choice_id === correctChoice?.id;
                const isUnanswered = !studentAnswer?.selected_choice_id;

                return (
                  <div key={question.id} className={`p-6 rounded-3xl border-2 transition-all ${
                    isCorrect ? "bg-green-50/30 border-green-100" : isUnanswered ? "bg-slate-50 border-slate-100" : "bg-red-50/30 border-red-100"
                  }`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex gap-3">
                         <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                           {idx + 1}
                         </span>
                         <p className="font-semibold text-slate-800">{question.question_text}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                         {isCorrect ? (
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
                         <span className="text-[10px] font-bold text-slate-400">{question.points} pts</span>
                      </div>
                    </div>

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
             <button onClick={onClose} className="btn btn-primary px-12 py-3 rounded-2xl font-bold shadow-lg transition-all">
               Close & Exit Review
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
