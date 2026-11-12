import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { apiCall } from "../../shared/utils/apiCall";
import { API_BASE_URL } from "../../shared/utils/apiConfig";

const LETTERS = ["A", "B", "C", "D"];
const field = "rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
const border = { borderColor: "var(--color-border)" };

interface Course { id: number; name: string; subject_code?: string }
interface Job { id: number; title: string; num_questions: number; answer_key: Record<string, string>; classroom_id: number | null; classroom_name: string | null; sheet_count?: number; needs_review?: number }
interface Sheet {
  id: number; student_id: number | null; student_name: string | null; register_read: string; image_url: string | null;
  detected_answers: Record<string, string | null>; issues: { questions?: Record<string, string>; notes?: string[] };
  score: number; status: "needs_review" | "verified";
}
interface Student { id: number; name: string }

const fileUrl = (p: string) => (p.startsWith("http") ? p : `${API_BASE_URL}${p.startsWith("/") ? p : `/${p}`}`);

async function download(path: string, filename: string, onError: (m: string) => void) {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) throw new Error();
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch {
    onError("The download failed. Try again.");
  }
}

export const OMRPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [job, setJob] = useState<Job | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [openSheet, setOpenSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // create form
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(20);
  const [classroomId, setClassroomId] = useState("");
  const [key, setKey] = useState<Record<string, string>>({});

  const loadJobs = useCallback(async () => {
    const r = await apiCall<Job[]>("GET", "/omr/jobs");
    if (r.ok) setJobs(r.data); else setError(r.error || "");
  }, []);

  useEffect(() => {
    loadJobs();
    apiCall<Course[]>("GET", "/courses/").then((r) => r.ok && Array.isArray(r.data) && setCourses(r.data));
  }, [loadJobs]);

  const loadSheets = useCallback(async (id: number) => {
    const r = await apiCall<Sheet[]>("GET", `/omr/jobs/${id}/submissions`);
    if (r.ok) setSheets(r.data); else setError(r.error || "");
  }, []);

  const openJob = async (j: Job) => {
    setError(""); setNotice(""); setJob(j); setOpenSheet(null); setView("detail");
    loadSheets(j.id);
    setStudents([]);
    if (j.classroom_id) {
      const r = await apiCall<any>("GET", `/students/${j.classroom_id}`);
      const list = r.ok ? (Array.isArray(r.data) ? r.data : r.data?.results || r.data?.students || []) : [];
      setStudents(list.map((s: any) => ({ id: s.student_id ?? s.id, name: s.name || s.full_name || s.email })).filter((s: Student) => s.id));
    }
  };

  const create = async () => {
    setBusy(true); setError("");
    const r = await apiCall<Job>("POST", "/omr/jobs", { title, num_questions: count, answer_key: key, classroom_id: classroomId ? Number(classroomId) : null });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice("Exam created. Print the answer sheet, then scan the filled sheets here.");
    await loadJobs();
    openJob(r.data);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || !job) return;
    setBusy(true); setError(""); setNotice("");
    const body = new FormData();
    Array.from(files).forEach((f) => body.append("files", f));
    try {
      const res = await fetch(`${API_BASE_URL}/omr/jobs/${job.id}/submissions`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      const results: { filename: string; error?: string }[] = data?.results || [];
      const failed = results.filter((x) => x.error);
      if (!res.ok && !results.length) setError(data?.detail || "The upload failed.");
      else {
        setNotice(`${results.length - failed.length} of ${results.length} sheets read.`);
        if (failed.length) setError(failed.map((f) => `${f.filename}: ${f.error}`).join(" "));
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    loadSheets(job.id); loadJobs();
  };

  const patchSheet = async (sheet: Sheet, body: Record<string, unknown>) => {
    setError(""); setNotice("");
    const r = await apiCall<Sheet>("PATCH", `/omr/submissions/${sheet.id}`, body);
    if (!r.ok) { setError(r.error || ""); return; }
    setOpenSheet(r.data);
    if (job) loadSheets(job.id);
    loadJobs();
  };

  const removeSheet = async (sheet: Sheet) => {
    if (!window.confirm("Delete this sheet and its mark? This cannot be undone.")) return;
    const r = await apiCall("DELETE", `/omr/submissions/${sheet.id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    setOpenSheet(null);
    if (job) loadSheets(job.id);
    loadJobs();
  };

  const removeJob = async (j: Job) => {
    if (!window.confirm(`Delete "${j.title}" and all its sheets? This cannot be undone.`)) return;
    const r = await apiCall("DELETE", `/omr/jobs/${j.id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    setView("list"); setNotice("Exam deleted."); loadJobs();
  };

  const saveKey = async (next: Record<string, string>) => {
    if (!job) return;
    setError(""); setNotice("");
    const r = await apiCall<Job>("PATCH", `/omr/jobs/${job.id}`, { answer_key: next });
    if (!r.ok) { setError(r.error || ""); return; }
    setJob({ ...job, ...r.data }); setNotice("Answer key saved. Every scanned sheet was re-marked.");
    loadSheets(job.id);
  };

  const messages = (
    <>
      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">{notice}</p>}
    </>
  );

  const keyGrid = (value: Record<string, string>, n: number, onChange: (k: Record<string, string>) => void) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: n }, (_, i) => String(i + 1)).map((q) => (
        <label key={q} className="flex items-center gap-2 text-sm">
          <span className="w-7 text-right font-bold">{q}</span>
          <select aria-label={`Correct answer for question ${q}`} className={`${field} flex-1`} style={border} value={value[q] || ""} onChange={(e) => onChange({ ...value, [q]: e.target.value })}>
            <option value="">Choose</option>
            {LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      ))}
    </div>
  );

  // ---- create ----
  if (view === "create") {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <button className="text-sm font-bold text-blue-700 hover:underline" onClick={() => setView("list")}>Back to OMR exams</button>
          <h1 className="text-2xl font-bold font-display">New OMR exam</h1>
        </div>
        {messages}
        <GlassCard className="p-5 space-y-3">
          <label className="block text-sm font-semibold">Title
            <input className={`${field} w-full mt-1`} style={border} maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="block text-sm font-semibold">Questions (1 to 100)
              <input type="number" min={1} max={100} className={`${field} block mt-1 w-28`} style={border} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
            </label>
            <label className="block text-sm font-semibold flex-1 min-w-48">Classroom (optional)
              <select className={`${field} w-full mt-1`} style={border} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
                <option value="">No classroom</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.subject_code ? `${c.subject_code}: ` : ""}{c.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>With a classroom, marks are matched to its students by register number and added to their record once a sheet is verified.</p>
        </GlassCard>
        <GlassCard className="p-5 space-y-3">
          <p className="font-semibold text-sm">Answer key</p>
          {keyGrid(key, count, setKey)}
        </GlassCard>
        <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={create}>{busy ? "Creating..." : "Create exam"}</button>
      </div>
    );
  }

  // ---- detail ----
  if (view === "detail" && job) {
    const review = openSheet;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <button className="text-sm font-bold text-blue-700 hover:underline" onClick={() => { setView("list"); loadJobs(); }}>Back to OMR exams</button>
            <h1 className="text-2xl font-bold font-display">{job.title}</h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.num_questions} questions{job.classroom_name ? ` · ${job.classroom_name}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white border" style={border} onClick={() => download(`/omr/jobs/${job.id}/template`, `omr_sheet_${job.id}.pdf`, setError)}>Print answer sheet</button>
            <button className="btn bg-white border" style={border} disabled={sheets.length === 0} onClick={() => download(`/omr/jobs/${job.id}/submissions?export=csv`, `omr_results_${job.id}.csv`, setError)}>Download CSV</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Reading..." : "Scan sheets"}</button>
            <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={(e) => upload(e.target.files)} />
          </div>
        </div>
        {messages}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-bold text-sm">Sheets ({sheets.length})</h2>
            {sheets.length === 0 ? (
              <GlassCard className="p-10 text-center space-y-2">
                <FileImage className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
                <p className="font-semibold">No sheets scanned yet.</p>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Print the answer sheet, hand it out, then photograph or scan each filled sheet flat, with all four black corner squares in view.</p>
              </GlassCard>
            ) : (
              <GlassCard className="divide-y" style={border}>
                {sheets.map((s) => (
                  <button key={s.id} onClick={() => setOpenSheet(s)} className={`w-full text-left flex flex-wrap items-center gap-3 p-4 ${review?.id === s.id ? "bg-blue-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{s.student_name || "Student not chosen"}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Register read: {s.register_read || "not readable"}</p>
                    </div>
                    <span className="font-bold">{s.score}%</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.status === "verified" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {s.status === "verified" ? "Verified" : "Needs review"}
                    </span>
                  </button>
                ))}
              </GlassCard>
            )}
          </div>

          <div className="space-y-4">
            {review ? (
              <GlassCard className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Review sheet</h2>
                  <button className="text-sm text-red-600 font-bold hover:underline" onClick={() => removeSheet(review)}>Delete</button>
                </div>
                {review.image_url && <a href={fileUrl(review.image_url)} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700 hover:underline">Open the scan</a>}
                {(review.issues.notes || []).map((n) => <p key={n} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{n}</p>)}
                <label className="block text-sm font-semibold">Student
                  <select className={`${field} w-full mt-1`} style={border} value={review.student_id ?? ""} onChange={(e) => patchSheet(review, { student_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Not chosen</option>
                    {review.student_id && !students.some((s) => s.id === review.student_id) && <option value={review.student_id}>{review.student_name}</option>}
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                {!job.classroom_id && <p className="text-xs text-amber-700">This exam has no classroom, so students cannot be matched. Create it with a classroom to record marks.</p>}
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {Array.from({ length: job.num_questions }, (_, i) => String(i + 1)).map((q) => {
                    const state = review.issues.questions?.[q];
                    const got = review.detected_answers[q] || "";
                    return (
                      <label key={q} className={`flex items-center gap-2 text-sm rounded px-1 ${state ? "bg-amber-50" : ""}`}>
                        <span className="w-7 text-right font-bold">{q}</span>
                        <select aria-label={`Answer read for question ${q}`} className={`${field} flex-1 py-1`} style={border} value={got} onChange={(e) => patchSheet(review, { answers: { [q]: e.target.value } })}>
                          <option value="">{state === "multiple" ? "Two marks" : "Blank"}</option>
                          {LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <span className={`w-14 text-xs font-bold ${got && got === job.answer_key[q] ? "text-green-700" : "text-red-600"}`}>{got && got === job.answer_key[q] ? "Right" : `Key ${job.answer_key[q]}`}</span>
                      </label>
                    );
                  })}
                </div>
                <button className="btn btn-primary w-full" disabled={review.status === "verified" || !review.student_id} onClick={() => patchSheet(review, { confirm: true })}>
                  {review.status === "verified" ? "Verified" : "Confirm this sheet"}
                </button>
              </GlassCard>
            ) : (
              <GlassCard className="p-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>Select a sheet to check the answers read from it, choose its student and confirm it.</GlassCard>
            )}
            <GlassCard className="p-4 space-y-3">
              <h2 className="font-bold text-sm">Answer key</h2>
              {keyGrid(job.answer_key, job.num_questions, (k) => setJob({ ...job, answer_key: k }))}
              <button className="btn bg-white border w-full" style={border} onClick={() => saveKey(job.answer_key)}>Save key and re-mark</button>
            </GlassCard>
            <button className="text-sm text-red-600 font-bold hover:underline" onClick={() => removeJob(job)}>Delete this exam</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- list ----
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold font-display">OMR</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Print a bubble sheet, scan the filled sheets with a phone or scanner, and get marks without grading by hand.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setTitle(""); setCount(20); setKey({}); setClassroomId(""); setError(""); setNotice(""); setView("create"); }}>New OMR exam</button>
      </div>
      {messages}
      {jobs.length === 0 ? (
        <GlassCard className="p-10 text-center"><p className="font-semibold">No OMR exams yet.</p></GlassCard>
      ) : (
        <GlassCard className="divide-y" style={border}>
          {jobs.map((j) => (
            <button key={j.id} onClick={() => openJob(j)} className="w-full text-left flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{j.title}</p>
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{j.num_questions} questions{j.classroom_name ? ` · ${j.classroom_name}` : ""}</p>
              </div>
              <span className="text-sm">{j.sheet_count ?? 0} sheets</span>
              {(j.needs_review ?? 0) > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{j.needs_review} to review</span>}
            </button>
          ))}
        </GlassCard>
      )}
    </div>
  );
};
