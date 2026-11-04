import React, { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Download, RefreshCw, Send, Users, X, Upload, FileText, CheckCircle, AlertTriangle, Eye, Trash2 } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Report {
  id: string;
  name: string;
  type: string;
  date: string;
  status: string;
  content: string | null;
}

/** The message a failed request carries, in the app's error shape or plain DRF's. */
const messageFrom = async (res: Response, fallback: string): Promise<string> => {
  const body = await res.json().catch(() => ({}));
  return body.detail || body.error?.message || fallback;
};

const asList = (data: unknown): any[] => (Array.isArray(data) ? data : []);

/** A responsive, scrollable dialog: it never grows past the screen, and its content scrolls on small screens. */
const Dialog: React.FC<{ title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, subtitle, onClose, wide, children }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} my-auto rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto`}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-7">{children}</div>
    </div>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">{children}</label>
);

const ErrorLine: React.FC<{ message: string }> = ({ message }) =>
  message ? (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  ) : null;

/** Report text uses **bold**; this renders it as elements, so nothing in a report can inject HTML. */
const RichLine: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i} className="text-slate-900">{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>))}
  </>
);

const ReportBody: React.FC<{ content: string }> = ({ content }) => (
  <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">
    {content.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />;
      if (line.startsWith("# ")) return <h3 key={i} className="pt-1 text-lg font-bold text-slate-900"><RichLine text={line.slice(2)} /></h3>;
      if (line.startsWith("## ")) return <h4 key={i} className="pt-3 text-sm font-bold uppercase tracking-wider text-slate-500"><RichLine text={line.slice(3)} /></h4>;
      if (line.startsWith("- ")) return <p key={i} className="flex gap-2 pl-1"><span className="text-slate-400">•</span><span><RichLine text={line.slice(2)} /></span></p>;
      return <p key={i}><RichLine text={line} /></p>;
    })}
  </div>
);

const selectClass = "w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent";
const primaryBtn = "btn btn-primary w-full h-11 flex items-center justify-center gap-2 disabled:opacity-50";

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadError, setLoadError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportType, setReportType] = useState("Student Report");
  const [targetId, setTargetId] = useState<number | "">("");
  const [dialogError, setDialogError] = useState("");

  const [sendFor, setSendFor] = useState<Report | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [viewing, setViewing] = useState<Report | null>(null);

  const [eventOpen, setEventOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [eventStudent, setEventStudent] = useState<number | "">("");
  const [eventResult, setEventResult] = useState<{ id: string; missing: string[] } | null>(null);

  const fetchReports = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.REPORTS);
      if (!res.ok) throw new Error(await messageFrom(res, "Could not load your reports."));
      setReports(asList(await res.json()));
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your reports.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([fetch(API_ENDPOINTS.COURSES), fetch(API_ENDPOINTS.STUDENTS)]);
      if (c.ok) setCourses(asList(await c.json()));
      if (s.ok) setStudents(asList(await s.json()));
    } catch {
      /* the pickers show their own empty state */
    }
  }, []);

  useEffect(() => {
    void fetchReports();
    void fetchMeta();
  }, [fetchReports, fetchMeta]);

  const targets = reportType === "Student Report" ? students : courses;
  // Keep the selection valid for the chosen type.
  useEffect(() => {
    setTargetId(targets.length > 0 ? targets[0].id : "");
  }, [reportType, courses.length, students.length]);

  const openGenerate = (type: string) => {
    setReportType(type);
    setDialogError("");
    setGenerateOpen(true);
  };

  const generate = async () => {
    if (targetId === "") return;
    setBusy(true);
    setDialogError("");
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: reportType, target_id: targetId }),
      });
      if (!res.ok) throw new Error(await messageFrom(res, "Could not generate the report."));
      const created: Report = await res.json();
      setGenerateOpen(false);
      setNotice({ kind: "ok", text: `${created.name} is ready.` });
      await fetchReports();
      setViewing(created);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (id: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/${id}/download`);
      if (!res.ok) throw new Error(await messageFrom(res, "Could not download the report."));
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${id}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not download the report." });
    }
  };

  const remove = async (report: Report) => {
    if (!window.confirm(`Delete "${report.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/${report.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await messageFrom(res, "Could not delete the report."));
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setNotice({ kind: "ok", text: "Report deleted." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not delete the report." });
    }
  };

  const send = async () => {
    if (!sendFor) return;
    if (!sendEmail.trim()) {
      setDialogError("Enter the recipient's email address.");
      return;
    }
    setBusy(true);
    setDialogError("");
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/${sendFor.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmail.trim() }),
      });
      if (!res.ok) throw new Error(await messageFrom(res, "The report could not be sent."));
      const body = await res.json();
      setSendFor(null);
      setNotice({ kind: "ok", text: body.message || "Report sent." });
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "The report could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const generateEvent = async () => {
    if (!notes.trim()) {
      setDialogError("Add the meeting or event notes before generating the report.");
      return;
    }
    setBusy(true);
    setDialogError("");
    try {
      const form = new FormData();
      form.append("meeting_notes", notes);
      if (eventStudent !== "") form.append("target_id", String(eventStudent));
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/generate-event`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await messageFrom(res, "Could not generate the event report."));
      const body = await res.json();
      setEventResult({ id: body.report_id, missing: body.fields_requiring_teacher || [] });
      void fetchReports();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Could not generate the event report.");
    } finally {
      setBusy(false);
    }
  };

  const closeEvent = () => {
    setEventOpen(false);
    setNotes("");
    setEventStudent("");
    setEventResult(null);
    setDialogError("");
  };

  const cards = [
    { type: "Class Report", title: "Class-Level Reports", desc: "Enrolment, class average, assignment and exam results, and who needs support.", icon: <Users size={20} />, tone: "bg-brand-blue/10 text-brand-blue" },
    { type: "Student Report", title: "Student Reports", desc: "One student's marks per course, exam results, strengths and areas to improve.", icon: <FileSpreadsheet size={20} />, tone: "bg-brand-gold/15 text-brand-gold-dark" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Report Generation Center</h1>
          <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>Reports built from your classes' real marks, ready to download or email.</p>
        </div>
        <button onClick={() => openGenerate("Student Report")} className="btn btn-primary shadow-lg flex items-center gap-2">
          <FileSpreadsheet size={16} /> New Report
        </button>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`} role="status">
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((item) => (
          <GlassCard key={item.type} className="p-6">
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${item.tone}`}>{item.icon}</div>
            <h3 className="mb-2 text-lg font-bold font-display" style={{ color: "var(--color-text-primary)" }}>{item.title}</h3>
            <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{item.desc}</p>
            <button onClick={() => openGenerate(item.type)} className="text-sm font-bold uppercase tracking-wider text-brand-blue hover:text-brand-blue-dark">Generate &rarr;</button>
          </GlassCard>
        ))}
        <GlassCard className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent"><Upload size={20} /></div>
          <h3 className="mb-2 text-lg font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Event Reports</h3>
          <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>Turn meeting or event notes into an activity report. Anything the notes don't say is left for you to complete.</p>
          <button onClick={() => { setDialogError(""); setEventOpen(true); }} className="text-sm font-bold uppercase tracking-wider text-brand-accent hover:text-brand-accent-dark">Create Event Report &rarr;</button>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Your Reports</h2>
          <button onClick={() => void fetchReports()} className="flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"><RefreshCw size={13} className={listLoading ? "animate-spin" : ""} /> Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">ID</th>
                <th className="px-6 py-3 font-semibold">Report</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Generated</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadError ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-red-600">{loadError} <button onClick={() => void fetchReports()} className="ml-2 underline">Retry</button></td></tr>
              ) : listLoading && reports.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading your reports...</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">You haven't generated any reports yet.</td></tr>
              ) : reports.map((rep) => (
                <tr key={rep.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-400">{rep.id}</td>
                  <td className="px-6 py-3.5 font-semibold" style={{ color: "var(--color-text-primary)" }}>{rep.name}</td>
                  <td className="px-6 py-3.5 text-slate-600">{rep.type}</td>
                  <td className="px-6 py-3.5 text-slate-600">{rep.date}</td>
                  <td className="space-x-1 px-6 py-3.5 text-right">
                    <button onClick={() => setViewing(rep)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-blue" title="View" aria-label={`View ${rep.name}`}><Eye size={16} /></button>
                    <button onClick={() => void download(rep.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-blue" title="Download (.docx)" aria-label={`Download ${rep.name}`}><Download size={16} /></button>
                    <button onClick={() => { setSendFor(rep); setSendEmail(""); setDialogError(""); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-blue" title="Email" aria-label={`Email ${rep.name}`}><Send size={16} /></button>
                    <button onClick={() => void remove(rep)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete" aria-label={`Delete ${rep.name}`}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {generateOpen && (
        <Dialog title="Generate Report" subtitle="Built from the marks recorded for your classes." onClose={() => setGenerateOpen(false)}>
          <div>
            <FieldLabel>Report type</FieldLabel>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={selectClass}>
              <option value="Student Report">Student Report</option>
              <option value="Class Report">Class Report</option>
            </select>
          </div>
          <div>
            <FieldLabel>{reportType === "Student Report" ? "Student" : "Course"}</FieldLabel>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : "")} disabled={targets.length === 0} className={`${selectClass} disabled:bg-slate-50`}>
              {targets.length === 0 && <option value="">{reportType === "Student Report" ? "No students in your classes yet" : "You have no courses yet"}</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {reportType === "Student Report" ? `${t.name} - ${t.registration_number || t.id}` : `${t.code ? `${t.code} - ` : ""}${t.name}`}
                </option>
              ))}
            </select>
          </div>
          <ErrorLine message={dialogError} />
          <button onClick={() => void generate()} disabled={busy || targetId === ""} className={primaryBtn}>
            {busy ? <RefreshCw size={18} className="animate-spin" /> : <><FileSpreadsheet size={18} /> Generate report</>}
          </button>
        </Dialog>
      )}

      {sendFor && (
        <Dialog title="Email report" subtitle={sendFor.name} onClose={() => setSendFor(null)}>
          <div>
            <FieldLabel>Recipient email</FieldLabel>
            <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="parent@example.com" className={selectClass} autoFocus />
          </div>
          <ErrorLine message={dialogError} />
          <button onClick={() => void send()} disabled={busy} className={primaryBtn}>
            {busy ? <RefreshCw size={18} className="animate-spin" /> : <><Send size={18} /> Send report</>}
          </button>
        </Dialog>
      )}

      {viewing && (
        <Dialog title={viewing.name} subtitle={`${viewing.type} · generated ${viewing.date}`} onClose={() => setViewing(null)} wide>
          <ReportBody content={viewing.content || "This report is empty."} />
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <button onClick={() => void download(viewing.id)} className="btn btn-outline flex items-center gap-2"><Download size={16} /> Download .docx</button>
            <button onClick={() => { const r = viewing; setViewing(null); setSendFor(r); setSendEmail(""); setDialogError(""); }} className="btn btn-primary flex items-center gap-2"><Send size={16} /> Email</button>
          </div>
        </Dialog>
      )}

      {eventOpen && (
        <Dialog title="Event Report" subtitle="Create an activity report from meeting or event notes." onClose={closeEvent} wide>
          {eventResult ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle size={20} /> Event report generated</div>
              {eventResult.missing.length > 0 ? (
                <p className="text-sm text-amber-800">The notes didn't mention: {eventResult.missing.map((m) => m.replace(/_/g, " ")).join(", ")}. They are marked "to be completed" in the report, so fill them in after downloading.</p>
              ) : (
                <p className="text-sm text-slate-700">Every field was found in your notes.</p>
              )}
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void download(eventResult.id)} className="btn btn-primary flex items-center gap-2"><Download size={16} /> Download .docx</button>
                <button onClick={closeEvent} className="btn btn-outline">Done</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>Notes</FieldLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={10}
                  placeholder={"Write one detail per line, for example:\nEvent: Guest lecture on AI\nDate: 12 Oct 2026\nVenue: Seminar Hall\nGuests: Dr. Rao\nHighlights: ...\nFeedback: ..."}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent"
                />
                <p className="mt-1 text-xs text-slate-500">Lines like "Venue: Seminar Hall" are picked up automatically: type, title, date, time, venue, guests, participants, highlights, takeaways, feedback and follow-up.</p>
              </div>
              <div>
                <FieldLabel>Student (optional)</FieldLabel>
                <select value={eventStudent} onChange={(e) => setEventStudent(e.target.value ? Number(e.target.value) : "")} className={selectClass}>
                  <option value="">None</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.registration_number || s.id}</option>)}
                </select>
              </div>
              <ErrorLine message={dialogError} />
              <button onClick={() => void generateEvent()} disabled={busy || !notes.trim()} className={primaryBtn}>
                {busy ? <RefreshCw size={18} className="animate-spin" /> : <><FileText size={18} /> Generate event report</>}
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
};
