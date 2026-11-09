import { ArrowRight, Building2, GraduationCap, Presentation, Rocket } from "lucide-react";
import { Reveal, trackSpotlight } from "../effects";
import type { Portal } from "../portals";

const STEPS = [
  {
    icon: <Building2 size={20} aria-hidden="true" />,
    who: "Administration",
    title: "Sets up the campus",
    text: "Adds the schools, departments and programmes, and uploads the list of admitted students.",
  },
  {
    icon: <Presentation size={20} aria-hidden="true" />,
    who: "Teachers",
    title: "Sign in and get approved",
    text: "Sign in to TeacherBuddy with a university Google account, complete the profile and wait for approval.",
  },
  {
    icon: <GraduationCap size={20} aria-hidden="true" />,
    who: "Students",
    title: "Confirm details and join",
    text: "Sign in to EduGames, check the details on record, set a password and join a class with its code.",
  },
  {
    icon: <Rocket size={20} aria-hidden="true" />,
    who: "Everyone",
    title: "Class is in session",
    text: "Assignments, exams, quizzes and live games run from there, with marks in one place.",
  },
];

export function Journey() {
  return (
    <section id="how-it-works" aria-labelledby="first-time" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="eyebrow">How it works</p>
        <h2 id="first-time" className="section-title mt-3">First time here?</h2>
        <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
          Four steps from an empty campus to a class that is up and running.
        </p>
      </Reveal>

      <ol className="journey relative mt-14 grid gap-5 md:grid-cols-4">
        <span className="journey-line pointer-events-none absolute hidden md:block" aria-hidden="true" />
        {STEPS.map((step, index) => (
          <Reveal key={step.title} as="li" delay={index * 120} className="relative">
            <div onMouseMove={trackSpotlight} className="spotlight step-card h-full rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="flex items-center justify-between">
                <span className="step-icon grid h-11 w-11 place-items-center rounded-xl text-white">{step.icon}</span>
                <span className="font-mono text-sm font-bold" style={{ color: "var(--text-dim)" }}>0{index + 1}</span>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-brand-blue)" }}>{step.who}</p>
              <h3 className="mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{step.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function CallToAction({ students, teachers }: { students: Portal; teachers: Portal }) {
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <Reveal>
        <div className="cta-panel relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12 sm:py-20">
          <div className="orb orb-a" aria-hidden="true" />
          <div className="orb orb-b" aria-hidden="true" />
          <div className="relative">
            <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">Pick your portal and sign in</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">Your classes, work and games are waiting on the other side.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <a href={students.url} className="btn-primary group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-bold text-white">
                Student sign in <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
              <a href={teachers.url} className="btn-ghost group inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3.5 font-semibold text-white">
                Teacher sign in <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
