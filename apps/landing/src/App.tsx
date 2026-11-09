import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { ThemeToggle } from "./shared/ThemeToggle";
import { logoSrc, logoVariant, useDocumentTitle, useUniversity } from "./shared/university";
import { API_BASE_URL } from "./shared/utils/apiConfig";
import { portals, type Portal } from "./portals";

const FALLBACK_LOGO = "/eduai_logo.png";

/** Whether the backend answers. The portal links work either way; this only sets expectations. */
function useBackendUp(): boolean | null {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/health/`)
      .then((res) => { if (!cancelled) setUp(res.ok); })
      .catch(() => { if (!cancelled) setUp(false); });
    return () => { cancelled = true; };
  }, []);
  return up;
}

function PortalRow({ portal, primary }: { portal: Portal; primary: boolean }) {
  return (
    <li
      className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${primary ? "sm:p-7" : ""}`}
      style={{
        borderColor: primary ? "var(--color-brand-blue)" : "var(--line)",
        background: primary ? "var(--color-brand-blue-pale)" : "var(--card)",
      }}
    >
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{portal.audience}</p>
        <h3 className={`font-bold ${primary ? "text-2xl" : "text-lg"}`} style={{ color: "var(--text)" }}>{portal.name}</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-sub)" }}>{portal.summary}</p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>{portal.note}</p>
      </div>
      {portal.id === "admin" ? (
        <a href={portal.url} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline" style={{ color: "var(--color-brand-blue)" }}>
          {portal.action} <ArrowRight size={16} aria-hidden="true" />
        </a>
      ) : (
        <a
          href={portal.url}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-4"
          style={{ background: primary ? "var(--color-brand-blue-fill, var(--color-brand-blue))" : "var(--color-brand-blue-dark)", ["--tw-ring-color" as string]: "var(--color-brand-accent)" }}
        >
          {portal.action} <ArrowRight size={16} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

const STEPS: { who: string; steps: string[] }[] = [
  {
    who: "Students",
    steps: [
      "Sign in to EduGames with your university Google account.",
      "Check the details the university has on record for you and set a password.",
      "Join a class with the code your teacher gives you.",
    ],
  },
  {
    who: "Teachers",
    steps: [
      "Sign in to TeacherBuddy with your university Google account.",
      "Complete your profile: department, employee number and a password.",
      "Wait for the administration to approve you, then create your first class.",
    ],
  },
];

export default function App() {
  const university = useUniversity();
  const backendUp = useBackendUp();
  useDocumentTitle("Digital campus");
  const name = university.name || "EduAI Suite";
  const logo = logoSrc(university) ?? FALLBACK_LOGO;
  const list = portals();
  const contacts = [
    university.address,
    university.phone,
    university.website && { href: university.website, label: university.website.replace(/^https?:\/\//, "") },
    university.contact_email && { href: `mailto:${university.contact_email}`, label: university.contact_email },
  ].filter(Boolean) as (string | { href: string; label: string })[];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header className="border-b" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} data-variant={logoSrc(university) ? logoVariant(university) : "light"} alt={`${name} logo`} className="logo-tile h-10 w-auto max-w-[10rem] shrink-0 rounded-lg object-contain p-0.5" />
            <span className="truncate font-bold">{university.short_name || name}</span>
          </div>
          <div className="flex items-center gap-3">
            {university.contact_email && (
              <a href={`mailto:${university.contact_email}`} className="hidden items-center gap-1 text-sm sm:inline-flex" style={{ color: "var(--text-sub)" }}>
                <Mail size={16} aria-hidden="true" /> {university.contact_email}
              </a>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section aria-labelledby="welcome">
          <h1 id="welcome" className="text-3xl font-bold sm:text-4xl">
            {university.name ? `${university.name} digital campus` : "EduAI Suite"}
          </h1>
          <p className="mt-3 text-lg" style={{ color: "var(--text-sub)" }}>Sign in to your classes, games and exams.</p>
          {backendUp === false && (
            <p role="status" className="mt-4 text-sm" style={{ color: "var(--text-dim)" }}>
              Some services may be unavailable right now. The links below still open each portal.
            </p>
          )}
        </section>

        <section aria-labelledby="choose" className="mt-10">
          <h2 id="choose" className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Choose your portal</h2>
          <ul className="mt-4 space-y-3">
            {list.map((portal, index) => <PortalRow key={portal.id} portal={portal} primary={index === 0} />)}
          </ul>
        </section>

        <section aria-labelledby="first-time" className="mt-12">
          <h2 id="first-time" className="text-xl font-bold">First time here?</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {STEPS.map((group) => (
              <div key={group.who}>
                <h3 className="font-semibold">{group.who}</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--text-sub)" }}>
                  {group.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ color: "var(--text-dim)" }}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {contacts.map((item) => (
              <li key={typeof item === "string" ? item : item.href}>
                {typeof item === "string" ? item : <a href={item.href} className="hover:underline">{item.label}</a>}
              </li>
            ))}
          </ul>
          <span>Powered by EduAI Suite</span>
        </div>
      </footer>
    </div>
  );
}
