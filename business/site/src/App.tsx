import { BrandStudio } from "./components/BrandStudio";
import { DataSection } from "./components/DataSection";
import { DemoForm } from "./components/DemoForm";
import { Faq } from "./components/Faq";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Onboarding } from "./components/Onboarding";
import { PortalTour } from "./components/PortalTour";
import { Pricing } from "./components/Pricing";

export default function App() {
  return (
    <div className="min-h-screen overflow-x-clip" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main">
        <Hero />
        <PortalTour />
        <BrandStudio />
        <DataSection />
        <Onboarding />
        <Pricing />
        <Faq />
        <DemoForm />
      </main>
      <Footer />
    </div>
  );
}
