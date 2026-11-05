import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

import { API_BASE_URL, authHeaders } from "../../shared/utils/apiConfig";

interface ReportOption {
  id: number;
  text: string;
  is_correct: boolean;
  count: number;
}
interface ReportQuestion {
  id: number;
  number: number;
  text: string;
  answered: number;
  correct: number;
  players: number;
  percent_correct: number | null;
  average_time_s: number | null;
  options: ReportOption[];
}
interface ReportAnswer {
  question_id: number;
  answered: boolean;
  option_text: string | null;
  is_correct: boolean;
  points: number;
  time_s: number | null;
}
interface ReportPlayer {
  rank: number;
  id: number;
  nickname: string;
  student: { name: string; register_no: string | null } | null;
  score: number;
  correct: number;
  answered: number;
  total: number;
  percent: number | null;
  average_time_s: number | null;
  answers: ReportAnswer[];
}
interface Report {
  session: { pin: string; quiz_title: string; status: string; is_test_run: boolean; played_at: string; players: number; questions: number };
  summary: { average_percent: number | null; highest_percent: number | null; lowest_percent: number | null };
  questions: ReportQuestion[];
  players: ReportPlayer[];
}

const pct = (value: number | null) => (value === null ? "Not recorded" : `${value}%`);

export const QuizReportPage: React.FC = () => {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/quizzes/sessions/${encodeURIComponent(pin || "")}/report`, { headers: authHeaders() });
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "That game could not be found. It may have been deleted or belong to another teacher." : "Could not load the results.");
          return;
        }
        const data = await res.json();
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError("Could not reach the server. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin]);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/sessions/${encodeURIComponent(pin || "")}/report?export=csv`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `quiz-${pin}-results.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the spreadsheet. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const back = (
    <button onClick={() => navigate("/games")} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900">
      <ArrowLeft size={16} /> Back to games
    </button>
  );

  if (error && !report) {
    return (
      <div className="space-y-4 p-4">
        {back}
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  const { session, summary } = report;
  return (
    <div className="space-y-6 p-4 max-w-6xl mx-auto">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{session.quiz_title}</h1>
          <p className="text-sm text-slate-500">
            PIN {session.pin} · played {new Date(session.played_at).toLocaleString()} · {session.players} players · {session.questions} questions
            {session.is_test_run && " · teacher test run"}
          </p>
        </div>
        <button
          onClick={downloadCsv}
          disabled={downloading || report.players.length === 0}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Download size={16} /> {downloading ? "Preparing..." : "Download spreadsheet"}
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      {session.status !== "completed" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          This game has not finished, so marks are not saved to students yet. The figures below are what has happened so far.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Average", summary.average_percent],
          ["Highest", summary.highest_percent],
          ["Lowest", summary.lowest_percent],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="text-2xl font-black text-slate-900">{pct(value as number | null)}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-900">By question</h2>
        {report.questions.length === 0 && <p className="text-sm text-slate-500">This quiz has no questions.</p>}
        {report.questions.map((q) => (
          <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-bold text-slate-900">
                {q.number}. {q.text || "Untitled question"}
              </p>
              <div className="text-right shrink-0">
                <p className="text-xl font-black text-slate-900">{pct(q.percent_correct)}</p>
                <p className="text-xs text-slate-500">
                  {q.correct} of {q.players} right{q.average_time_s !== null && ` · ${q.average_time_s}s average`}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-48 truncate ${o.is_correct ? "font-black text-green-700" : "text-slate-600"}`}>
                    {o.text || "(blank)"}
                    {o.is_correct && " ✓"}
                  </span>
                  <div className="h-3 flex-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${o.is_correct ? "bg-green-500" : "bg-slate-400"}`}
                      style={{ width: `${q.players ? (o.count / q.players) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-bold text-slate-700">{o.count}</span>
                </div>
              ))}
              {q.players - q.answered > 0 && <p className="text-xs text-slate-500">{q.players - q.answered} did not answer</p>}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-900">By player</h2>
        {report.players.length === 0 && <p className="text-sm text-slate-500">Nobody joined this game.</p>}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-widest text-slate-400">
                <th className="p-3">#</th>
                <th className="p-3">Player</th>
                <th className="p-3">Student</th>
                <th className="p-3 text-right">Points</th>
                <th className="p-3 text-right">Correct</th>
                <th className="p-3 text-right">Mark</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {report.players.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className="border-b border-slate-100">
                    <td className="p-3 font-black text-slate-400">{p.rank}</td>
                    <td className="p-3 font-bold text-slate-900">{p.nickname}</td>
                    <td className="p-3 text-slate-600">
                      {p.student ? `${p.student.name}${p.student.register_no ? ` (${p.student.register_no})` : ""}` : "Guest (not signed in)"}
                    </td>
                    <td className="p-3 text-right">{p.score}</td>
                    <td className="p-3 text-right">
                      {p.correct}/{p.total}
                    </td>
                    <td className="p-3 text-right font-black">{pct(p.percent)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => setOpen(open === p.id ? null : p.id)} className="text-xs font-bold text-blue-600 hover:underline">
                        {open === p.id ? "Hide answers" : "Show answers"}
                      </button>
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={7} className="p-3">
                        <ul className="space-y-1">
                          {p.answers.map((a, i) => (
                            <li key={a.question_id} className="flex items-center gap-3 text-xs">
                              <span className="w-8 font-black text-slate-400">Q{i + 1}</span>
                              <span className={`w-24 font-black ${!a.answered ? "text-slate-500" : a.is_correct ? "text-green-700" : "text-red-600"}`}>
                                {!a.answered ? "Not answered" : a.is_correct ? "Correct" : "Wrong"}
                              </span>
                              <span className="flex-1 truncate text-slate-600">{a.option_text || ""}</span>
                              {a.answered && (
                                <span className="text-slate-500">
                                  +{a.points} · {a.time_s}s
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
