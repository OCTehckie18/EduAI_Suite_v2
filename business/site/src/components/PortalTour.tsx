/** A tour of the three portals, built on the same rotating tabs as the campus landing page's Features. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Gamepad2, Presentation, ShieldCheck } from "lucide-react";
import { prefersReducedMotion, Reveal } from "../effects";
import { AdminMock, AssignmentsMock, ClassroomsMock, ExamsMock, LiveGamesMock } from "./Mockups";

interface Portal {
  id: string;
  tab: string;
  audience: string;
  icon: ReactNode;
  title: string;
  points: string[];
  visuals: ReactNode[];
}

const PORTALS: Portal[] = [
  {
    id: "admin",
    tab: "Master Admin",
    audience: "For the administration",
    icon: <ShieldCheck size={16} aria-hidden="true" />,
    title: "Decide who belongs on your campus",
    points: [
      "Upload the list of admitted students. Only students on it can sign in.",
      "Approve each teacher who signs up before they can open a class.",
      "Set your departments, programmes and batches, and your college's name, logo and colours.",
    ],
    visuals: [<AdminMock key="admin" />],
  },
  {
    id: "teacherbuddy",
    tab: "TeacherBuddy",
    audience: "For teachers",
    icon: <Presentation size={16} aria-hidden="true" />,
    title: "Run a class from the first code to the last mark",
    points: [
      "Create classes and share a code so students can join.",
      "Collect assignments, preview them in the browser and mark them.",
      "Plan classes, exams and student meetings on one calendar.",
    ],
    visuals: [<ClassroomsMock key="classes" />, <AssignmentsMock key="assign" />],
  },
  {
    id: "edugames",
    tab: "EduGames",
    audience: "For students",
    icon: <Gamepad2 size={16} aria-hidden="true" />,
    title: "Where students sit exams and play along",
    points: [
      "Timed exams with the time left always in view.",
      "Live quizzes with a leaderboard, joined with a PIN from a phone.",
      "Word clouds and answer games the whole room plays at once.",
    ],
    visuals: [<ExamsMock key="exam" />, <LiveGamesMock key="games" />],
  },
];

const ROTATE_MS = 9000;

export function PortalTour() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) setAuto(false);
  }, []);

  useEffect(() => {
    if (!auto || paused) return;
    const timer = window.setTimeout(() => setActive((index) => (index + 1) % PORTALS.length), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [active, auto, paused]);

  const choose = (index: number, focus = false) => {
    setAuto(false);
    setActive(index);
    if (focus) tabs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = PORTALS.length - 1;
    const next = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(next < 0 ? last : next > last ? 0 : next, true);
  };

  const portal = PORTALS[active];

  return (
    <section id="portals" aria-labelledby="portals-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 id="portals-title" className="section-title mt-3">Three portals, one campus</h2>
          <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
            Administrators, teachers and students each get a portal built for their part of the semester. Everyone signs in with the college Google account they already have.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div role="tablist" aria-label="Portals" className="tab-strip mt-10 flex gap-2 overflow-x-auto pb-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {PORTALS.map((item, index) => {
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
          id={`panel-${portal.id}`}
          aria-labelledby={`tab-${portal.id}`}
          className="mt-8 grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={`text-${portal.id}`} className="panel-in lg:pt-4">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{portal.audience}</p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>{portal.title}</h3>
            <ul className="mt-6 space-y-4">
              {portal.points.map((point) => (
                <li key={point} className="flex gap-3 text-base" style={{ color: "var(--text-sub)" }}>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: "var(--color-brand-blue-pale)", color: "var(--color-brand-blue)" }}>
                    <Check size={14} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div key={`visual-${portal.id}`} className="panel-in panel-in-late visual-frame space-y-4" aria-hidden="true">
            {portal.visuals}
          </div>
        </div>
      </div>
    </section>
  );
}
