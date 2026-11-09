import { useEffect, useState } from "react";
import { logoSrc, logoVariant, useDocumentTitle, useUniversity } from "./shared/university";
import { API_BASE_URL } from "./shared/utils/apiConfig";
import { portals } from "./portals";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Portals } from "./components/Portals";
import { Features } from "./components/Features";
import { CallToAction, Journey } from "./components/Journey";
import { Footer } from "./components/Footer";

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

export default function App() {
  const university = useUniversity();
  const backendUp = useBackendUp();
  useDocumentTitle("Digital campus");
  const name = university.name || "EduAI Suite";
  const uploaded = logoSrc(university);
  const logo = uploaded ?? FALLBACK_LOGO;
  const variant = uploaded ? logoVariant(university) : "light";
  const list = portals();
  const [students, teachers] = list;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <a href="#portals" className="skip-link">Skip to the portals</a>
      <Header name={name} shortName={university.short_name || name} logo={logo} logoVariant={variant} email={university.contact_email} />
      <main>
        <Hero universityName={university.name} students={students} teachers={teachers} backendUp={backendUp} />
        <Portals list={list} />
        <Features />
        <Journey />
        <CallToAction students={students} teachers={teachers} />
      </main>
      <Footer university={university} name={name} logo={logo} logoVariant={variant} list={list} />
    </div>
  );
}
