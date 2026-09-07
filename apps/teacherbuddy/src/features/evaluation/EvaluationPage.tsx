import React, { useState } from "react";
import { CheckSquare, AlertTriangle, CheckCircle2, ChevronRight, Filter } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { motion } from "framer-motion";

interface Evaluation {
  student: string;
  regNo: string;
  subj: string;
  score: number;
  plagiarism?: number;
  snippet: string;
}

export const EvaluationPage: React.FC = () => {
  const [selected] = useState<Evaluation | null>(null);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Bulk Evaluation Desk</h1>
          <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>Review AI-generated scores, check plagiarism, and finalize grades.</p>
        </div>
        <button className="btn btn-primary shadow-lg flex items-center gap-2">
          <CheckSquare size={16} /> Approve All Pending
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between mb-2">
             <h3 className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>Submissions Queue</h3>
             <button className="p-1 rounded hover:bg-black/5"><Filter size={16} style={{ color: "var(--color-text-muted)" }}/></button>
          </div>
          
          <GlassCard className="p-8 text-center"><CheckSquare className="mx-auto mb-3" style={{ color: "var(--color-text-muted)" }} /><p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>No submissions are waiting for evaluation.</p><p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Submissions will appear here after students upload assignment work.</p></GlassCard>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-2">
          {selected ? (
            <GlassCard className="h-full flex flex-col overflow-hidden">
               <div className="p-6 border-b" style={{ borderColor: "var(--color-border)" }}>
                 <div className="flex justify-between items-start">
                   <div>
                     <h2 className="text-xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>{selected.student}</h2>
                     <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{selected.regNo} &bull; {selected.subj}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Suggested AI Score</p>
                      <input 
                        type="number" 
                        defaultValue={selected.score} 
                        className="w-20 text-center font-bold text-xl py-1 rounded-lg border focus:ring-2 outline-none"
                        style={{ color: "var(--color-brand-blue)", borderColor: "var(--color-border)" }}
                      />
                   </div>
                 </div>
               </div>

               <div className="p-6 flex-1 overflow-y-auto space-y-6">
                 {/* Plagiarism Alert */}
                 {selected.plagiarism && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl flex items-start gap-4 bg-red-50 border border-red-100">
                     <AlertTriangle className="text-red-500 mt-0.5 shrink-0" />
                     <div>
                       <h4 className="font-bold text-red-800 text-sm">Plagiarism Detected ({selected.plagiarism}%)</h4>
                       <p className="text-red-600 text-xs mt-1">Text sequence heavily matches Wikipedia article: "Merge Sort Algorithm History".</p>
                     </div>
                   </motion.div>
                 )}

                 <div>
                   <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Student Answer</h4>
                   <div className="p-4 rounded-xl text-sm leading-relaxed" style={{ background: "var(--color-surface-base)", color: "var(--color-text-primary)" }}>
                     "{selected.snippet}"
                   </div>
                 </div>

                 <div>
                   <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>AI Evaluation Breakdown</h4>
                   <div className="space-y-3">
                     <div className="flex items-center justify-between text-sm">
                       <span style={{ color: "var(--color-text-secondary)" }}>Semantic Match</span>
                       <span className="font-bold text-green-600">88%</span>
                     </div>
                     <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                       <div className="bg-green-500 h-full" style={{ width: '88%' }}></div>
                     </div>
                     
                     <div className="flex items-center justify-between text-sm mt-3">
                       <span style={{ color: "var(--color-text-secondary)" }}>Keyword Coverage (Rubric)</span>
                       <span className="font-bold text-blue-600">75%</span>
                     </div>
                     <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                       <div className="bg-blue-500 h-full" style={{ width: '75%' }}></div>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="p-6 border-t flex justify-end gap-3" style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--color-border)" }}>
                  <button className="btn text-red-500 bg-red-50 hover:bg-red-100 border-transparent">Request Rewrite</button>
                  <button className="btn btn-primary shadow-md">Confirm Final Score</button>
               </div>
            </GlassCard>
          ) : (
            <div className="h-full flex items-center justify-center p-6 border-2 border-dashed rounded-3xl" style={{ borderColor: 'var(--color-border)' }}>
              <p style={{ color: 'var(--color-text-muted)' }}>Select a submission to review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
