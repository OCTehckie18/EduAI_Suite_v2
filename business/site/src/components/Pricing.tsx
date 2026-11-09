import { ArrowRight, Check } from "lucide-react";
import { Reveal, trackSpotlight } from "../effects";

const PLANS = [
  {
    name: "Pilot",
    for: "Try it with one department",
    points: ["One department or programme", "All three portals", "Your own installation", "Setup help from our team"],
    featured: false,
  },
  {
    name: "Campus",
    for: "The whole college",
    points: ["Every department and batch", "All three portals and your landing page", "Your name, logo, colours and domains", "Onboarding and teacher training", "Support during term"],
    featured: true,
  },
  {
    name: "Group",
    for: "Several colleges or campuses",
    points: ["A separate installation per college", "Shared setup and support contact", "Plans to suit each campus"],
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="eyebrow">Pricing</p>
        <h2 id="pricing-title" className="section-title mt-3">Priced for your college</h2>
        <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
          Prices depend on the number of students and how much setup you need. Tell us about your college and we will send a quote, with invoicing done directly with your accounts office.
        </p>
      </Reveal>

      <Reveal delay={100}>
        <ul className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_1.15fr_1fr]">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              onMouseMove={trackSpotlight}
              className={`spotlight flex flex-col rounded-3xl border p-6 sm:p-7 ${plan.featured ? "plan-featured" : ""}`}
              style={{ borderColor: plan.featured ? "var(--color-brand-blue)" : "var(--line)", background: "var(--card)", ["--spot" as string]: "var(--color-brand-blue)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{plan.name}</h3>
                {plan.featured && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--color-brand-blue-pale)", color: "var(--color-brand-blue)" }}>Most colleges</span>
                )}
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-sub)" }}>{plan.for}</p>
              <p className="mt-6 text-3xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Contact us</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Quoted per college</p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm" style={{ color: "var(--text-sub)" }}>
                    <Check size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-brand-accent)" }} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
              <a
                href="#demo"
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${plan.featured ? "btn-primary text-white" : "border"}`}
                style={plan.featured ? undefined : { borderColor: "var(--line)", color: "var(--text)" }}
              >
                Ask about {plan.name} <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
