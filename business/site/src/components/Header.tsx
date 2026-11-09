import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "../shared/ThemeToggle";
import { useScrolled } from "../effects";

const LINKS = [
  { href: "#portals", label: "Portals" },
  { href: "#brand", label: "Your brand" },
  { href: "#data", label: "Your data" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/** Sits over the dark hero at the top of the page, and turns into a frosted bar once you scroll. */
export function Header() {
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
        <a href="#top" className="flex min-w-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: "var(--color-brand-gold)" }}>
          <img src="/eduai_logo.png" alt="" className="logo-tile h-9 w-9 shrink-0 rounded-lg object-contain p-0.5" />
          <span className="truncate font-bold" style={{ color: text }}>EduAI Suite</span>
        </a>

        <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nav-link rounded-lg px-3 py-2 text-sm font-medium" style={{ color: sub }}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <a href="#demo" className="btn-primary hidden rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white sm:inline-block">
            Request a demo
          </a>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg lg:hidden"
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
        <nav id="mobile-nav" aria-label="Page sections" className="border-t px-4 pb-4 pt-2 lg:hidden" style={{ borderColor: "var(--line)" }}>
          {[...LINKS, { href: "#demo", label: "Request a demo" }].map((link) => (
            <a key={link.label} href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-medium" style={{ color: "var(--text)" }}>
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
