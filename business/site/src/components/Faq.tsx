import { ChevronDown } from "lucide-react";
import { Reveal } from "../effects";

export const FAQS = [
  {
    q: "Does every college really get its own copy?",
    a: "Yes. Each college gets its own installation with its own database, and its own four websites: the landing page, Master Admin, TeacherBuddy and EduGames. No college can see another college's data.",
  },
  {
    q: "How do students and teachers sign in?",
    a: "With Google, using the college email accounts they already have. Only the Google domains your college lists are accepted, students must also be on your admitted list, and teachers wait for approval from your administrators.",
  },
  {
    q: "Can we use our own colours, logo and web address?",
    a: "Yes. Administrators set the college name, logo and three colours in Master Admin, and all four websites follow, in light and dark mode. We can also put the websites on your own domain.",
  },
  {
    q: "Do we need our own IT team to run it?",
    a: "No. We set up and look after the installation. Your administrators only manage people, structure and branding from Master Admin.",
  },
  {
    q: "How much does it cost?",
    a: "It depends on the number of students and the plan. Request a demo and we will send a quote. Invoices are handled offline with your accounts office.",
  },
  {
    q: "Can we try it before committing the whole college?",
    a: "Yes. The Pilot plan lets one department use all three portals first.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-y py-20 sm:py-28" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="eyebrow">Questions</p>
          <h2 id="faq-title" className="section-title mt-3">Asked by colleges like yours</h2>
          <p className="mt-4 text-lg" style={{ color: "var(--text-sub)" }}>
            Something else on your mind? Add it to the demo request and we will answer it on the call.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            {FAQS.map((item) => (
              <details key={item.q} className="faq group px-5 py-1" style={{ borderColor: "var(--line)" }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold" style={{ color: "var(--text)" }}>
                  {item.q}
                  <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" style={{ color: "var(--text-dim)" }} aria-hidden="true" />
                </summary>
                <p className="pb-5 text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
