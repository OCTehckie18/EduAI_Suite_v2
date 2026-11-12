import React, { useCallback, useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { apiCall } from "../../shared/utils/apiCall";

type Kind = "short_text" | "paragraph" | "choice" | "checkbox";
interface FormRow { id: number; title: string; classroom_name: string; submitted?: boolean }
interface Question { id: number; kind: Kind; prompt: string; required: boolean; options: string[] }
interface FormFull extends FormRow { description: string; questions: Question[] }
interface Answer { text: string; selected: string[] }

const field = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
const border = { borderColor: "var(--color-border)" };

export const StudentForms: React.FC = () => {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<FormFull | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiCall<FormRow[]>("GET", "/forms");
    if (r.ok) setForms(r.data);
    else setError(r.error || "");
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async (id: number) => {
    setError(""); setNotice("");
    const r = await apiCall<FormFull>("GET", `/forms/${id}`);
    if (!r.ok) { setError(r.error || ""); return; }
    setOpen(r.data);
    setAnswers(Object.fromEntries(r.data.questions.map((q) => [q.id, { text: "", selected: [] }])));
  };

  const setAnswer = (id: number, patch: Partial<Answer>) => setAnswers({ ...answers, [id]: { ...answers[id], ...patch } });
  const toggle = (q: Question, option: string) => {
    const now = answers[q.id].selected;
    setAnswer(q.id, { selected: q.kind === "choice" ? [option] : now.includes(option) ? now.filter((o) => o !== option) : [...now, option] });
  };

  const missing = open?.questions.find((q) => q.required && !answers[q.id]?.text.trim() && !answers[q.id]?.selected.length);

  const submit = async () => {
    if (!open) return;
    setBusy(true); setError("");
    const r = await apiCall("POST", `/forms/${open.id}/submit`, {
      answers: open.questions.map((q) => ({ question_id: q.id, text: answers[q.id].text, selected: answers[q.id].selected })),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || ""); return; }
    setNotice("Your answers were saved.");
    setOpen(null);
    load();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Forms</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>Forms your teachers have asked you to fill in. You can answer each one once.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">{notice}</p>}

      {open ? (
        <GlassCard className="p-5 space-y-5">
          <div>
            <button className="text-sm font-bold text-blue-700 hover:underline" onClick={() => setOpen(null)}>Back to forms</button>
            <h2 className="text-xl font-bold">{open.title}</h2>
            {open.description && <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{open.description}</p>}
          </div>
          {open.questions.map((q) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="font-semibold text-sm">{q.prompt}{q.required && <span className="text-red-600"> *</span>}</legend>
              {q.kind === "short_text" && <input aria-label={q.prompt} className={field} style={border} maxLength={300} value={answers[q.id].text} onChange={(e) => setAnswer(q.id, { text: e.target.value })} />}
              {q.kind === "paragraph" && <textarea aria-label={q.prompt} rows={4} className={field} style={border} maxLength={2000} value={answers[q.id].text} onChange={(e) => setAnswer(q.id, { text: e.target.value })} />}
              {(q.kind === "choice" || q.kind === "checkbox") && q.options.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type={q.kind === "choice" ? "radio" : "checkbox"} name={`q${q.id}`} checked={answers[q.id].selected.includes(o)} onChange={() => toggle(q, o)} /> {o}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" disabled={busy || !!missing} onClick={submit}>{busy ? "Sending..." : "Submit answers"}</button>
            {missing && <span className="text-xs text-amber-700">Answer "{missing.prompt}" to submit.</span>}
          </div>
        </GlassCard>
      ) : loaded && forms.length === 0 ? (
        <GlassCard className="p-10 text-center space-y-2">
          <FileSignature className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
          <p className="font-semibold">No forms to fill in right now.</p>
        </GlassCard>
      ) : (
        <GlassCard className="divide-y" style={border}>
          {forms.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{f.title}</p>
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{f.classroom_name}</p>
              </div>
              {f.submitted
                ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">Answered</span>
                : <button className="btn btn-primary" onClick={() => start(f.id)}>Fill in</button>}
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
};
