import { Database, KeyRound, ListChecks, Server, UserCheck } from "lucide-react";
import { Reveal, trackSpotlight } from "../effects";

const GATES = [
  {
    icon: <KeyRound size={18} aria-hidden="true" />,
    title: "Only your Google domains",
    text: "Sign-in uses Google, limited to the email domains your college lists, such as staff and student domains.",
  },
  {
    icon: <ListChecks size={18} aria-hidden="true" />,
    title: "Students must be on the admitted list",
    text: "Your administrators upload who was admitted. A student who is not on it cannot get in, even with a college email.",
  },
  {
    icon: <UserCheck size={18} aria-hidden="true" />,
    title: "Your college approves teachers",
    text: "A teacher who signs up waits until someone in Master Admin approves them. Until then they cannot see a class.",
  },
];

function Stack({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      <p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{name}</p>
      <div className="mt-3 space-y-2 text-xs" style={{ color: "var(--text-sub)" }}>
        <p className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
          <Server size={14} style={{ color: "var(--color-brand-blue)" }} aria-hidden="true" /> Its own server
        </p>
        <p className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
          <Database size={14} style={{ color: "var(--color-brand-accent)" }} aria-hidden="true" /> Its own database
        </p>
      </div>
    </div>
  );
}

export function DataSection() {
  return (
    <section id="data" aria-labelledby="data-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="eyebrow">Your data stays yours</p>
        <h2 id="data-title" className="section-title mt-3">Each college runs on its own installation</h2>
        <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
          We do not put several colleges into one shared database. Your students, marks and files live in an installation set up for your college alone.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Reveal>
          <div onMouseMove={trackSpotlight} className="spotlight h-full rounded-3xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--card)", ["--spot" as string]: "var(--color-brand-accent)" }}>
            <h3 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Separate by design</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-sub)" }}>
              Two colleges on EduAI Suite share the software, never the data. Nothing connects one installation to another.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3" aria-hidden="true">
              <Stack name="College A" />
              <Stack name="College B" />
            </div>
            <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>No shared tables, no shared sign-in</p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="h-full rounded-3xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <h3 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Who can sign in</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-sub)" }}>Three checks stand between the internet and your campus.</p>
            <ol className="relative mt-6 space-y-6 border-l pl-6" style={{ borderColor: "var(--line)" }}>
              {GATES.map((gate) => (
                <li key={gate.title} className="relative">
                  <span className="absolute -left-[2.45rem] grid h-8 w-8 place-items-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--color-brand-blue-pale)", color: "var(--color-brand-blue)" }}>
                    {gate.icon}
                  </span>
                  <p className="font-bold" style={{ color: "var(--text)" }}>{gate.title}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-sub)" }}>{gate.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
