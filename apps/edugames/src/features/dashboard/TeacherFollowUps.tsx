import React from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, ClipboardList, MessageSquareText, TrendingUp } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

interface FollowUps {
  formsToFill?: { id: number; title: string; courseCode: string }[];
  meetings?: { id: number; teacher: string; when: string; mode: string | null; agenda: string | null; bookedByTeacher: boolean }[];
  newFeedback?: { submissionId: number; assignment: string; courseId: number; courseCode: string; total: number; max: number; feedback: string; markedAt: string }[];
}

const when = (slot: string) => {
  const d = new Date(slot.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? slot : d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

/** Everything a teacher has set up that the student should see or act on, in one place. */
export const TeacherFollowUps: React.FC<{ summary: FollowUps | null }> = ({ summary }) => {
  const navigate = useNavigate();
  const forms = summary?.formsToFill || [];
  const meetings = summary?.meetings || [];
  const feedback = summary?.newFeedback || [];
  const nothing = !forms.length && !meetings.length && !feedback.length;

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title text-sm">From your teachers</h3>
        <button onClick={() => navigate("/progress")} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"><TrendingUp size={13} />My progress</button>
      </div>
      {nothing && <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Nothing new. Meetings, forms and marked work from your teachers will show here.</p>}

      {meetings.length > 0 && <div className="space-y-2">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><CalendarCheck size={13} />Meetings</p>
        {meetings.map((m) => (
          <button key={m.id} onClick={() => navigate("/appointments")} className="block w-full rounded-lg border p-2.5 text-left hover:bg-slate-50" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{m.agenda || "Meeting"} with {m.teacher}</p>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{when(m.when)}{m.mode ? ` · ${m.mode}` : ""}</p>
            {m.bookedByTeacher && <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800">Booked by your teacher</span>}
          </button>
        ))}
      </div>}

      {forms.length > 0 && <div className="space-y-2">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><ClipboardList size={13} />Forms to fill in</p>
        {forms.map((f) => (
          <button key={f.id} onClick={() => navigate("/forms")} className="flex w-full items-center justify-between rounded-lg border p-2.5 text-left hover:bg-slate-50" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{f.title}</span>
            <span className="text-xs text-slate-500">{f.courseCode}</span>
          </button>
        ))}
      </div>}

      {feedback.length > 0 && <div className="space-y-2">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><MessageSquareText size={13} />New feedback</p>
        {feedback.map((f) => (
          <button key={f.submissionId} onClick={() => navigate("/classroom", { state: { courseId: f.courseId } })} className="block w-full rounded-lg border p-2.5 text-left hover:bg-slate-50" style={{ borderColor: "var(--color-border)" }}>
            <p className="flex justify-between text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}><span>{f.assignment}</span><span>{f.total} / {f.max}</span></p>
            {f.feedback && <p className="text-xs line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{f.feedback}</p>}
          </button>
        ))}
      </div>}
    </GlassCard>
  );
};
