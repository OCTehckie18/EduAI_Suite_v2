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



import { API_BASE_URL, authHeaders } from "../../shared/utils/apiConfig";
interface Option {
  id?: number;
  option_text: string;
  is_correct: boolean;
  color?: string;
}

const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
const TYPES: { id: string; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "true_false", label: "True / False" },
  { id: "multi", label: "Select all that apply" },
  { id: "typed", label: "Type the answer" },
];
const TYPE_LABEL: Record<string, string> = { mcq: "Multiple choice", true_false: "True / False", multi: "Select all", typed: "Typed answer" };

const blankOptions = (count: number): Option[] =>
  Array.from({ length: count }, (_, i) => ({ option_text: "", is_correct: i === 0, color: COLORS[i] }));

/** The same checks the server makes, so the teacher hears about a problem before saving. */
const questionProblem = (q: Question): string | null => {
  if (!q.question_text.trim()) return "has no question text.";
  const texts = q.options.map((o) => o.option_text.trim());
  const right = q.options.filter((o) => o.is_correct).length;
  if (q.question_type === "typed") return texts.some(Boolean) ? null : "needs at least one accepted answer.";
  if (q.question_type === "true_false") return right === 1 ? null : "needs one correct answer.";
  if (texts.some((t) => !t)) return "has an empty answer. Fill it in or remove it.";
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) return "has two answers that are the same.";
  if (q.question_type === "multi") return right >= 1 ? null : "needs at least one correct answer.";
  return right === 1 ? null : "needs one correct answer.";
};

interface Question {
  id?: number;
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
  const [isPublic, setIsPublic] = useState(false);
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
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (id) {
      fetch(`${API_BASE_URL}/quizzes/${id}`, { headers: authHeaders() })
        .then(res => res.json())
        .then(data => {
          setTitle(data.title);
          setDescription(data.description || "");
          setIsPublic(Boolean(data.is_public));
          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions.map((q: any) => ({
              id: q.id,
              question_text: q.question_text,
              question_type: q.question_type,
              time_limit: q.time_limit,
              points: q.points,
              image_url: q.image_url,
              options: q.options.map((o: any) => ({
                id: o.id,
                option_text: o.option_text,
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

  const changeType = (type: string) => {
    const current = questions[activeQuestionIndex];
    if (current.question_type === type) return;
    const filled = current.options.filter((o) => o.option_text.trim());
    let options: Option[];
    if (type === "true_false") {
      options = [
        { option_text: "True", is_correct: true, color: COLORS[0] },
        { option_text: "False", is_correct: false, color: COLORS[1] },
      ];
    } else if (type === "typed") {
      options = (filled.length ? filled : [current.options[0] ?? blankOptions(1)[0]]).map((o) => ({ ...o, is_correct: true }));
    } else {
      const base = current.question_type === "true_false" || current.question_type === "typed" ? blankOptions(4) : current.options;
      const padded = [...base];
      while (padded.length < 4) padded.push({ option_text: "", is_correct: false, color: COLORS[padded.length] });
      // A single-answer question keeps only its first correct answer.
      let seen = false;
      options = padded.map((o) => {
        const keep = type === "multi" ? o.is_correct : o.is_correct && !seen;
        if (o.is_correct && keep) seen = true;
        return { ...o, is_correct: keep };
      });
      if (!options.some((o) => o.is_correct)) options[0] = { ...options[0], is_correct: true };
    }
    updateQuestion({ question_type: type, options });
  };

  const updateOption = (optIndex: number, updates: Partial<Option>) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[activeQuestionIndex].options];
    newOptions[optIndex] = { ...newOptions[optIndex], ...updates };
    
    // Single-answer questions: choosing one answer un-chooses the rest.
    const single = newQuestions[activeQuestionIndex].question_type !== "multi";
    if (single && updates.is_correct) {
      newOptions.forEach((opt, i) => {
        if (i !== optIndex) opt.is_correct = false;
      });
    }
    
    newQuestions[activeQuestionIndex].options = newOptions;
    setQuestions(newQuestions);
  };

  const handleSave = async (asDraft: boolean = false, startPlaying: boolean = false) => {
    if (!title) {
      setSaveError("Give the quiz a title before saving.");
      return;
    }
    
    if (!asDraft) {
      for (let i = 0; i < questions.length; i++) {
        const problem = questionProblem(questions[i]);
        if (problem) {
          setActiveQuestionIndex(i);
          setSaveError(`Question ${i + 1} ${problem}`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const url = id ? `${API_BASE_URL}/quizzes/${id}` : `${API_BASE_URL}/quizzes/`;
      const method = id ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title,
          description,
          is_draft: asDraft,
          is_public: isPublic,
          questions
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.detail || "Could not save the quiz. Check it and try again.");
        return;
      }
      {
        setSaveError("");
        const data = await res.json();
        const quizId = data.id || id;
        if (startPlaying && quizId) {
          navigate(`/games/quiz/host/${quizId}`);
        } else {
          navigate("/games/quiz");
        }
      }
    } catch (err) {
      setSaveError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeQuestion = questions[activeQuestionIndex];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-100px)] lg:h-[calc(100dvh-100px)] bg-gray-50 -m-4 sm:-m-6">
      {saveError && (
        <p role="alert" className="bg-red-50 border-b border-red-200 px-8 py-3 text-sm font-semibold text-red-700">{saveError}</p>
      )}
      {/* Top Bar */}
      <div className="bg-white border-b px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-2 rounded-lg">
            <MonitorPlay className="text-blue-600" size={24} />
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
        
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="flex items-center gap-2 text-sm font-bold text-gray-600 cursor-pointer select-none"
            title="Public quizzes appear in every teacher's library as a reference"
          >
            <input
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
            />
            {isPublic ? "Public" : "Private"}
          </label>
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
                <span className="text-[9px] font-bold text-gray-400">{q.time_limit}s · {TYPE_LABEL[q.question_type] || "Multiple choice"}</span>
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

            {/* Kind of question */}
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Kind of question">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeType(t.id)}
                  aria-pressed={activeQuestion.question_type === t.id}
                  className={`px-4 py-2 rounded-full text-xs font-black border-2 transition-all ${
                    activeQuestion.question_type === t.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeQuestion.question_type === "typed" ? (
              <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
                <p className="text-sm font-black text-gray-700">Accepted answers</p>
                <p className="text-xs text-gray-500">Players type their answer. Capital letters and extra spaces are ignored. Add every spelling you want to accept.</p>
                {activeQuestion.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Accepted answer ${idx + 1}`}
                      placeholder={`Accepted answer ${idx + 1}`}
                      maxLength={200}
                      className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 font-bold outline-none focus:border-blue-500"
                      value={opt.option_text}
                      onChange={e => updateOption(idx, { option_text: e.target.value, is_correct: true })}
                    />
                    {activeQuestion.options.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove accepted answer ${idx + 1}`}
                        onClick={() => updateQuestion({ options: activeQuestion.options.filter((_, i) => i !== idx) })}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {activeQuestion.options.length < 8 && (
                  <button
                    type="button"
                    onClick={() => updateQuestion({ options: [...activeQuestion.options, { option_text: "", is_correct: true, color: COLORS[0] }] })}
                    className="text-sm font-bold text-blue-600 hover:underline"
                  >
                    + Add another accepted answer
                  </button>
                )}
              </div>
            ) : (
              <>
                {activeQuestion.question_type === "multi" && (
                  <p className="text-center text-xs font-bold text-gray-500">Tick every correct answer. Players must pick exactly those to score.</p>
                )}
                <div className={`grid gap-4 ${activeQuestion.question_type === "true_false" ? "grid-cols-2" : "grid-cols-2"}`}>
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
                        aria-label={`Answer ${idx + 1}`}
                        placeholder={`Answer ${idx + 1}`}
                        readOnly={activeQuestion.question_type === "true_false"}
                        className="flex-1 bg-transparent border-none outline-none text-white font-bold placeholder:text-white/40 px-4"
                        value={opt.option_text}
                        onChange={e => updateOption(idx, { option_text: e.target.value })}
                      />
                      <div className="p-4">
                        <button
                          type="button"
                          aria-label={opt.is_correct ? `Answer ${idx + 1} is correct` : `Mark answer ${idx + 1} correct`}
                          aria-pressed={opt.is_correct}
                          onClick={() => updateOption(idx, { is_correct: activeQuestion.question_type === "multi" ? !opt.is_correct : true })}
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
              </>
            )}
          </div>
        </div>
      </div>
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-fade-in">
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
