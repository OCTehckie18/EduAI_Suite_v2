/**
 * Drawn-in-code pictures of the portals. They show what each feature looks like; the names and
 * numbers inside them are sample content, not figures about this university.
 */
import type { ReactNode } from "react";
import { CalendarDays, Check, CheckCircle2, Clock, FileText, Timer, Trophy, Users } from "lucide-react";

export function Window({ title, children, className = "", tone = "page" }: { title: string; children: ReactNode; className?: string; tone?: "page" | "night" }) {
  const night = tone === "night";
  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-2xl ${className}`}
      style={night
        ? { background: "rgba(10, 15, 28, 0.92)", borderColor: "rgba(255,255,255,0.12)" }
        : { background: "var(--card)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: night ? "rgba(255,255,255,0.08)" : "var(--line)" }}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span
          className="ml-3 truncate rounded-md px-3 py-0.5 text-[11px] font-medium"
          style={night ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" } : { background: "var(--bg)", color: "var(--text-dim)" }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

const PLAYERS = [
  { name: "Ananya", score: 940 },
  { name: "Rohan", score: 880 },
  { name: "Meera", score: 815 },
  { name: "Kabir", score: 760 },
];

/** The live quiz screen students see in EduGames. Always dark: it sits in the hero. */
export function LiveQuizWindow() {
  const answers = ["Stack", "Queue", "Binary tree", "Hash map"];
  return (
    <Window title="EduGames · Live quiz" tone="night">
      <div className="grid gap-4 p-4 text-white sm:grid-cols-[1fr_11rem] sm:p-5">
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
            <span>Question 4 of 10</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white" style={{ background: "color-mix(in srgb, var(--color-brand-accent-fill, #0f766e) 70%, transparent)" }}>
              <Timer size={12} aria-hidden="true" /> 0:12
            </span>
          </div>
          <p className="mt-3 text-base font-bold leading-snug sm:text-lg">Which structure gives back items in the order they went in?</p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {answers.map((answer, index) => (
              <li
                key={answer}
                className="mock-lift flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
                style={index === 1
                  ? { borderColor: "var(--color-brand-gold-bright)", background: "color-mix(in srgb, var(--color-brand-gold) 22%, transparent)" }
                  : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10 text-[11px]">{"ABCD"[index]}</span>
                {answer}
                {index === 1 && <Check size={14} className="ml-auto" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            <Trophy size={12} aria-hidden="true" /> Leaderboard
          </p>
          <ol className="mt-3 space-y-2.5">
            {PLAYERS.map((player, index) => (
              <li key={player.name} className="text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{index + 1}. {player.name}</span>
                  <span className="text-white/60">{player.score}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="bar-grow h-full rounded-full" style={{ width: `${(player.score / 1000) * 100}%`, background: "linear-gradient(90deg, var(--color-brand-blue-fill, #0b4a87), var(--color-brand-gold-bright, #ee9f66))", animationDelay: `${index * 120}ms` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Window>
  );
}

/** Small glassy cards that float around the hero window. */
export function FloatingCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-white shadow-2xl backdrop-blur-md ${className}`} style={{ background: "rgba(15, 22, 40, 0.78)", borderColor: "rgba(255,255,255,0.14)" }}>
      {children}
    </div>
  );
}

const Pill = ({ children, tone }: { children: ReactNode; tone: "ok" | "warn" | "muted" }) => {
  const styles = {
    ok: { background: "var(--color-brand-accent-pale)", color: "var(--color-brand-accent)" },
    warn: { background: "var(--color-brand-gold-pale)", color: "var(--color-brand-gold-dark)" },
    muted: { background: "var(--bg)", color: "var(--text-dim)" },
  }[tone];
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={styles}>{children}</span>;
};

const Avatar = ({ name, index }: { name: string; index: number }) => (
  <span
    className="grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-bold text-white"
    style={{ borderColor: "var(--card)", background: ["var(--color-brand-blue-fill)", "var(--color-brand-accent-fill)", "var(--color-brand-gold-dark)", "var(--color-brand-blue-dark)"][index % 4] }}
  >
    {name.slice(0, 1)}
  </span>
);

export function ClassroomsMock() {
  const classes = [
    { name: "Data Structures", code: "MCA101", joined: 58, roster: 60 },
    { name: "Operating Systems", code: "MCA104", joined: 41, roster: 60 },
    { name: "Discrete Mathematics", code: "MCA102", joined: 60, roster: 60 },
  ];
  return (
    <Window title="TeacherBuddy · Classrooms">
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {classes.map((item, index) => (
          <div key={item.code} className={`mock-lift rounded-xl border p-4 ${index === 0 ? "sm:col-span-2" : ""}`} style={{ borderColor: "var(--line)", background: index === 0 ? "var(--color-brand-blue-pale)" : "var(--card)" }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold" style={{ color: "var(--text)" }}>{item.name}</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>MCA · 2025-27 · Section A</p>
              </div>
              <span className="rounded-lg border px-2 py-1 font-mono text-[11px] font-bold tracking-wider" style={{ borderColor: "var(--line)", color: "var(--color-brand-blue)", background: "var(--card)" }}>{item.code}</span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex -space-x-2">
                {["Ananya", "Rohan", "Meera", "Kabir"].map((name, i) => <Avatar key={name} name={name} index={i} />)}
              </div>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-sub)" }}>
                <Users size={13} aria-hidden="true" /> {item.joined} of {item.roster} joined
              </span>
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}

export function AssignmentsMock() {
  const rows: { name: string; file: string; status: string; tone: "ok" | "warn" | "muted" }[] = [
    { name: "Ananya Rao", file: "linked-lists.pdf", status: "Marked 18/20", tone: "ok" },
    { name: "Rohan Iyer", file: "assignment-2.pdf", status: "Handed in", tone: "muted" },
    { name: "Meera Shah", file: "lists_final.pdf", status: "Handed in late", tone: "warn" },
    { name: "Kabir Das", file: "", status: "Not handed in", tone: "muted" },
  ];
  return (
    <Window title="TeacherBuddy · Assignment 2: Linked lists">
      <div className="p-4">
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-sub)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>Marking progress</span>
          <span>1 of 3 handed in marked</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
          <div className="bar-grow h-full rounded-full" style={{ width: "33%", background: "var(--color-brand-blue-fill)" }} />
        </div>
        <ul className="mt-4 divide-y rounded-xl border" style={{ borderColor: "var(--line)" }}>
          {rows.map((row) => (
            <li key={row.name} className="mock-row flex items-center gap-3 px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)" }}>
              <FileText size={16} style={{ color: row.file ? "var(--color-brand-blue)" : "var(--text-dim)" }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" style={{ color: "var(--text)" }}>{row.name}</p>
                <p className="truncate text-xs" style={{ color: "var(--text-dim)" }}>{row.file || "Due Friday, 11:59 pm"}</p>
              </div>
              <Pill tone={row.tone}>{row.status}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

export function ExamsMock() {
  return (
    <Window title="EduGames · Mid-semester exam">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-bold" style={{ color: "var(--text)" }}>Data Structures · Mid-semester</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Question 3 of 12</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--color-brand-gold-pale)", color: "var(--color-brand-gold-dark)" }}>
            <Clock size={13} aria-hidden="true" /> 42:18 left
          </span>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < 2 ? "var(--color-brand-blue-fill)" : i === 2 ? "var(--color-brand-gold)" : "var(--line)" }} />
          ))}
        </div>
        <p className="mt-4 text-sm font-semibold" style={{ color: "var(--text)" }}>What is the worst-case time to search a balanced binary search tree of n keys?</p>
        <ul className="mt-3 space-y-2">
          {["O(1)", "O(log n)", "O(n)", "O(n log n)"].map((option, index) => (
            <li key={option} className="mock-lift flex items-center gap-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: index === 1 ? "var(--color-brand-blue)" : "var(--line)", background: index === 1 ? "var(--color-brand-blue-pale)" : "var(--card)", color: "var(--text)" }}>
              <span className="grid h-4 w-4 place-items-center rounded-full border" style={{ borderColor: index === 1 ? "var(--color-brand-blue)" : "var(--text-dim)" }}>
                {index === 1 && <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-brand-blue)" }} />}
              </span>
              <span className="font-mono">{option}</span>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

export function LiveGamesMock() {
  const words: [string, number][] = [["recursion", 1.9], ["pointers", 1.3], ["queues", 1.6], ["stacks", 1.1], ["trees", 1.45], ["graphs", 1], ["hashing", 1.25], ["sorting", 0.95], ["heaps", 0.9]];
  const colors = ["var(--color-brand-blue)", "var(--color-brand-accent)", "var(--color-brand-gold-dark)", "var(--text)"];
  return (
    <Window title="TeacherBuddy · Word cloud">
      <div className="p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold" style={{ color: "var(--text)" }}>Which topic needs another class?</span>
          <span className="rounded-md px-2 py-1 font-mono font-bold tracking-widest" style={{ background: "var(--bg)", color: "var(--text-sub)" }}>PIN 4821</span>
        </div>
        <div className="mt-4 flex min-h-[13rem] flex-wrap content-center items-center justify-center gap-x-4 gap-y-1 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          {words.map(([word, size], index) => (
            <span key={word} className="word-pop font-bold leading-tight" style={{ fontSize: `${size}rem`, color: colors[index % colors.length], animationDelay: `${index * 90}ms` }}>
              {word}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-xs" style={{ color: "var(--text-dim)" }}>Answers appear as students send them from their phones</p>
      </div>
    </Window>
  );
}

export function CalendarMock() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const events: { day: number; top: number; height: number; label: string; tone: string }[] = [
    { day: 0, top: 6, height: 28, label: "Data Structures", tone: "var(--color-brand-blue-pale)" },
    { day: 1, top: 40, height: 22, label: "Lab", tone: "var(--color-brand-accent-pale)" },
    { day: 2, top: 10, height: 30, label: "Exam: Mid-sem", tone: "var(--color-brand-gold-pale)" },
    { day: 3, top: 52, height: 20, label: "Office hours", tone: "var(--color-brand-accent-pale)" },
    { day: 4, top: 18, height: 26, label: "Live quiz", tone: "var(--color-brand-blue-pale)" },
  ];
  return (
    <Window title="TeacherBuddy · Calendar">
      <div className="p-4">
        <div className="grid grid-cols-5 gap-2">
          {days.map((day, index) => (
            <div key={day}>
              <p className="text-center text-[11px] font-semibold" style={{ color: "var(--text-dim)" }}>{day}</p>
              <div className="relative mt-2 h-36 rounded-lg border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                {events.filter((event) => event.day === index).map((event) => (
                  <div key={event.label} className="mock-lift absolute inset-x-1 rounded-md p-1.5 text-[10px] font-semibold leading-tight" style={{ top: `${event.top}%`, height: `${event.height}%`, background: event.tone, color: "var(--text)" }}>
                    {event.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mock-lift mt-4 flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
          <CalendarDays size={18} style={{ color: "var(--color-brand-blue)" }} aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold" style={{ color: "var(--text)" }}>Meera asked to meet</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Thursday, 3:30 pm · Project doubts</p>
          </div>
          <span className="rounded-lg px-2.5 py-1 text-xs font-bold text-white" style={{ background: "var(--color-brand-blue-fill)" }}>Accept</span>
          <span className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text-sub)" }}>Decline</span>
        </div>
      </div>
    </Window>
  );
}

/** For the students card: a short stack of what lands on a student's dashboard. */
export function StudentFeedMock() {
  const items = [
    { icon: <CheckCircle2 size={15} aria-hidden="true" />, title: "Assignment 2 handed in", meta: "Data Structures · on time", color: "var(--color-brand-accent)" },
    { icon: <Trophy size={15} aria-hidden="true" />, title: "Live quiz starting", meta: "Join with PIN 4821", color: "var(--color-brand-gold-dark)" },
    { icon: <Clock size={15} aria-hidden="true" />, title: "Mid-semester exam", meta: "Wednesday, 10:00 am", color: "var(--color-brand-blue)" },
    { icon: <CalendarDays size={15} aria-hidden="true" />, title: "Meeting accepted", meta: "Thursday, 3:30 pm · Project doubts", color: "var(--color-brand-accent)" },
    { icon: <FileText size={15} aria-hidden="true" />, title: "Assignment 1 marked", meta: "Operating Systems · 18 / 20", color: "var(--color-brand-gold-dark)" },
  ];
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={item.title} className="feed-item flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--card)", ["--i" as string]: index }}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--bg)", color: item.color }}>{item.icon}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
            <p className="truncate text-xs" style={{ color: "var(--text-dim)" }}>{item.meta}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
