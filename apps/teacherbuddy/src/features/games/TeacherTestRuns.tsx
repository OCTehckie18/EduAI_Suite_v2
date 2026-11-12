import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_BASE_URL, authHeaders } from "../../shared/utils/apiConfig";

interface TestRunSession {
  pin: string;
  quiz_title: string;
  status: string;
  is_test_run: boolean;
  players: Array<{ id: number; nickname: string }>;
}

export const TeacherTestRuns: React.FC = () => {
  const navigate = useNavigate();
  const [testRuns, setTestRuns] = useState<TestRunSession[]>([]);
  const [error, setError] = useState("");

  // A test run left open in the lobby stays on the dashboard until it is closed. Closing deletes the preview session
  // (it only ever has teachers in it, so no student result goes with it).
  const dismiss = async (pins: string[]) => {
    setError("");
    const results = await Promise.all(pins.map(async (pin) => {
      try {
        const res = await fetch(`${API_BASE_URL}/quizzes/sessions/${pin}`, { method: "DELETE", headers: authHeaders() });
        return res.ok || res.status === 404 ? pin : null;
      } catch {
        return null;
      }
    }));
    const closed = results.filter((pin): pin is string => pin !== null);
    setTestRuns((runs) => runs.filter((run) => !closed.includes(run.pin)));
    if (closed.length < pins.length) setError("Could not close every test run. Check your connection and try again.");
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/quizzes/sessions`, { headers: authHeaders() });
        if (!res.ok) return;
        const data: TestRunSession[] = await res.json();
        setTestRuns(data.filter((s) => s.is_test_run && ["lobby", "active"].includes(s.status)));
      } catch (err) {
        console.warn("Failed to load teacher test runs", err);
      }
    };
    load();
    const interval = window.setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  if (testRuns.length === 0) return null;

  return (
    <GlassCard className="border border-amber-200 bg-amber-50/70 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-amber-900">Teacher test runs</h2>
          <p className="text-sm font-medium text-amber-700">Preview quizzes privately before releasing them to students.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-900">{testRuns.length} open</span>
          <button onClick={() => void dismiss(testRuns.map((run) => run.pin))} className="rounded-full border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100">Dismiss all</button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {testRuns.map((run) => (
          <div key={run.pin} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <div>
              <p className="font-black text-gray-900">{run.quiz_title}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{run.status} · {run.players?.length || 0} teachers joined</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/games/quiz/test/${run.pin}`)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600">Join preview</button>
              <button onClick={() => void dismiss([run.pin])} aria-label={`Dismiss the test run of ${run.quiz_title}`} title="Dismiss" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"><X size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
