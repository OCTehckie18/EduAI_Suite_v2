import { salesEmail } from "../api";

export function Footer() {
  const email = salesEmail();
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/eduai_logo.png" alt="" className="logo-tile h-8 w-8 rounded-lg object-contain p-0.5" />
          <div>
            <p className="font-bold" style={{ color: "var(--text)" }}>EduAI Suite</p>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>The digital campus for your university</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: "var(--text-sub)" }}>
          <a className="footer-link" href="#portals">Portals</a>
          <a className="footer-link" href="#data">Your data</a>
          <a className="footer-link" href="#pricing">Pricing</a>
          <a className="footer-link" href="#faq">FAQ</a>
          <a className="footer-link" href="#demo">Request a demo</a>
          {email && <a className="footer-link" href={`mailto:${email}`}>{email}</a>}
        </nav>
      </div>
      <p className="pb-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>© {new Date().getFullYear()} EduAI Suite. Screens shown are illustrations with sample data.</p>
    </footer>
  );
}
