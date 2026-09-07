import React, { useState } from "react";
import { 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  Target, 
  Image as ImageIcon, 
  Type, 
  CheckCircle2, 
  ChevronRight,
  MonitorPlay
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Option {
  option_text: string;
  is_correct: boolean;
  color?: string;
}

interface Question {
  question_text: string;
  question_type: string;
  time_limit: number;
  points: number;
  image_url?: string;
  options: Option[];
}

export const QuizCreator: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([
    {
      question_text: "",
      question_type: "mcq",
      time_limit: 20,
      points: 1000,
      options: [
        { option_text: "", is_correct: true, color: "#e21b3c" },
        { option_text: "", is_correct: false, color: "#1368ce" },
        { option_text: "", is_correct: false, color: "#d89e00" },
        { option_text: "", is_correct: false, color: "#26890c" },
      ]
    }
  ]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetch(`${API_BASE_URL}/quizzes/${id}`)
        .then(res => res.json())
        .then(data => {
          setTitle(data.title);
          setDescription(data.description || "");
          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions.map((q: any) => ({
              question_text: q.text,
              question_type: q.type,
              time_limit: q.time_limit,
              points: q.points,
              image_url: q.image_url,
              options: q.options.map((o: any) => ({
                option_text: o.text,
                is_correct: o.is_correct,
                color: o.color
              }))
            })));
          }
        })
        .catch(err => console.error("Failed to fetch quiz:", err));
    }
  }, [id]);

  const addQuestion = () => {
    const newQuestion: Question = {
      question_text: "",
      question_type: "mcq",
      time_limit: 20,
      points: 1000,
      options: [
        { option_text: "", is_correct: true, color: "#e21b3c" },
        { option_text: "", is_correct: false, color: "#1368ce" },
        { option_text: "", is_correct: false, color: "#d89e00" },
        { option_text: "", is_correct: false, color: "#26890c" },
      ]
    };
    setQuestions([...questions, newQuestion]);
    setActiveQuestionIndex(questions.length);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      setQuestions(newQuestions);
      if (activeQuestionIndex >= newQuestions.length) {
        setActiveQuestionIndex(newQuestions.length - 1);
      }
    }
  };

  const updateQuestion = (updates: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[activeQuestionIndex] = { ...newQuestions[activeQuestionIndex], ...updates };
    setQuestions(newQuestions);
  };

  const updateOption = (optIndex: number, updates: Partial<Option>) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[activeQuestionIndex].options];
    newOptions[optIndex] = { ...newOptions[optIndex], ...updates };
    
    // If setting one as correct, unset others (for MCQ)
    if (updates.is_correct) {
      newOptions.forEach((opt, i) => {
        if (i !== optIndex) opt.is_correct = false;
      });
    }
    
    newQuestions[activeQuestionIndex].options = newOptions;
    setQuestions(newQuestions);
  };

  const handleSave = async (asDraft: boolean = false, startPlaying: boolean = false) => {
    if (!title) {
      alert("Please enter a quiz title");
      return;
    }
    
    setSaving(true);
    try {
      const url = id ? `${API_BASE_URL}/quizzes/${id}` : `${API_BASE_URL}/quizzes/`;
      const method = id ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          is_draft: asDraft,
          questions
        })
      });
      if (res.ok) {
        const data = await res.json();
        const quizId = data.id || id;
        if (startPlaying && quizId) {
          navigate(`/games/quiz/host/${quizId}`);
        } else {
          navigate("/games/quiz");
        }
      }
    } catch (err) {
      console.error("Failed to save quiz", err);
    } finally {
      setSaving(false);
    }
  };

  const activeQuestion = questions[activeQuestionIndex];

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] bg-gray-50 -m-6 animate-fade-in">
      {/* Top Bar */}
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-2 rounded-lg">
            <MonitorPlay className="text-purple-600" size={24} />
          </div>
          <div>
            <input 
              type="text" 
              placeholder="Enter quiz title..." 
              className="text-xl font-bold bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-300 w-full"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 font-medium">Kahoot-style Interactive Quiz</p>
              <span className="text-gray-300 text-xs">•</span>
              <button 
                onClick={() => setShowSettings(true)}
                className="text-xs text-blue-600 font-bold hover:text-blue-700 transition-colors"
              >
                {description ? "Edit Description" : "+ Add Description"}
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleSave(false, false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            {saving ? "..." : "Save Game"}
          </button>
          <button 
            onClick={() => handleSave(true, false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
          >
            {saving ? "..." : "Save as Draft"}
          </button>
          <button 
            onClick={() => handleSave(false, true)}
            disabled={saving}
            className="px-6 py-2 bg-brand-blue text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            {saving ? "Saving..." : <><Save size={18} /> Save & Play</>}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Question List */}
        <div className="w-64 bg-white border-r overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {questions.map((q, idx) => (
            <div 
              key={idx}
              onClick={() => setActiveQuestionIndex(idx)}
              className={`group relative p-3 rounded-xl border-2 transition-all cursor-pointer ${
                activeQuestionIndex === idx 
                ? 'border-blue-500 bg-blue-50 shadow-sm' 
                : 'border-transparent hover:border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-gray-400 uppercase">Question {idx + 1}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeQuestion(idx); }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-500 rounded transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-xs font-bold line-clamp-2 min-h-[2.5em] text-gray-700">
                {q.question_text || "Empty question..."}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-100 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                </div>
                <span className="text-[9px] font-bold text-gray-400">{q.time_limit}s</span>
              </div>
            </div>
          ))}
          
          <button 
            onClick={addQuestion}
            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-all"
          >
            <Plus size={20} />
            <span className="text-xs font-bold">Add Question</span>
          </button>
        </div>

        {/* Main Content: Question Editor */}
        <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center">
          <div className="max-w-4xl w-full space-y-8">
            {/* Question Text Area */}
            <div className="relative">
              <textarea 
                rows={2}
                placeholder="Start typing your question..."
                className="w-full text-center text-3xl font-bold p-8 rounded-2xl bg-white border-2 border-transparent focus:border-blue-500 outline-none shadow-xl transition-all placeholder:text-gray-200"
                value={activeQuestion.question_text}
                onChange={e => updateQuestion({ question_text: e.target.value })}
              />
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                 <div className="px-3 py-1 bg-white rounded-full border shadow-sm flex items-center gap-2">
                    <Clock size={14} className="text-gray-400" />
                    <select 
                      className="text-xs font-bold outline-none bg-transparent"
                      value={activeQuestion.time_limit}
                      onChange={e => updateQuestion({ time_limit: parseInt(e.target.value) })}
                    >
                      <option value={10}>10s</option>
                      <option value={20}>20s</option>
                      <option value={30}>30s</option>
                      <option value={60}>1m</option>
                    </select>
                 </div>
                 <div className="px-3 py-1 bg-white rounded-full border shadow-sm flex items-center gap-2">
                    <Target size={14} className="text-gray-400" />
                    <select 
                      className="text-xs font-bold outline-none bg-transparent"
                      value={activeQuestion.points}
                      onChange={e => updateQuestion({ points: parseInt(e.target.value) })}
                    >
                      <option value={0}>No Points</option>
                      <option value={1000}>1000 pts</option>
                      <option value={2000}>2000 pts</option>
                    </select>
                 </div>
              </div>
            </div>

            {/* Media Placeholder */}
            <div className="flex justify-center">
              {activeQuestion.image_url ? (
                <div className="relative group w-80 h-48 bg-white rounded-3xl overflow-hidden shadow-inner border-2 border-transparent hover:border-red-500 transition-all">
                   <img src={activeQuestion.image_url} alt="Media" className="w-full h-full object-cover" />
                   <div 
                     className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-all"
                     onClick={() => updateQuestion({ image_url: "" })}
                   >
                     <Trash2 size={32} className="mb-2" />
                     <span className="font-bold">Remove Media</span>
                   </div>
                </div>
              ) : (
                <div 
                  onClick={() => {
                    const url = window.prompt("Enter Image URL:");
                    if (url) updateQuestion({ image_url: url });
                  }}
                  className="w-80 h-48 bg-white border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 text-gray-300 hover:text-blue-500 hover:border-blue-200 hover:bg-white transition-all cursor-pointer group shadow-inner"
                >
                  <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-all">
                    <ImageIcon size={40} />
                  </div>
                  <span className="text-xs font-bold">Add Media URL</span>
                </div>
              )}
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-2 gap-4">
              {activeQuestion.options.map((opt, idx) => (
                <div 
                  key={idx}
                  className="group relative h-24 rounded-2xl flex items-center shadow-lg overflow-hidden transition-all hover:scale-[1.01]"
                  style={{ backgroundColor: opt.color }}
                >
                  <div className="w-12 h-full flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white/40 rounded-lg flex items-center justify-center">
                       {idx === 0 && <div className="w-3 h-3 bg-white rotate-45" />}
                       {idx === 1 && <div className="w-3 h-3 bg-white rounded-full" />}
                       {idx === 2 && <div className="w-3 h-3 bg-white -rotate-45" />}
                       {idx === 3 && <div className="w-3 h-3 bg-white" />}
                    </div>
                  </div>
                  <input 
                    type="text" 
                    placeholder={`Answer ${idx + 1}`}
                    className="flex-1 bg-transparent border-none outline-none text-white font-bold placeholder:text-white/40 px-4"
                    value={opt.option_text}
                    onChange={e => updateOption(idx, { option_text: e.target.value })}
                  />
                  <div className="p-4">
                    <button 
                      onClick={() => updateOption(idx, { is_correct: !opt.is_correct })}
                      className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center transition-all ${
                        opt.is_correct ? 'bg-white text-green-500 shadow-md scale-110' : 'bg-transparent text-transparent hover:bg-white/10'
                      }`}
                    >
                      <CheckCircle2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in duration-200">
            <h2 className="text-2xl font-black mb-6">Quiz Description</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase text-gray-400">Description</label>
                <textarea 
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter quiz description..."
                />
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full mt-8 py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
