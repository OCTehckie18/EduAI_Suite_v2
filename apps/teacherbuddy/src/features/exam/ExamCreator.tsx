import React, { useState } from "react";
import { 
  X, Plus, Trash2, Upload, FileText, Settings, 
  CheckCircle2, BrainCircuit, ListOrdered, Shuffle,
  HelpCircle, ChevronDown, ChevronUp, Save, AlertCircle,
  Download, Table, Sparkles
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Choice {
  choice_text: string;
  is_correct: boolean;
}

interface Question {
  question_text: string;
  question_type: string;
  points: number;
  choices: Choice[];
}

interface ExamCreatorProps {
  onClose: () => void;
  onSave: (examData: any) => Promise<boolean>;
  initialData?: any;
}



export const ExamCreator: React.FC<ExamCreatorProps> = ({ onClose, onSave, initialData }) => {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [courseId, setCourseId] = useState<number | string>(initialData?.course_id || "");
  const [courses, setCourses] = useState<any[]>([]);
  const [timeLimit, setTimeLimit] = useState(initialData?.time_limit || 60);
  const [attempts, setAttempts] = useState(initialData?.attempts_allowed || 1);
  const [randomize, setRandomize] = useState(initialData?.randomize_questions || false);
  const [questions, setQuestions] = useState<Question[]>(initialData?.questions || []);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [importTab, setImportTab] = useState<"smart" | "excel">("smart");
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");

  React.useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(API_ENDPOINTS.COURSES, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      setCourses(data);
      if (data.length > 0 && !courseId) {
        setCourseId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch courses", err);
    }
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        question_text: "",
        question_type: "mcq",
        points: 1,
        choices: [
          { choice_text: "", is_correct: false },
          { choice_text: "", is_correct: false },
          { choice_text: "", is_correct: false },
          { choice_text: "", is_correct: false },
        ]
      }
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[index].question_text = text;
    setQuestions(newQuestions);
  };

  const addChoice = (qIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].choices.push({ choice_text: "", is_correct: false });
    setQuestions(newQuestions);
  };

  const updateChoice = (qIndex: number, cIndex: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].choices[cIndex].choice_text = text;
    setQuestions(newQuestions);
  };

  const setCorrectChoice = (qIndex: number, cIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].choices.forEach((c, idx) => {
      c.is_correct = (idx === cIndex);
    });
    setQuestions(newQuestions);
  };

  // ── Smart Import: AI-powered single-step extraction ──
  const handleSmartImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setError("");
    setImportSuccess("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/extract`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Import failed (${response.status})`);
      }
      
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        // Ensure all extracted questions have at least 4 choices
        const formatted = data.map(q => ({
            question_text: q.question_text || "",
            question_type: "mcq",
            points: q.points || 1,
            choices: (q.choices || []).length < 4 
              ? [...(q.choices || []), ...Array(Math.max(0, 4 - (q.choices || []).length)).fill(0).map(() => ({ choice_text: "", is_correct: false }))]
              : q.choices
        }));
        setQuestions([...questions, ...formatted]);
        setImportSuccess(` Successfully imported ${formatted.length} questions with AI`);
      } else {
        setError("No questions could be extracted from this document. Try a clearer format or use Excel import.");
      }
    } catch (err: any) {
      console.error("Smart import failed", err);
      setError(err.message || "Failed to extract questions. Please try again.");
    } finally {
      setIsExtracting(false);
      // Reset file input
      e.target.value = "";
    }
  };

  // ── Excel Import: Download template ──
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/template`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to download template");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "exam_questions_template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Template download failed", err);
      setError("Failed to download template. Please try again.");
    }
  };

  // ── Excel Import: Upload filled spreadsheet ──
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);
    setError("");
    setImportSuccess("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.EXAMS}/import-excel`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Import failed (${response.status})`);
      }

      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        // Format imported questions to match internal structure
        const formatted = data.questions.map((q: any) => ({
          question_text: q.question_text || "",
          question_type: "mcq",
          points: q.points || 1,
          choices: (q.choices || []).length < 4
            ? [...(q.choices || []), ...Array(Math.max(0, 4 - (q.choices || []).length)).fill(0).map(() => ({ choice_text: "", is_correct: false }))]
            : q.choices
        }));
        setQuestions([...questions, ...formatted]);
        
        let msg = ` Successfully imported ${data.imported_count} questions`;
        if (data.errors && data.errors.length > 0) {
          msg += ` (${data.errors.length} row(s) skipped)`;
        }
        setImportSuccess(msg);
      } else {
        setError("No valid questions found in the spreadsheet.");
      }
    } catch (err: any) {
      console.error("Excel import failed", err);
      setError(err.message || "Failed to import from spreadsheet.");
    } finally {
      setIsImportingExcel(false);
      e.target.value = "";
    }
  };

  const handleSubmit = (status: "draft" | "published") => {
    setError("");
    
    if (!title.trim()) {
        setError("Exam title is required.");
        return;
    }

    if (!courseId || isNaN(courseId as any)) {
        setError("Please select a classroom.");
        return;
    }
    
    if (questions.length === 0) {
        setError("Please add at least one question.");
        return;
    }
    
    // Verification: all questions must have a correct answer selected
    const unselectedIndices = questions
      .map((q, i) => q.choices.some(c => c.is_correct) ? -1 : i)
      .filter(i => i !== -1);
      
    if (unselectedIndices.length > 0) {
        setError(`Please select correct answers for questions: ${unselectedIndices.map(i => i + 1).join(", ")}`);
        return;
    }

    const examData = {
      title,
      description,
      course_id: courseId,
      time_limit: timeLimit,
      attempts_allowed: attempts,
      randomize_questions: randomize,
      status: status,
      questions
    };
    
    setIsSaving(true);
    onSave(examData).then(success => {
        if (!success) {
            setError("Failed to save the exam. Please try again.");
            setIsSaving(false);
        }
        // If success, ExamsPage will close us.
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--color-brand-blue)" }}>
              <BrainCircuit size={22} /> {initialData ? "Edit Online Exam" : "Create New Online Exam"}
            </h2>
            <p className="text-sm text-slate-500">
              {initialData ? "Update the exam settings and questions below." : "Configure exam settings and add questions manually or via upload."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Settings */}
          <div className="space-y-6">
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Settings size={14} /> Exam Configuration
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block text-slate-600">Exam Title <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    className={`form-input text-sm ${!title && error.includes("title") ? "border-red-500" : ""}`} 
                    placeholder="e.g. Mid-Term Assessment"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold mb-1 block text-slate-600">Assign to Class <span className="text-red-500">*</span></label>
                  <select 
                    className="form-input text-sm bg-white"
                    value={courseId}
                    onChange={(e) => setCourseId(parseInt(e.target.value))}
                  >
                    {courses.length === 0 && <option value="">Loading classes...</option>}
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block text-slate-600">Time Limit (Minutes)</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      className="form-input text-sm" 
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mins</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-slate-600">Attempts</label>
                    <input 
                      type="number" 
                      className="form-input text-sm" 
                      value={attempts}
                      onChange={(e) => setAttempts(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500"
                        checked={randomize}
                        onChange={(e) => setRandomize(e.target.checked)}
                      />
                      <span className="text-xs font-semibold text-slate-600">Randomize</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Import Section with Tabs ── */}
            <section className="rounded-2xl bg-blue-50 border border-blue-100 overflow-hidden">
              {/* Tab Switcher */}
              <div className="flex border-b border-blue-100">
                <button
                  onClick={() => setImportTab("smart")}
                  className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                    importTab === "smart" 
                      ? "bg-white text-blue-700 border-b-2 border-blue-600 shadow-sm" 
                      : "text-blue-400 hover:text-blue-600 hover:bg-blue-50/50"
                  }`}
                >
                  <Sparkles size={12} /> Smart Import
                </button>
                <button
                  onClick={() => setImportTab("excel")}
                  className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                    importTab === "excel" 
                      ? "bg-white text-blue-700 border-b-2 border-blue-600 shadow-sm" 
                      : "text-blue-400 hover:text-blue-600 hover:bg-blue-50/50"
                  }`}
                >
                  <Table size={12} /> Excel Import
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* ── Smart Import Tab ── */}
                {importTab === "smart" && (
                  <>
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-100/50 border border-blue-200/50">
                      <Sparkles size={14} className="text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-blue-700 leading-relaxed">
                        Upload a <strong>PDF or DOCX</strong> question paper. AI will automatically extract questions, options, and correct answers.
                      </p>
                    </div>
                    <label className={`btn w-full text-xs py-2.5 cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-all ${
                      isExtracting 
                        ? "bg-blue-100 text-blue-600 border-blue-200" 
                        : "btn-primary"
                    }`}>
                      {isExtracting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin"></div>
                          AI is analyzing...
                        </>
                      ) : (
                        <>
                          <FileText size={13} /> Upload Question Paper
                        </>
                      )}
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".pdf,.docx" 
                        onChange={handleSmartImport} 
                        disabled={isExtracting} 
                      />
                    </label>
                  </>
                )}

                {/* ── Excel Import Tab ── */}
                {importTab === "excel" && (
                  <>
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-100/50 border border-blue-200/50">
                      <Table size={14} className="text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-blue-700 leading-relaxed">
                        Download the template, fill in your questions (Kahoot-style), then re-upload. Correct answers are pre-marked.
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-blue-600/70 mb-1.5 font-bold uppercase tracking-tight">Step 1: Download Template</p>
                      <button 
                        onClick={handleDownloadTemplate}
                        className="btn border-2 border-blue-200 text-blue-700 bg-white hover:bg-blue-50 w-full text-xs py-2 flex items-center justify-center gap-2 shadow-sm transition-all"
                      >
                        <Download size={13} /> Download .xlsx Template
                      </button>
                    </div>

                    <div>
                      <p className="text-[10px] text-blue-600/70 mb-1.5 font-bold uppercase tracking-tight">Step 2: Upload Filled Sheet</p>
                      <label className={`btn w-full text-xs py-2 cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-all ${
                        isImportingExcel 
                          ? "bg-blue-100 text-blue-600 border-blue-200" 
                          : "btn-primary"
                      }`}>
                        {isImportingExcel ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin"></div>
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload size={13} /> Upload Filled Spreadsheet
                          </>
                        )}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept=".xlsx,.xls" 
                          onChange={handleExcelUpload} 
                          disabled={isImportingExcel} 
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Questions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Questions ({questions.length})
              </h3>
              <button 
                onClick={addQuestion}
                className="btn btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Question
              </button>
            </div>

            {/* Success Message */}
            {importSuccess && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-100 flex items-center gap-2 text-green-600 text-xs animate-fade-in">
                <CheckCircle2 size={14} />
                <span>{importSuccess}</span>
                <button onClick={() => setImportSuccess("")} className="ml-auto text-green-400 hover:text-green-600">
                  <X size={12} />
                </button>
              </div>
            )}

            {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2 text-red-600 text-xs animate-shake">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}

            {questions.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 bg-slate-50/50">
                <HelpCircle size={40} strokeWidth={1} className="mb-2" />
                <p className="text-sm">No questions added yet.</p>
                <p className="text-xs">Start by adding one manually or uploading a file.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((q, qi) => (
                  <GlassCard key={qi} padding="md" className="border border-slate-200/50 relative group">
                    <button 
                      onClick={() => removeQuestion(qi)}
                      className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                    
                    <div className="flex gap-4">
                      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                        {qi + 1}
                      </span>
                      <div className="flex-1 space-y-4">
                        <textarea 
                          className="form-input text-sm w-full min-h-[80px] bg-transparent border-0 border-b rounded-none focus:ring-0 p-0"
                          placeholder="Type your question here..."
                          value={q.question_text}
                          onChange={(e) => updateQuestionText(qi, e.target.value)}
                        />
                        
                        <div className="space-y-2">
                          {q.choices.map((choice, ci) => (
                            <div key={ci} className="flex items-center gap-3">
                              <button 
                                onClick={() => setCorrectChoice(qi, ci)}
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                  choice.is_correct ? "bg-green-500 text-white" : "bg-slate-100 text-slate-300 hover:bg-slate-200"
                                }`}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <input 
                                type="text"
                                className={`flex-1 text-xs py-2 px-3 rounded-xl border transition-all ${
                                  choice.is_correct ? "bg-green-50/50 border-green-200 text-green-700 shadow-sm font-semibold" : "bg-slate-50 border-transparent focus:bg-white focus:border-blue-300"
                                }`}
                                placeholder={`Option ${String.fromCharCode(65 + ci)}`}
                                value={choice.choice_text}
                                onChange={(e) => updateChoice(qi, ci, e.target.value)}
                              />
                            </div>
                          ))}
                          <button 
                            onClick={() => addChoice(qi)}
                            className="text-[10px] font-bold text-blue-500 mt-1 hover:underline flex items-center gap-1"
                          >
                            <Plus size={10} /> Add Option
                          </button>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="btn btn-outline px-6 py-2">Cancel</button>
          
          <button 
            onClick={() => handleSubmit("draft")}
            className={`btn border-2 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 px-6 py-2 font-bold flex items-center gap-2 transition-all ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
            disabled={isSaving}
          >
            <Save size={18} /> Save as Draft
          </button>

          <button 
            onClick={() => handleSubmit("published")}
            className={`btn btn-primary px-10 py-2 font-bold flex items-center gap-2 shadow-lg hover:shadow-xl active:scale-95 transition-all ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
            disabled={questions.length === 0 || isSaving}
          >
            {isSaving ? (
                <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Saving...
                </>
            ) : (
                <>
                    <CheckCircle2 size={18} /> Save & Publish Exam
                </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
