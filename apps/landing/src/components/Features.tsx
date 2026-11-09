import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, CalendarDays, ClipboardCheck, FileText, Gamepad2, Check } from "lucide-react";
import { prefersReducedMotion, Reveal } from "../effects";
import { AssignmentsMock, CalendarMock, ClassroomsMock, ExamsMock, LiveGamesMock } from "./Mockups";

interface Feature {
  id: string;
  tab: string;
  icon: ReactNode;
  title: string;
  points: string[];
  visual: ReactNode;
}

const FEATURES: Feature[] = [
  {
    id: "classrooms",
    tab: "Classrooms",
    icon: <BookOpen size={16} aria-hidden="true" />,
    title: "Set up a class in minutes",
    points: [
      "Create a class from scratch, or fill it in from a course plan.",
      "Students join with the class code you share.",
      "See who has joined and who on the roster has not yet.",
    ],
    visual: <ClassroomsMock />,
  },
  {
    id: "assignments",
    tab: "Assignments",
    icon: <FileText size={16} aria-hidden="true" />,
    title: "Hand in, preview and mark",
    points: [
      "Students upload their work before the deadline.",
      "Open each submission in the browser, no downloads needed.",
      "Marking progress shows what is left for each class.",
    ],
    visual: <AssignmentsMock />,
  },
  {
    id: "exams",
    tab: "Exams",
    icon: <ClipboardCheck size={16} aria-hidden="true" />,
    title: "Timed exams students sit online",
    points: [
      "Schedule an exam for a class with a fixed duration.",
      "Students see the time left and move between questions.",
      "Answers come back to the teacher in one place.",
    ],
    visual: <ExamsMock />,
  },
  {
    id: "live",
    tab: "Live games",
    icon: <Gamepad2 size={16} aria-hidden="true" />,
    title: "Quizzes and games the whole room plays",
    points: [
      "Build quizzes once in the library and reuse them.",
      "Run live quizzes with a leaderboard, chain answer games and word clouds.",
      "Students join with a PIN from their phone.",
    ],
    visual: <LiveGamesMock />,
  },
  {
    id: "calendar",
    tab: "Calendar",
    icon: <CalendarDays size={16} aria-hidden="true" />,
    title: "Classes, exams and meetings on one calendar",
    points: [
      "Add classes, exams and events to the calendar.",
      "Students ask to meet; teachers accept or decline.",
      "Both sides get a notification when something changes.",
    ],
    visual: <CalendarMock />,
  },
];

const ROTATE_MS = 8000;

export function Features() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) setAuto(false);
  }, []);

  useEffect(() => {
    if (!auto || paused) return;
    const timer = window.setTimeout(() => setActive((index) => (index + 1) % FEATURES.length), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [active, auto, paused]);

  const choose = (index: number, focus = false) => {
    setAuto(false);
    setActive(index);
    if (focus) tabs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = FEATURES.length - 1;
    const next = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(next < 0 ? last : next > last ? 0 : next, true);
  };

  const feature = FEATURES[active];

  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 border-y py-20 sm:py-28" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">What you can do</p>
          <h2 id="features-title" className="section-title mt-3">Everything a semester needs</h2>
          <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
            From the first class code to the last mark, the work stays in the same place for teachers and students.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div role="tablist" aria-label="Features" className="tab-strip mt-10 flex gap-2 overflow-x-auto pb-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {FEATURES.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.id}
                  ref={(el) => { tabs.current[index] = el; }}
                  type="button"
                  role="tab"
                  id={`tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(index)}
                  onKeyDown={onKeyDown}
                  className={`feature-tab relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-full border px-4 py-2 text-sm font-semibold ${selected ? "is-active" : ""}`}
                >
                  {item.icon}
                  {item.tab}
                  {selected && auto && (
                    <span key={`${active}-${paused}`} className={`tab-progress absolute inset-x-0 bottom-0 h-0.5 origin-left ${paused ? "is-paused" : ""}`} style={{ animationDuration: `${ROTATE_MS}ms` }} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div
          role="tabpanel"
          id={`panel-${feature.id}`}
          aria-labelledby={`tab-${feature.id}`}
          className="mt-8 grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={`text-${feature.id}`} className="panel-in">
            <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>{feature.title}</h3>
            <ul className="mt-6 space-y-4">
              {feature.points.map((point) => (
                <li key={point} className="flex gap-3 text-base" style={{ color: "var(--text-sub)" }}>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: "var(--color-brand-blue-pale)", color: "var(--color-brand-blue)" }}>
                    <Check size={14} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div key={`visual-${feature.id}`} className="panel-in panel-in-late visual-frame" aria-hidden="true">
            {feature.visual}
          </div>
        </div>
      </div>
    </section>
  );
}
