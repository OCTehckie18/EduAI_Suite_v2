import { useState } from "react";
import { Mail, Menu, X } from "lucide-react";
import { ThemeToggle } from "../shared/ThemeToggle";
import { useScrolled } from "../effects";

const LINKS = [
  { href: "#portals", label: "Portals" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
];

/** Sits over the dark hero at the top of the page, and turns into a frosted bar once you scroll. */
export function Header({ name, shortName, logo, logoVariant, email }: { name: string; shortName: string; logo: string; logoVariant: string; email: string }) {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const solid = scrolled || open;
  const text = solid ? "var(--text)" : "#ffffff";
  const sub = solid ? "var(--text-sub)" : "rgba(255,255,255,0.72)";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${solid ? "backdrop-blur-xl" : ""}`}
      style={{
        background: solid ? "color-mix(in srgb, var(--card) 82%, transparent)" : "transparent",
        borderColor: solid ? "var(--line)" : "transparent",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: "var(--color-brand-gold)" }}>
          <img src={logo} data-variant={logoVariant} alt={`${name} logo`} className="logo-tile h-9 w-auto max-w-[9rem] shrink-0 rounded-lg object-contain p-0.5" />
          <span className="truncate font-bold" style={{ color: text }}>{shortName}</span>
        </a>

        <nav aria-label="Page sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nav-link rounded-lg px-3 py-2 text-sm font-medium" style={{ color: sub }}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {email && (
            <a href={`mailto:${email}`} className="hidden items-center gap-1.5 text-sm lg:inline-flex" style={{ color: sub }}>
              <Mail size={15} aria-hidden="true" /> {email}
            </a>
          )}
          <ThemeToggle />
          <a
            href="#portals"
            className="hidden rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition-colors sm:inline-block"
            style={solid
              ? { borderColor: "var(--line)", color: "var(--text)", background: "var(--card)" }
              : { borderColor: "rgba(255,255,255,0.3)", color: "#ffffff" }}
          >
            Sign in
          </a>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg md:hidden"
            style={{ color: text }}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Page sections" className="border-t px-4 pb-4 pt-2 md:hidden" style={{ borderColor: "var(--line)" }}>
          {[...LINKS, { href: "#portals", label: "Sign in" }].map((link) => (
            <a key={link.label} href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-medium" style={{ color: "var(--text)" }}>
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
