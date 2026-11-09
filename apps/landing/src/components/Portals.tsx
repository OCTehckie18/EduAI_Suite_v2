import type { ReactNode } from "react";
import { ArrowRight, GraduationCap, Presentation, ShieldCheck } from "lucide-react";
import { Reveal, trackSpotlight } from "../effects";
import type { Portal } from "../portals";
import { StudentFeedMock } from "./Mockups";

const ICONS: Record<Portal["id"], ReactNode> = {
  students: <GraduationCap size={22} aria-hidden="true" />,
  teachers: <Presentation size={22} aria-hidden="true" />,
  admin: <ShieldCheck size={22} aria-hidden="true" />,
};

const ACCENT: Record<Portal["id"], string> = {
  students: "var(--color-brand-blue)",
  teachers: "var(--color-brand-accent)",
  admin: "var(--color-brand-gold-dark)",
};

function PortalCard({ portal, featured }: { portal: Portal; featured: boolean }) {
  return (
    <li
      onMouseMove={trackSpotlight}
      className={`spotlight portal-card group relative flex flex-col overflow-hidden rounded-3xl border p-6 sm:p-7 ${featured ? "md:row-span-2" : ""}`}
      style={{ borderColor: "var(--line)", background: "var(--card)", ["--spot" as string]: ACCENT[portal.id] }}
    >
      <div className="flex items-center gap-3">
        <span className="icon-tile grid h-11 w-11 place-items-center rounded-xl" style={{ color: ACCENT[portal.id], background: "var(--bg)" }}>
          {ICONS[portal.id]}
        </span>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{portal.audience}</p>
      </div>
      <h3 className={`mt-5 font-extrabold tracking-tight ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`} style={{ color: "var(--text)" }}>{portal.name}</h3>
      <p className="mt-2 text-base" style={{ color: "var(--text-sub)" }}>{portal.summary}</p>
      <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>{portal.note}</p>

      {featured && (
        <div className="mt-7 hidden flex-1 sm:block">
          <StudentFeedMock />
        </div>
      )}

      <div className={featured ? "mt-7" : "mt-auto pt-6"}>
        <a
          href={portal.url}
          className={`card-link inline-flex items-center gap-2 text-sm font-bold after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus:outline-none ${
            featured ? "btn-primary rounded-xl px-5 py-3 text-white" : ""
          }`}
          style={featured ? undefined : { color: ACCENT[portal.id] }}
        >
          {portal.action}
          <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </a>
      </div>
    </li>
  );
}

export function Portals({ list }: { list: Portal[] }) {
  return (
    <section id="portals" aria-labelledby="choose" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="eyebrow">Choose your portal</p>
        <h2 id="choose" className="section-title mt-3">One campus, a portal for each of you</h2>
        <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
          Students and teachers sign in with their university Google account, and each portal shows only what belongs to you.
        </p>
      </Reveal>
      <Reveal delay={120}>
        <ul className="mt-12 grid gap-4 md:grid-cols-[1.35fr_1fr] md:grid-rows-2">
          {list.map((portal, index) => <PortalCard key={portal.id} portal={portal} featured={index === 0} />)}
        </ul>
      </Reveal>
    </section>
  );
}
