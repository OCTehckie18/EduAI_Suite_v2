import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Download, Plus, Trash2 } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

const API = API_ENDPOINTS.BASE;

interface Course { id: number; name: string; subject_code?: string }
interface AssignmentRow { id: number; title: string; max_points: number }
interface RubricLine { id?: number; label: string; description: string; max_score: number | string }
interface QueueItem { id: number; student_name: string; submitted_at: string | null; file_path: string | null; grade: number | null; evaluated: boolean }
interface Marking {
  submission: QueueItem;
  max_points: number;
  feedback: string;
  evaluated: boolean;
  criteria: { id: number; label: string; description: string; max_score: number; score: number | null; comment: string }[];
}
interface Template { id: number; mark: string; text: string }

async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: any; error?: string }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, data, error: data?.detail || data?.error?.message || `Something went wrong (${res.status}).` };
    return { ok: true, data };
  } catch {
    return { ok: false, data: null, error: "Could not reach the server. Check your connection and try again." };
  }
}

const fileUrl = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("http") ? normalized : `${API}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
};
const files = (path: string | null) => (path ? path.split(",").filter(Boolean) : []);
const shortName = (path: string) => path.split(/[\\/]/).pop()?.replace(/^[^_]+_/, "") || "File";

export const EvaluationPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rubric, setRubric] = useState<RubricLine[]>([]);
  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricDraft, setRubricDraft] = useState<RubricLine[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [marking, setMarking] = useState<Marking | null>(null);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const assignment = assignments.find((a) => String(a.id) === assignmentId);

  useEffect(() => {
    call("GET", "/courses/").then((r) => {
      if (r.ok && Array.isArray(r.data)) setCourses(r.data);
      else if (!r.ok) setError(r.error || "");
    });
    call("GET", "/assignments/feedback-templates").then((r) => r.ok && setTemplates(r.data.results || []));
  }, []);

  useEffect(() => {
    setAssignments([]); setAssignmentId(""); setQueue([]); setRubric([]); setMarking(null); setSelectedId(null);
    if (!courseId) return;
    call("GET", `/assignments/${courseId}`).then((r) => {
      if (r.ok && Array.isArray(r.data)) setAssignments(r.data);
      else if (!r.ok) setError(r.error || "");
    });
  }, [courseId]);

  const loadQueue = useCallback(async (id: string) => {
    const r = await call("GET", `/assignments/${id}/evaluation`);
    if (!r.ok) { setError(r.error || ""); return; }
    setQueue(r.data.submissions);
    setRubric(r.data.criteria);
  }, []);

  useEffect(() => {
    setQueue([]); setRubric([]); setMarking(null); setSelectedId(null); setEditingRubric(false);
    if (assignmentId) loadQueue(assignmentId);
  }, [assignmentId, loadQueue]);

  const open = async (id: number) => {
    setSelectedId(id); setError(""); setNotice("");
    const r = await call("GET", `/submissions/evaluation/${id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    const m: Marking = r.data;
    setMarking(m);
    setScores(Object.fromEntries(m.criteria.map((c) => [c.id, c.score === null ? "" : String(c.score)])));
    setComments(Object.fromEntries(m.criteria.map((c) => [c.id, c.comment])));
    setFeedback(m.feedback);
  };

  const draftTotal = rubricDraft.reduce((sum, l) => sum + (Number(l.max_score) || 0), 0);

  const startRubric = () => {
    setRubricDraft(rubric.length ? rubric.map((c) => ({ ...c })) : [{ label: "", description: "", max_score: "" }]);
    setEditingRubric(true); setError(""); setNotice("");
  };

  const saveRubric = async () => {
    setBusy(true); setError("");
    const r = await call("PUT", `/assignments/${assignmentId}/rubric`, {
      criteria: rubricDraft.map((l) => ({ label: l.label, description: l.description, max_score: Number(l.max_score) })),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    setRubric(r.data.criteria); setEditingRubric(false); setNotice("Rubric saved.");
  };

  const total = useMemo(
    () => (marking ? marking.criteria.reduce((sum, c) => sum + (Number(scores[c.id]) || 0), 0) : 0),
    [marking, scores],
  );
  const complete = !!marking && marking.criteria.every((c) => scores[c.id] !== "" && scores[c.id] !== undefined);

  const saveMarks = async () => {
    if (!marking) return;
    setBusy(true); setError(""); setNotice("");
    const r = await call("PUT", `/submissions/evaluation/${marking.submission.id}`, {
      scores: marking.criteria.map((c) => ({ criterion_id: c.id, score: Number(scores[c.id]), comment: comments[c.id] || "" })),
      feedback,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    setMarking(r.data);
    setNotice(`Saved. ${r.data.submission.student_name} scored ${r.data.submission.grade} of ${r.data.max_points}.`);
    loadQueue(assignmentId);
  };

  const field = "rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
  const border = { borderColor: "var(--color-border)" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Evaluation</h1>
        <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Mark submitted work line by line against a rubric. The total goes straight into the gradebook.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select aria-label="Classroom" className={field} style={border} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Choose a classroom</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.subject_code ? `${c.subject_code} · ` : ""}{c.name}</option>)}
        </select>
        <select aria-label="Assignment" className={field} style={border} value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} disabled={!courseId}>
          <option value="">{courseId && assignments.length === 0 ? "No assignments in this classroom" : "Choose an assignment"}</option>
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.max_points} marks)</option>)}
        </select>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">{notice}</p>}

      {!assignmentId ? (
        <GlassCard className="p-8 text-center">
          <CheckSquare className="mx-auto mb-3" style={{ color: "var(--color-text-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Choose a classroom and an assignment to start marking.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <GlassCard className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Rubric</h3>
                {!editingRubric && <button className="text-sm font-bold text-blue-600 hover:underline" onClick={startRubric}>{rubric.length ? "Edit" : "Set up"}</button>}
              </div>
              {editingRubric ? (
                <div className="space-y-3">
                  {rubricDraft.map((line, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg border p-2" style={border}>
                      <div className="flex gap-2">
                        <input aria-label={`Rubric line ${i + 1} name`} placeholder="Name, e.g. Content" className={`${field} flex-1 min-w-0`} style={border} value={line.label}
                          onChange={(e) => setRubricDraft(rubricDraft.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))} />
                        <input aria-label={`Rubric line ${i + 1} marks`} type="number" min={1} placeholder="Marks" className={`${field} w-20`} style={border} value={line.max_score}
                          onChange={(e) => setRubricDraft(rubricDraft.map((l, j) => (j === i ? { ...l, max_score: e.target.value } : l)))} />
                        <button aria-label={`Remove rubric line ${i + 1}`} className="p-2 text-red-500" onClick={() => setRubricDraft(rubricDraft.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                      </div>
                      <input aria-label={`Rubric line ${i + 1} description`} placeholder="What earns full marks (optional)" className={`${field} w-full`} style={border} value={line.description}
                        onChange={(e) => setRubricDraft(rubricDraft.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))} />
                    </div>
                  ))}
                  <button className="text-sm font-bold text-blue-600 flex items-center gap-1" onClick={() => setRubricDraft([...rubricDraft, { label: "", description: "", max_score: "" }])}><Plus size={14} /> Add line</button>
                  <p className={`text-xs font-bold ${draftTotal === assignment?.max_points ? "text-green-600" : "text-amber-600"}`}>
                    {draftTotal} of {assignment?.max_points} marks used
                  </p>
                  <div className="flex gap-2">
                    <button className="btn btn-primary flex-1" disabled={busy} onClick={saveRubric}>{busy ? "Saving..." : "Save rubric"}</button>
                    <button className="btn bg-slate-100" onClick={() => setEditingRubric(false)}>Cancel</button>
                  </div>
                </div>
              ) : rubric.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No rubric yet. Set one up before marking.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {rubric.map((c) => <li key={c.id} className="flex justify-between"><span>{c.label}</span><span className="font-bold">{c.max_score}</span></li>)}
                </ul>
              )}
            </GlassCard>

            <h3 className="font-bold text-sm">Submissions ({queue.length})</h3>
            {queue.length === 0 ? (
              <GlassCard className="p-6 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>Nothing has been handed in for this assignment yet.</GlassCard>
            ) : (
              <ul className="space-y-2">
                {queue.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => open(s.id)} className={`w-full text-left rounded-xl border px-4 py-3 ${selectedId === s.id ? "ring-2 ring-blue-500" : ""}`} style={border}>
                      <span className="font-semibold block">{s.student_name || "Unknown student"}</span>
                      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {s.evaluated ? `Marked: ${s.grade} of ${assignment?.max_points}` : s.grade !== null ? `Graded without rubric: ${s.grade}` : "Not marked"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2">
            {!marking ? (
              <div className="h-full min-h-48 flex items-center justify-center p-6 border-2 border-dashed rounded-3xl" style={border}>
                <p style={{ color: "var(--color-text-muted)" }}>Select a submission to mark.</p>
              </div>
            ) : (
              <GlassCard className="p-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold font-display">{marking.submission.student_name}</h2>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Submitted {marking.submission.submitted_at || "(time not recorded)"}</p>
                </div>

                <div className="space-y-2">
                  {files(marking.submission.file_path).length === 0 && <p className="text-sm text-amber-700">No file was attached to this submission.</p>}
                  {files(marking.submission.file_path).map((path) => (
                    <div key={path} className="space-y-2">
                      <a href={fileUrl(path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
                        <Download size={14} /> {shortName(path)}
                      </a>
                      {path.toLowerCase().endsWith(".pdf") && (
                        <iframe title={`Preview of ${shortName(path)}`} src={fileUrl(path)} className="w-full h-96 rounded-xl border" style={border} />
                      )}
                    </div>
                  ))}
                </div>

                {marking.criteria.length === 0 ? (
                  <p className="text-sm text-amber-700">Set up a rubric for this assignment (on the left) before marking.</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {marking.criteria.map((c) => (
                        <div key={c.id} className="rounded-xl border p-3 space-y-2" style={border}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-sm">{c.label}</p>
                              {c.description && <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{c.description}</p>}
                            </div>
                            <label className="flex items-center gap-1 text-sm font-bold whitespace-nowrap">
                              <input aria-label={`Score for ${c.label}`} type="number" min={0} max={c.max_score} step="0.5" className={`${field} w-20 text-center`} style={border}
                                value={scores[c.id] ?? ""} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })} />
                              / {c.max_score}
                            </label>
                          </div>
                          <input aria-label={`Comment on ${c.label}`} placeholder="Comment (optional)" maxLength={500} className={`${field} w-full`} style={border}
                            value={comments[c.id] ?? ""} onChange={(e) => setComments({ ...comments, [c.id]: e.target.value })} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider block mb-1" htmlFor="overall-feedback">Feedback to the student</label>
                      <textarea id="overall-feedback" rows={3} maxLength={5000} className={`${field} w-full`} style={border} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                      {templates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {templates.map((t) => (
                            <button key={t.id} type="button" title={t.text} className="rounded-full bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold"
                              onClick={() => setFeedback((f) => (f ? `${f} ${t.text}` : t.text))}>{t.mark}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t pt-4" style={border}>
                      <p className="font-bold">Total: {total} / {marking.max_points}</p>
                      <button className="btn btn-primary shadow-md" disabled={busy || !complete} onClick={saveMarks}>
                        {busy ? "Saving..." : marking.evaluated ? "Update marks" : "Save marks"}
                      </button>
                    </div>
                    {!complete && <p className="text-xs text-amber-700">Give every line a score to save.</p>}
                  </>
                )}
              </GlassCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
