import { ArrowRight, CheckCircle2, ShieldCheck, ListChecks } from "lucide-react";
import { usePointerVars } from "../effects";
import { FloatingCard, LiveQuizWindow } from "./Mockups";

export function Hero() {
  const ref = usePointerVars<HTMLElement>();

  return (
    <section id="top" ref={ref} aria-labelledby="hero-title" className="hero relative overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="orb orb-a" aria-hidden="true" />
      <div className="orb orb-b" aria-hidden="true" />
      <div className="orb orb-c" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-32 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-40">
        <div>
          <p className="hero-chip inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-white/80">
            <span className="pulse-dot h-2 w-2 rounded-full" aria-hidden="true" />
            For universities and colleges
          </p>
          <h1 id="hero-title" className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl xl:text-6xl">
            The digital campus for <span className="gradient-text">your university</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
            EduAI Suite gives your college an admin portal, a teaching portal and a student portal for classes, assignments, exams and live quizzes. Each one carries your name and colours and runs on an installation of its own.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#demo" className="btn-primary group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold text-white">
              Request a demo <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
            <a href="#portals" className="btn-ghost group inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-base font-semibold text-white">
              See how it works <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="hero-stage relative mx-auto w-full max-w-xl lg:max-w-none" aria-hidden="true">
          <div className="hero-tilt">
            <div className="hero-glow" />
            <LiveQuizWindow />
          </div>

          <div className="parallax-1 absolute -left-4 top-[-1.75rem] hidden sm:block lg:-left-10">
            <div className="float">
              <FloatingCard>
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <CheckCircle2 size={15} className="text-emerald-300" /> Assignment handed in
                </p>
                <p className="mt-0.5 pl-6 text-[11px] text-white/60">Linked lists · on time</p>
              </FloatingCard>
            </div>
          </div>

          <div className="parallax-2 absolute -bottom-16 left-4 lg:-left-8">
            <div className="float float-delay-1">
              <FloatingCard>
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <ShieldCheck size={15} style={{ color: "var(--color-brand-gold-bright)" }} /> Teacher approved
                </p>
                <p className="mt-0.5 pl-6 text-[11px] text-white/60">Master Admin · Computer Science</p>
              </FloatingCard>
            </div>
          </div>

          <div className="parallax-3 absolute -right-2 -top-10 hidden md:block lg:-right-8">
            <div className="float float-delay-2">
              <FloatingCard className="w-52">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <ListChecks size={15} style={{ color: "var(--color-brand-gold-bright)" }} /> Marking progress
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="bar-grow h-full w-3/4 rounded-full" style={{ background: "var(--color-brand-gold-bright)" }} />
                </div>
                <p className="mt-1.5 text-[11px] text-white/60">Sample class · 3 of 4 marked</p>
              </FloatingCard>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-24" aria-hidden="true" />
    </section>
  );
}
