import { CalendarCheck, FileSignature, Palette, Rocket, Server, Users } from "lucide-react";
import { Reveal } from "../effects";

const STEPS = [
  { icon: <CalendarCheck size={18} aria-hidden="true" />, title: "Demo call", text: "We walk your team through the three portals and answer questions about your setup." },
  { icon: <FileSignature size={18} aria-hidden="true" />, title: "Plan and agreement", text: "We agree the plan and number of seats. Invoicing is handled directly with your accounts office." },
  { icon: <Server size={18} aria-hidden="true" />, title: "Your installation", text: "We set up a server and database for your college alone, with web addresses on your own domain if you like." },
  { icon: <Palette size={18} aria-hidden="true" />, title: "Name, logo and colours", text: "Your administrators add the college's branding and the Google domains people sign in with." },
  { icon: <Users size={18} aria-hidden="true" />, title: "People", text: "Upload the admitted student list and approve your teachers as they sign up." },
  { icon: <Rocket size={18} aria-hidden="true" />, title: "First semester", text: "Teachers open classes, students join, and we stay on hand while everyone settles in." },
];

export function Onboarding() {
  return (
    <section id="onboarding" aria-labelledby="onboarding-title" className="scroll-mt-20 border-y py-20 sm:py-28" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">Getting started</p>
          <h2 id="onboarding-title" className="section-title mt-3">From first call to first class</h2>
          <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
            We do the setup with you, step by step. How long it takes depends on your college, so we plan the dates together on the demo call.
          </p>
        </Reveal>

        <ol className="timeline mt-12 grid gap-x-10 gap-y-8 md:grid-flow-col md:grid-cols-2 md:grid-rows-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} as="li" delay={index * 60} className="timeline-step relative flex gap-4">
              <div className="flex flex-col items-center">
                <span className="step-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white">{step.icon}</span>
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Step {index + 1}</p>
                <h3 className="mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{step.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
