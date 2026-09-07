import React, { useState, useEffect } from "react";
import { Clock, PlayCircle, AlertCircle, FileText } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { ExamPlayer } from "./ExamPlayer";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const StudentExams: React.FC = () => {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState<any>(null);

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
      const response = await fetch(`${API_BASE_URL}/exams/`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setExams(data.filter((e: any) => e.status === "published"));
    } catch (err) {
      console.error("Error fetching exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const startExam = async (examId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/exams/${examId}`);
      const data = await response.json();
      setActiveExam(data);
    } catch (err) {
      console.error("Failed to load exam", err);
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
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>My Exams & Quizzes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Take online exams and view your AI-evaluated results.</p>
      </div>

      {exams.length === 0 ? (
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
            const createdDate = new Date(exam.created_at).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
            });
            
            return (
              <GlassCard key={exam.id} className="p-0 overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
                <div className="p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-500">
                            {exam.course?.code || `COURSE-${exam.course_id}`}
                        </p>
                        <span className="badge badge-blue text-[10px]">Active</span>
                    </div>
                    <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{exam.title}</h2>
                    {exam.course?.name && (
                        <p className="text-xs text-slate-500 mt-1">{exam.course.name}</p>
                    )}
                </div>
                
                <div className="p-5 flex justify-between items-center bg-black/[0.02]">
                    <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <p><Clock className="inline mr-1" size={14}/> Released: {createdDate}</p>
                      <p className="mt-1"><FileText className="inline mr-1" size={14}/> {exam.time_limit} Minutes</p>
                    </div>
                    
                    <div className="text-right">
                      <button 
                        onClick={() => startExam(exam.id)}
                        className="btn btn-primary text-xs px-5 shadow-md flex items-center"
                      >
                        <PlayCircle size={16} className="mr-1"/> Take Exam
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
