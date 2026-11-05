import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileSignature, Plus, Trash2 } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { apiCall } from "../../shared/utils/apiCall";
import { API_BASE_URL } from "../../shared/utils/apiConfig";

type Kind = "short_text" | "paragraph" | "choice" | "checkbox";
type Status = "DRAFT" | "PUBLISHED" | "CLOSED";

interface Course { id: number; name: string; subject_code?: string }
interface FormRow { id: number; classroom_id: number; classroom_name: string; title: string; status: Status; response_count?: number }
interface QuestionDraft { id?: number; kind: Kind; prompt: string; required: boolean; options: string }
interface FormFull extends FormRow { description: string; questions: { id: number; kind: Kind; prompt: string; required: boolean; options: string[] }[] }
interface Results {
  form: FormFull;
  enrolled: number;
  summary: { question_id: number; prompt: string; kind: Kind; answered: number; counts?: { option: string; count: number }[] }[];
  responses: { id: number; student: string; email: string; submitted_at: string; answers: Record<string, string> }[];
}

const KIND_LABEL: Record<Kind, string> = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  choice: "Multiple choice",
  checkbox: "Checkboxes",
};
const STATUS_LABEL: Record<Status, string> = { DRAFT: "Draft", PUBLISHED: "Open", CLOSED: "Closed" };
const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PUBLISHED: "bg-green-100 text-green-800",
  CLOSED: "bg-amber-100 text-amber-800",
};
const isChoice = (k: Kind) => k === "choice" || k === "checkbox";
const blank = (): QuestionDraft => ({ kind: "short_text", prompt: "", required: false, options: "" });
const field = "rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
const border = { borderColor: "var(--color-border)" };

export const FormsPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState("");
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"list" | "edit" | "results">("list");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // builder state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([blank()]);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const [results, setResults] = useState<Results | null>(null);

  const loadForms = useCallback(async () => {
    const r = await apiCall<FormRow[]>("GET", `/forms${filter ? `?classroom=${filter}` : ""}`);
    if (r.ok) setForms(r.data);
    else setError(r.error || "");
    setLoaded(true);
  }, [filter]);

  useEffect(() => {
    apiCall<Course[]>("GET", "/courses/").then((r) => r.ok && Array.isArray(r.data) && setCourses(r.data));
  }, []);
  useEffect(() => { loadForms(); }, [loadForms]);

  const startNew = () => {
    setEditingId(null); setClassroomId(filter || (courses[0] ? String(courses[0].id) : ""));
    setTitle(""); setDescription(""); setQuestions([blank()]); setLocked(false);
    setError(""); setNotice(""); setMode("edit");
  };

  const startEdit = async (id: number) => {
    setError(""); setNotice("");
    const r = await apiCall<FormFull>("GET", `/forms/${id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    const f = r.data;
    setEditingId(id); setClassroomId(String(f.classroom_id)); setTitle(f.title); setDescription(f.description);
    setQuestions(f.questions.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, required: q.required, options: q.options.join("\n") })));
    setLocked((f.response_count || 0) > 0);
    setMode("edit");
  };

  const payloadQuestions = () =>
    questions.map((q) => ({
      kind: q.kind,
      prompt: q.prompt,
      required: q.required,
      options: isChoice(q.kind) ? q.options.split("\n").map((o) => o.trim()).filter(Boolean) : [],
    }));

  const save = async () => {
    setBusy(true); setError("");
    const body: Record<string, unknown> = { title, description };
    if (!locked) body.questions = payloadQuestions();
    const r = editingId
      ? await apiCall("PUT", `/forms/${editingId}`, body)
      : await apiCall("POST", "/forms", { ...body, classroom_id: Number(classroomId) });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice(editingId ? "Form saved." : "Form created as a draft. Publish it when it is ready.");
    setMode("list");
    loadForms();
  };

  const setStatus = async (id: number, status: Status) => {
    setError(""); setNotice("");
    const r = await apiCall("POST", `/forms/${id}/status`, { status });
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice(status === "PUBLISHED" ? "Published. Students in the classroom can now answer it." : status === "CLOSED" ? "Closed. No more answers will be accepted." : "Moved back to draft.");
    loadForms();
  };

  const remove = async (f: FormRow) => {
    const extra = (f.response_count || 0) > 0 ? ` Its ${f.response_count} answers will be deleted too.` : "";
    if (!window.confirm(`Delete "${f.title}"?${extra} This cannot be undone.`)) return;
    const r = await apiCall("DELETE", `/forms/${f.id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice("Form deleted.");
    loadForms();
  };

  const openResults = async (id: number) => {
    setError(""); setNotice("");
    const r = await apiCall<Results>("GET", `/forms/${id}/responses`);
    if (!r.ok) { setError(r.error || ""); return; }
    setResults(r.data); setMode("results");
  };

  const downloadCsv = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/forms/${id}/responses?export=csv`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `form_${id}_responses.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the responses. Try again.");
    }
  };

  const update = (i: number, patch: Partial<QuestionDraft>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  };

  const messages = (
    <>
      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">{notice}</p>}
    </>
  );

  // ---- results ----
  if (mode === "results" && results) {
    const f = results.form;
    return (
      <div className="space-y-6 animate-fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button className="text-sm font-bold text-blue-700 hover:underline" onClick={() => setMode("list")}>Back to forms</button>
            <h1 className="text-2xl font-bold font-display">{f.title}</h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {results.responses.length} of {results.enrolled} students have answered ({f.classroom_name})
            </p>
          </div>
          <button className="btn btn-primary" disabled={results.responses.length === 0} onClick={() => downloadCsv(f.id)}>Download CSV</button>
        </div>
        {messages}
        {results.responses.length === 0 ? (
          <GlassCard className="p-8 text-center"><p className="font-semibold">Nobody has answered yet.</p></GlassCard>
        ) : (
          <>
            <div className="space-y-4">
              {results.summary.map((s) => (
                <GlassCard key={s.question_id} className="p-4 space-y-2">
                  <p className="font-semibold">{s.prompt} <span className="text-xs font-normal" style={{ color: "var(--color-text-secondary)" }}>({s.answered} answered)</span></p>
                  {s.counts?.map((c) => (
                    <div key={c.option} className="text-sm">
                      <div className="flex justify-between"><span>{c.option}</span><span className="font-bold">{c.count}</span></div>
                      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${results.responses.length ? (100 * c.count) / results.responses.length : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </GlassCard>
              ))}
            </div>
            <GlassCard className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-3">Student</th>
                    {f.questions.map((q) => <th key={q.id} className="p-3">{q.prompt}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.responses.map((r) => (
                    <tr key={r.id} className="border-t" style={border}>
                      <td className="p-3 font-semibold">{r.student}</td>
                      {f.questions.map((q) => <td key={q.id} className="p-3">{r.answers[String(q.id)] || <span className="text-slate-400">No answer</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </>
        )}
      </div>
    );
  }

  // ---- builder ----
  if (mode === "edit") {
    return (
      <div className="space-y-6 animate-fade-in-up max-w-3xl">
        <div>
          <button className="text-sm font-bold text-blue-700 hover:underline" onClick={() => setMode("list")}>Back to forms</button>
          <h1 className="text-2xl font-bold font-display">{editingId ? "Edit form" : "New form"}</h1>
        </div>
        {messages}
        <GlassCard className="p-5 space-y-3">
          <label className="block text-sm font-semibold">Classroom
            <select className={`${field} w-full mt-1`} style={border} value={classroomId} onChange={(e) => setClassroomId(e.target.value)} disabled={!!editingId}>
              {courses.length === 0 && <option value="">You have no classrooms</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.subject_code ? `${c.subject_code}: ` : ""}{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Title
            <input className={`${field} w-full mt-1`} style={border} maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Description (optional)
            <textarea className={`${field} w-full mt-1`} style={border} rows={2} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </GlassCard>

        {locked && <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">Students have already answered, so only the title and description can change.</p>}

        {questions.map((q, i) => (
          <GlassCard key={i} className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>Question {i + 1}</span>
              <select aria-label={`Type of question ${i + 1}`} className={`${field} ml-auto`} style={border} disabled={locked} value={q.kind}
                onChange={(e) => update(i, { kind: e.target.value as Kind })}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <button aria-label={`Move question ${i + 1} up`} disabled={locked || i === 0} className="p-2 disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
              <button aria-label={`Move question ${i + 1} down`} disabled={locked || i === questions.length - 1} className="p-2 disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
              <button aria-label={`Remove question ${i + 1}`} disabled={locked} className="p-2 text-red-600 disabled:opacity-30" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </div>
            <input aria-label={`Question ${i + 1} text`} placeholder="Question" className={`${field} w-full`} style={border} maxLength={500} disabled={locked} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
            {isChoice(q.kind) && (
              <textarea aria-label={`Choices for question ${i + 1}`} placeholder="One choice per line (at least 2)" rows={4} className={`${field} w-full`} style={border} disabled={locked} value={q.options} onChange={(e) => update(i, { options: e.target.value })} />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={locked} checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} /> Required
            </label>
          </GlassCard>
        ))}

        <div className="flex flex-wrap gap-3">
          <button className="btn bg-white border" style={border} disabled={locked || questions.length >= 50} onClick={() => setQuestions([...questions, blank()])}><Plus size={16} /> Add question</button>
          <button className="btn btn-primary" disabled={busy || !title.trim() || !classroomId} onClick={save}>{busy ? "Saving..." : "Save form"}</button>
        </div>
      </div>
    );
  }

  // ---- list ----
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold font-display">Forms</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Collect answers from a classroom: consent slips, feedback, sign-ups. Students answer once, and you see every response here.
          </p>
        </div>
        <div className="flex gap-3">
          <select aria-label="Filter by classroom" className={field} style={border} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All classrooms</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.subject_code ? `${c.subject_code}: ` : ""}{c.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={startNew} disabled={courses.length === 0}>New form</button>
        </div>
      </div>
      {messages}

      {loaded && forms.length === 0 ? (
        <GlassCard className="p-10 text-center space-y-2">
          <FileSignature className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
          <p className="font-semibold">{courses.length === 0 ? "Create a classroom first, then build a form for it." : "No forms yet."}</p>
        </GlassCard>
      ) : (
        <GlassCard className="divide-y" style={border}>
          {forms.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{f.title}</p>
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{f.classroom_name} · {f.response_count ?? 0} answers</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
              <div className="flex flex-wrap gap-2 text-sm font-bold">
                {f.status === "DRAFT" && <button className="text-green-700 hover:underline" onClick={() => setStatus(f.id, "PUBLISHED")}>Publish</button>}
                {f.status === "PUBLISHED" && <button className="text-amber-700 hover:underline" onClick={() => setStatus(f.id, "CLOSED")}>Close</button>}
                {f.status === "CLOSED" && <button className="text-green-700 hover:underline" onClick={() => setStatus(f.id, "PUBLISHED")}>Reopen</button>}
                <button className="text-blue-700 hover:underline" onClick={() => startEdit(f.id)}>Edit</button>
                <button className="text-blue-700 hover:underline" onClick={() => openResults(f.id)}>Responses</button>
                <button className="text-red-600 hover:underline" onClick={() => remove(f)}>Delete</button>
              </div>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
};
