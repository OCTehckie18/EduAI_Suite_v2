import { Globe, Mail, MapPin, Phone } from "lucide-react";
import type { University } from "../shared/university";
import type { Portal } from "../portals";

export function Footer({ university, name, logo, logoVariant, list }: { university: University; name: string; logo: string; logoVariant: string; list: Portal[] }) {
  const contacts = [
    university.address && { icon: <MapPin size={15} aria-hidden="true" />, label: university.address },
    university.phone && { icon: <Phone size={15} aria-hidden="true" />, label: university.phone, href: `tel:${university.phone.replace(/\s+/g, "")}` },
    university.website && { icon: <Globe size={15} aria-hidden="true" />, label: university.website.replace(/^https?:\/\//, ""), href: university.website },
    university.contact_email && { icon: <Mail size={15} aria-hidden="true" />, label: university.contact_email, href: `mailto:${university.contact_email}` },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; href?: string }[];

  return (
    <footer className="border-t" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3">
            <img src={logo} data-variant={logoVariant} alt="" className="logo-tile h-10 w-auto max-w-[9rem] rounded-lg object-contain p-0.5" />
            <span className="font-bold" style={{ color: "var(--text)" }}>{name}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm" style={{ color: "var(--text-sub)" }}>
            The digital campus for classes, assignments, exams and live quizzes.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Portals</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {list.map((portal) => (
              <li key={portal.id}>
                <a href={portal.url} className="footer-link" style={{ color: "var(--text-sub)" }}>
                  {portal.name} <span style={{ color: "var(--text-dim)" }}>for {portal.audience.toLowerCase()}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {contacts.length > 0 && (
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Contact</h2>
            <ul className="mt-4 space-y-2.5 text-sm" style={{ color: "var(--text-sub)" }}>
              {contacts.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--text-dim)" }}>{item.icon}</span>
                  {item.href ? <a href={item.href} className="footer-link">{item.label}</a> : <span>{item.label}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ color: "var(--text-dim)" }}>
          <span>© {new Date().getFullYear()} {name}</span>
          <span>Powered by EduAI Suite</span>
        </div>
      </div>
    </footer>
  );
}
