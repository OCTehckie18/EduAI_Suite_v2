import { useModule } from "../../shared/university";
import React, { useState } from "react";
import { 
  X, Plus, Trash2, Upload, FileText, Settings, 
  CheckCircle2, BrainCircuit, ListOrdered, Shuffle,
  HelpCircle, ChevronDown, ChevronUp, Save, AlertCircle,
  Download, Table
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Choice {
  choice_text: string;
  is_correct: boolean;
}

type QuestionType = "mcq" | "fill_blank" | "long_answer";

interface PatternRow { type: string; marks: number; count: number }

interface Question {
  id?: number;
  question_text: string;
  question_type: QuestionType | string;
  points: number;
  choices: Choice[];
  /** Fill in the blanks: one list of accepted answers per blank. */
  accepted_answers?: string[][];
  /** Long answers: marking notes for the teacher; students never see them. */
  answer_guide?: string;
  word_limit?: number | null;
}

const TYPE_LABELS: Record<string, string> = { mcq: "Multiple choice", fill_blank: "Fill in the blanks", long_answer: "Long answer" };
const SHORT_TYPE: Record<string, string> = { mcq: "MCQ", fill_blank: "Fill in the blanks", long_answer: "Long answer" };
const marksText = (n: number) => `${n} mark${n === 1 ? "" : "s"}`;

/** The (type, marks) groups in the pool, with how many questions each holds. */
const poolGroups = (questions: Question[]) => {
  const counts = new Map<string, { type: string; marks: number; in_pool: number }>();
  for (const q of questions) {
    if (Number.isNaN(q.points)) continue;
    const key = `${q.question_type}|${q.points}`;
    const group = counts.get(key) ?? { type: q.question_type, marks: q.points, in_pool: 0 };
    group.in_pool += 1;
    counts.set(key, group);
  }
  const order = ["mcq", "fill_blank", "long_answer"];
  return [...counts.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.marks - b.marks);
};
const BLANKS = /_{3,}\d*/g;
const blankCount = (text: string) => (text.match(BLANKS) ?? []).length;
const emptyChoices = (): Choice[] => Array.from({ length: 4 }, () => ({ choice_text: "", is_correct: false }));

/** A question from the server or an import, in the shape the editor works with. */
const fromServer = (q: any): Question => {
  const type = q.question_type === "fill_blank" || q.question_type === "long_answer" ? q.question_type : "mcq";
  const choices: Choice[] = q.choices || [];
  return {
    question_text: q.question_text || "",
    question_type: type,
    points: q.points || 1,
    choices: type === "mcq" ? (choices.length < 4 ? [...choices, ...emptyChoices().slice(0, 4 - choices.length)] : choices) : [],
    accepted_answers: type === "fill_blank" ? q.accepted_answers || [] : undefined,
    answer_guide: type === "long_answer" ? q.answer_guide || "" : undefined,
    word_limit: type === "long_answer" ? q.word_limit ?? null : undefined,
  };
};

interface ExamCreatorProps {
  onClose: () => void;
  onSave: (examData: any) => Promise<true | string>;
  initialData?: any;
}



// A stored instant as the local "YYYY-MM-DDTHH:mm" a datetime-local input wants.
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ExamCreator: React.FC<ExamCreatorProps> = ({ onClose, onSave, initialData }) => {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [courseId, setCourseId] = useState<number | string>(initialData?.course_id || "");
  const [courses, setCourses] = useState<any[]>([]);
  const [timeLimit, setTimeLimit] = useState(initialData?.time_limit || 60);
  const [attempts, setAttempts] = useState(initialData?.attempts_allowed || 1);
  const [opensAt, setOpensAt] = useState(toLocalInput(initialData?.opens_at));
  const [closesAt, setClosesAt] = useState(toLocalInput(initialData?.closes_at));
  // Each student's paper is shuffled unless the teacher switches it off (older exams keep their setting).
  const [randomize, setRandomize] = useState<boolean>(initialData ? !!initialData.randomize_questions : true);
  const [pattern, setPattern] = useState<PatternRow[]>(initialData?.pattern || []);
  const [questions, setQuestions] = useState<Question[]>(initialData?.questions || []);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const aiTools = useModule("ai_exam_tools");
  const [importTab, setImportTab] = useState<"smart" | "excel">(aiTools ? "smart" : "excel");
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");
  const [importProblems, setImportProblems] = useState<string[]>([]);
  const [coursesState, setCoursesState] = useState<"loading" | "ready" | "failed">("loading");
  // Once a student has attempted the exam its questions are frozen on the server, so they are read-only here.
  const locked = !!initialData?.attempts?.length;

  React.useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(API_ENDPOINTS.COURSES, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to load classes");
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setCourses(list);
      setCoursesState("ready");
      if (list.length > 0 && !courseId) {
        setCourseId(list[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch courses", err);
      setCoursesState("failed");
    }
  };

  const addQuestion = (type: QuestionType = "mcq") => {
    setQuestions([...questions, changeType({ question_text: "", question_type: "mcq", points: 1, choices: emptyChoices() }, type)]);
  };

  /** Switch a question to another type, keeping its text and marks and giving it the fields of the new type. */
  const changeType = (q: Question, type: QuestionType): Question => ({
    ...q,
    question_type: type,
    choices: type === "mcq" ? (q.choices.length ? q.choices : emptyChoices()) : [],
    accepted_answers: type === "fill_blank" ? q.accepted_answers ?? [] : undefined,
    answer_guide: type === "long_answer" ? q.answer_guide ?? "" : undefined,
    word_limit: type === "long_answer" ? q.word_limit ?? null : undefined,
  });

  const updateQuestion = (index: number, patch: Partial<Question>) => {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const setAccepted = (index: number, blank: number, value: string) => {
    const q = questions[index];
    const count = blankCount(q.question_text);
    const next = Array.from({ length: count }, (_, k) => (q.accepted_answers?.[k] ?? []).join(" | "));
    next[blank] = value;
    // The text boxes keep what is typed (including a trailing |); it is split into alternatives when saving.
    updateQuestion(index, { accepted_answers: next.map((text) => (text === "" ? [] : [text])) });
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[index].question_text = text;
    setQuestions(newQuestions);
  };

  const updatePoints = (index: number, points: number) => {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, points } : q)));
  };

  const removeChoice = (qIndex: number, cIndex: number) => {
    setQuestions(questions.map((q, i) => (i === qIndex ? { ...q, choices: q.choices.filter((_, ci) => ci !== cIndex) } : q)));
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
    setImportProblems([]);
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
        const formatted = data.map(fromServer);
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
        const formatted = data.questions.map(fromServer);
        setQuestions([...questions, ...formatted]);
        let msg = ` Successfully imported ${data.imported_count} questions`;
        if (data.errors && data.errors.length > 0) {
          msg += `, ${data.errors.length} row(s) skipped (listed below)`;
        }
        setImportSuccess(msg);
        setImportProblems(data.errors || []);
      } else {
        setError("No valid questions found in the spreadsheet.");
        setImportProblems(data.errors || []);
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
    
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      setError("The exam must close after it opens.");
      return;
    }
    if (Number.isNaN(timeLimit) || timeLimit < 1 || timeLimit > 600) {
        setError("The time limit must be between 1 and 600 minutes.");
        return;
    }
    if (Number.isNaN(attempts) || attempts < 1 || attempts > 20) {
        setError("Attempts must be between 1 and 20.");
        return;
    }

    if (questions.length === 0 && status === "published") {
        setError("Please add at least one question.");
        return;
    }

    // Blank options (imports pad every question to four) are dropped, then each question is checked.
    const cleanedQuestions = questions.map((q) => ({
      ...q,
      question_text: q.question_text.trim(),
      choices: q.question_type === "mcq"
        ? q.choices.map((c) => ({ ...c, choice_text: c.choice_text.trim() })).filter((c) => c.choice_text !== "")
        : [],
      // Alternatives are typed as "a | b" in one box per blank.
      accepted_answers: q.question_type === "fill_blank"
        ? (q.accepted_answers ?? []).map((group) => group.flatMap((text) => text.split("|")).map((text) => text.trim()).filter(Boolean))
        : undefined,
    }));
    for (let i = 0; i < cleanedQuestions.length; i++) {
      const q = cleanedQuestions[i];
      if (!q.question_text) { setError(`Question ${i + 1} has no text.`); return; }
      if (Number.isNaN(q.points) || q.points <= 0) { setError(`Question ${i + 1}: marks must be more than 0.`); return; }
      if (q.question_type === "fill_blank") {
        const blanks = blankCount(q.question_text);
        if (blanks < 1) { setError(`Question ${i + 1}: write ___ where each blank goes.`); return; }
        const given = q.accepted_answers ?? [];
        if (given.length !== blanks || given.some((group) => group.length === 0)) { setError(`Question ${i + 1}: give at least one accepted answer for each of the ${blanks} blank(s).`); return; }
      } else if (q.question_type === "long_answer") {
        if (q.word_limit != null && (!Number.isInteger(q.word_limit) || q.word_limit < 1 || q.word_limit > 5000)) { setError(`Question ${i + 1}: the word limit must be a whole number from 1 to 5000.`); return; }
      } else {
        if (q.choices.length < 2) { setError(`Question ${i + 1} needs at least two filled-in options.`); return; }
        if (q.choices.filter((c) => c.is_correct).length !== 1) { setError(`Question ${i + 1}: mark exactly one correct option.`); return; }
      }
    }

    const groups = poolGroups(cleanedQuestions as Question[]);
    for (let i = 0; i < pattern.length && !locked; i++) {
      const row = pattern[i];
      if (!Number.isInteger(row.count) || row.count < 1) { setError(`Paper pattern row ${i + 1}: choose how many questions to draw.`); return; }
      const group = groups.find((g) => g.type === row.type && g.marks === row.marks);
      if (status === "published" && (group?.in_pool ?? 0) < row.count) {
        setError(`Paper pattern row ${i + 1}: it draws ${row.count} ${SHORT_TYPE[row.type]} question(s) worth ${marksText(row.marks)}, but the pool has ${group?.in_pool ?? 0}.`);
        return;
      }
    }

    const examData: any = {
      title,
      description,
      course_id: courseId,
      time_limit: timeLimit,
      opens_at: opensAt ? new Date(opensAt).toISOString() : null,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      attempts_allowed: attempts,
      randomize_questions: randomize,
      status: status,
    };
    // Once students have attempted the exam only new questions may be added, and the pattern is fixed.
    // Saving settings alone sends no questions at all, so it can never touch the pool.
    if (!locked || questions.some((q) => q.id === undefined)) examData.questions = cleanedQuestions;
    if (!locked) examData.pattern = pattern;

    setIsSaving(true);
    onSave(examData).then(success => {
        if (success !== true) {
            setError(success || "Failed to save the exam. Please try again.");
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
                    disabled={!!initialData}
                  >
                    {courses.length === 0 && (
                      <option value="">
                        {coursesState === "loading" ? "Loading classes..." : coursesState === "failed" ? "Could not load your classes" : "You have no classes yet"}
                      </option>
                    )}
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
                      min={1}
                      max={600}
                      value={Number.isNaN(timeLimit) ? "" : timeLimit}
                      onChange={(e) => setTimeLimit(e.target.value === "" ? NaN : parseInt(e.target.value))}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mins</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-slate-600" htmlFor="exam-opens">Opens (optional)</label>
                    <input id="exam-opens" type="datetime-local" className="form-input text-sm" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-slate-600" htmlFor="exam-closes">Closes (optional)</label>
                    <input id="exam-closes" type="datetime-local" className="form-input text-sm" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-slate-600">Attempts</label>
                    <input 
                      type="number" 
                      className="form-input text-sm" 
                      min={1}
                      max={20}
                      value={Number.isNaN(attempts) ? "" : attempts}
                      onChange={(e) => setAttempts(e.target.value === "" ? NaN : parseInt(e.target.value))}
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
                      <span className="text-xs font-semibold text-slate-600">Shuffle each student's paper</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Import Section with Tabs ── */}
            <section className="rounded-2xl bg-blue-50 border border-blue-100 overflow-hidden">
              {/* Tab Switcher */}
              <div className="flex border-b border-blue-100">
                {aiTools && <button
                  onClick={() => setImportTab("smart")}
                  className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                    importTab === "smart" 
                      ? "bg-white text-blue-700 border-b-2 border-blue-600 shadow-sm" 
                      : "text-blue-400 hover:text-blue-600 hover:bg-blue-50/50"
                  }`}
                >
                  Smart Import
                </button>}
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
                {aiTools && importTab === "smart" && (
                  <>
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-100/50 border border-blue-200/50">
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
                        Download the template and fill in one row per question. The Type column (MCQ, Fill in the blanks or Long answer) decides which other columns to fill, and Marks is set on every row. The first sheet of the file is read; a second sheet explains each column.
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
                          accept=".xlsx" 
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
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Question pool ({questions.length} question{questions.length === 1 ? "" : "s"})
                </h3>
                {questions.length > 0 && <p className="mt-0.5 text-[11px] text-slate-500">
                  {Object.entries(SHORT_TYPE).map(([type, label]) => [label, questions.filter((q) => q.question_type === type).length] as const).filter(([, n]) => n > 0).map(([label, n]) => `${n} ${label}`).join(" · ")}
                </p>}
              </div>
              <button
                onClick={() => addQuestion()}
                className="btn btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Question
              </button>
            </div>

            {/* Paper pattern: how one student's paper is drawn from the pool */}
            <section className="rounded-2xl border border-slate-200 bg-white/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-700">Paper pattern</h4>
                <span className="text-xs font-bold text-blue-600">
                  {pattern.length === 0
                    ? `Everyone gets all ${questions.length} questions (${questions.reduce((sum, q) => sum + (Number.isNaN(q.points) ? 0 : q.points), 0)} marks)`
                    : `${pattern.reduce((sum, row) => sum + (Number.isNaN(row.marks) || Number.isNaN(row.count) ? 0 : row.marks * row.count), 0)} marks per paper, ${pattern.reduce((sum, row) => sum + (Number.isNaN(row.count) ? 0 : row.count), 0)} questions`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Upload a big pool, then choose how many questions of each kind and mark value each student gets. Every paper has the same total marks. Leave the pattern empty to give everyone every question.</p>
              <fieldset disabled={locked} className="space-y-2 min-w-0">
                {pattern.map((row, i) => {
                  const groups = poolGroups(questions);
                  const group = groups.find((g) => g.type === row.type && g.marks === row.marks);
                  const inPool = group?.in_pool ?? 0;
                  const fresh = inPool - (Number.isNaN(row.count) ? 0 : row.count);
                  const options = group ? groups : [...groups, { type: row.type, marks: row.marks, in_pool: 0 }];
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Pattern row ${i + 1} group`}
                        className="text-xs py-1.5 px-2 rounded-lg border border-slate-200"
                        value={`${row.type}|${row.marks}`}
                        onChange={(e) => { const [type, marks] = e.target.value.split("|"); setPattern(pattern.map((r, k) => (k === i ? { ...r, type, marks: parseFloat(marks) } : r))); }}
                      >
                        {options.map((g) => <option key={`${g.type}|${g.marks}`} value={`${g.type}|${g.marks}`}>{SHORT_TYPE[g.type]} · {marksText(g.marks)} · {g.in_pool} in pool</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                        Draw
                        <input
                          type="number" min={1}
                          aria-label={`Pattern row ${i + 1} count`}
                          className="w-16 text-xs py-1 px-2 rounded-lg border border-slate-200"
                          value={Number.isNaN(row.count) ? "" : row.count}
                          onChange={(e) => setPattern(pattern.map((r, k) => (k === i ? { ...r, count: e.target.value === "" ? NaN : parseInt(e.target.value, 10) } : r)))}
                        />
                      </label>
                      <span className={`text-[11px] font-semibold ${inPool < row.count ? "text-red-600" : fresh < row.count ? "text-amber-700" : "text-green-700"}`}>
                        {inPool < row.count
                          ? `Only ${inPool} in the pool`
                          : fresh < row.count
                            ? `A reset student would see repeated questions (${Math.max(fresh, 0)} fresh left)`
                            : `${inPool} in pool, enough for resets`}
                      </span>
                      {!locked && <button type="button" onClick={() => setPattern(pattern.filter((_, k) => k !== i))} className="ml-auto text-slate-300 hover:text-red-500" aria-label={`Remove pattern row ${i + 1}`}><X size={14} /></button>}
                    </div>
                  );
                })}
              </fieldset>
              {!locked && (
                <button
                  type="button"
                  disabled={poolGroups(questions).length === 0}
                  onClick={() => {
                    const unused = poolGroups(questions).find((g) => !pattern.some((r) => r.type === g.type && r.marks === g.marks));
                    if (unused) setPattern([...pattern, { type: unused.type, marks: unused.marks, count: 1 }]);
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-40 flex items-center gap-1"
                >
                  <Plus size={10} /> Add a pattern row
                </button>
              )}
              {pattern.length === 0 && poolGroups(questions).length === 0 && <p className="text-[11px] text-slate-400">Add questions to the pool first; the pattern lists the kinds you have.</p>}
            </section>

            {locked && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                Students have already attempted this exam. A question that has been on a paper cannot be changed or removed, and the pattern is fixed, but you can add new questions to the pool (for resets) and edit the title, time limit, attempts and other settings.
              </div>
            )}

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

            {importProblems.length > 0 && (
              <ul className="max-h-40 overflow-y-auto list-disc space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 pl-6 text-xs text-amber-900">
                {importProblems.map((problem) => <li key={problem}>{problem}</li>)}
              </ul>
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
              <div className="space-y-4 min-w-0">
                {questions.map((q, qi) => (
                  <GlassCard key={qi} padding="md" className="border border-slate-200/50 relative group">
                    <fieldset disabled={locked && q.id !== undefined} className="contents">
                    <button 
                      onClick={() => removeQuestion(qi)}
                      className="absolute top-4 right-4 text-slate-300 hover:text-red-500 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      title="Remove question"
                      aria-label={`Remove question ${qi + 1}`}
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
                        <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                          Type
                          <select
                            className="text-xs py-1 px-2 rounded-lg border border-slate-200"
                            value={q.question_type}
                            onChange={(e) => setQuestions(questions.map((item, i) => (i === qi ? changeType(item, e.target.value as QuestionType) : item)))}
                          >
                            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                          Marks
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            className="w-20 text-xs py-1 px-2 rounded-lg border border-slate-200"
                            value={Number.isNaN(q.points) ? "" : q.points}
                            onChange={(e) => updatePoints(qi, e.target.value === "" ? NaN : parseFloat(e.target.value))}
                          />
                        </label>
                        </div>
                        


                        {q.question_type === "fill_blank" && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">Write ___ in the question where each blank goes. Spelling is not case sensitive. All blanks must be right to earn the marks.</p>
                            {blankCount(q.question_text) === 0 && <p className="text-xs text-amber-700">No blank yet: type ___ in the question.</p>}
                            {Array.from({ length: blankCount(q.question_text) }, (_, blank) => (
                              <label key={blank} className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                                Blank {blank + 1}
                                <input
                                  className="flex-1 text-xs py-2 px-3 rounded-xl border bg-slate-50 border-transparent focus:bg-white focus:border-blue-300"
                                  placeholder="Accepted answers, separated by |  (for example: 100 | one hundred)"
                                  value={(q.accepted_answers?.[blank] ?? []).join(" | ")}
                                  onChange={(e) => setAccepted(qi, blank, e.target.value)}
                                />
                              </label>
                            ))}
                          </div>
                        )}

                        {q.question_type === "long_answer" && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">Students type their answer. You mark it after the exam.</p>
                            <textarea
                              className="w-full text-xs py-2 px-3 rounded-xl border bg-slate-50 border-transparent focus:bg-white focus:border-blue-300 min-h-[60px]"
                              placeholder="Marking notes or model answer (students never see this)"
                              value={q.answer_guide ?? ""}
                              onChange={(e) => updateQuestion(qi, { answer_guide: e.target.value })}
                            />
                            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                              Word limit (optional)
                              <input
                                type="number" min={1} max={5000}
                                className="w-24 text-xs py-1 px-2 rounded-lg border border-slate-200"
                                value={q.word_limit ?? ""}
                                onChange={(e) => updateQuestion(qi, { word_limit: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                              />
                            </label>
                          </div>
                        )}
                        {q.question_type === "mcq" && <div className="space-y-2">
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
                              {q.choices.length > 2 && (
                                <button
                                  onClick={() => removeChoice(qi, ci)}
                                  className="text-slate-300 hover:text-red-500"
                                  title="Remove option"
                                  aria-label={`Remove option ${String.fromCharCode(65 + ci)}`}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button 
                            onClick={() => addChoice(qi)}
                            className="text-[10px] font-bold text-blue-500 mt-1 hover:underline flex items-center gap-1"
                          >
                            <Plus size={10} /> Add Option
                          </button>
                        </div>}
                      </div>
                    </div>
                    </fieldset>
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
