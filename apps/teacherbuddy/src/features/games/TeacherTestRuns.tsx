import React, { useEffect, useState } from "react";
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
    const interval = window.setInterval(load, 15000);
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
        <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-900">{testRuns.length} open</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {testRuns.map((run) => (
          <div key={run.pin} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <div>
              <p className="font-black text-gray-900">{run.quiz_title}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{run.status} · {run.players?.length || 0} teachers joined</p>
            </div>
            <button onClick={() => navigate(`/games/quiz/test/${run.pin}`)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600">Join preview</button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
