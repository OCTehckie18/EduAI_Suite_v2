import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

const UNIVERSITY = {
  configured: true, name: "Central Test University", short_name: "CTU", email_domain: "ctu.edu",
  contact_email: "help@ctu.edu", phone: "+91 80 1234 5678", website: "https://ctu.edu", address: "Hosur Road",
  logo_url: "/uploads/university/logo.png", logo_dark_url: null,
  primary_color: "#7a1f2b", secondary_color: "#d0ae61", tertiary_color: "#0f766e",
};

async function renderApp(server: (url: string) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((url: string) => server(String(url))));
  vi.resetModules(); // the university store reads its cache when first imported
  const { default: App } = await import("./App");
  return render(<App />);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("landing page", () => {
  it("shows the university's own name, logo and contact details", async () => {
    await renderApp((url) => (url.includes("/university/") ? json(UNIVERSITY) : json({ status: "healthy" })));
    expect(await screen.findByRole("heading", { level: 1, name: "Central Test University digital campus" })).toBeInTheDocument();
    expect(screen.getByAltText("Central Test University logo")).toHaveAttribute("src", expect.stringContaining("/uploads/university/logo.png"));
    expect(screen.getAllByText("help@ctu.edu").length).toBeGreaterThan(0);
    expect(screen.getByText("Hosur Road")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--color-brand-blue")).not.toBe("");
  });

  it("falls back to EduAI Suite before a university is set up", async () => {
    await renderApp((url) => (url.includes("/university/") ? json({ configured: false }) : json({ status: "healthy" })));
    expect(await screen.findByRole("heading", { level: 1, name: "EduAI Suite" })).toBeInTheDocument();
    expect(screen.getByAltText("EduAI Suite logo")).toHaveAttribute("src", "/eduai_logo.png");
  });

  it("each portal button opens the configured address", async () => {
    vi.stubEnv("VITE_EDUGAMES_URL", "https://games.ctu.edu/");
    vi.stubEnv("VITE_TEACHERBUDDY_URL", "https://teach.ctu.edu");
    vi.stubEnv("VITE_ADMIN_URL", "https://admin.ctu.edu");
    await renderApp(() => json(UNIVERSITY));
    expect(screen.getByRole("link", { name: /Open EduGames/ })).toHaveAttribute("href", "https://games.ctu.edu");
    expect(screen.getByRole("link", { name: /Open TeacherBuddy/ })).toHaveAttribute("href", "https://teach.ctu.edu");
    expect(screen.getByRole("link", { name: /Open Master Admin/ })).toHaveAttribute("href", "https://admin.ctu.edu");
  });

  it("hero buttons send students and teachers to their portals", async () => {
    vi.stubEnv("VITE_EDUGAMES_URL", "https://games.ctu.edu");
    vi.stubEnv("VITE_TEACHERBUDDY_URL", "https://teach.ctu.edu");
    await renderApp(() => json(UNIVERSITY));
    expect(screen.getByRole("link", { name: /I'm a student/ })).toHaveAttribute("href", "https://games.ctu.edu");
    expect(screen.getByRole("link", { name: /I'm a teacher/ })).toHaveAttribute("href", "https://teach.ctu.edu");
  });

  it("switches the feature tabs by click and by arrow keys", async () => {
    await renderApp(() => json(UNIVERSITY));
    const exams = screen.getByRole("tab", { name: /Exams/ });
    fireEvent.click(exams);
    expect(exams).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Timed exams students sit online");
    fireEvent.keyDown(exams, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Live games/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Quizzes and games the whole room plays");
  });

  it("opens and closes the phone menu", async () => {
    await renderApp(() => json(UNIVERSITY));
    const toggle = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(document.querySelector<HTMLAnchorElement>("#mobile-nav a")!);
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("says so when the server is down, and still offers every portal", async () => {
    await renderApp(() => Promise.reject(new TypeError("Failed to fetch")));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Some services may be unavailable"));
    expect(screen.getAllByRole("link", { name: /Open / })).toHaveLength(3);
  });
});
