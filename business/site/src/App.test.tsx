import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { brandPalette } from "./shared/brand";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(() => json({ ok: true, id: 1 }, 201));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const fillValidForm = () => {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Priya Nair" } });
  fireEvent.change(screen.getByLabelText("Your role"), { target: { value: "Registrar" } });
  fireEvent.change(screen.getByLabelText("College or university"), { target: { value: "Sample College" } });
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "priya@sample.edu" } });
  fireEvent.change(screen.getByLabelText(/Roughly how many students/), { target: { value: "4200" } });
};

describe("product website", () => {
  it("leads with the hero and both calls to action", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "The digital campus for your university" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Request a demo/ })[0]).toHaveAttribute("href", "#demo");
    expect(screen.getByRole("link", { name: /See how it works/ })).toHaveAttribute("href", "#portals");
  });

  it("shows the sections in the agreed order", () => {
    const { container } = render(<App />);
    const ids = Array.from(container.querySelectorAll("main > section")).map((s) => s.id);
    expect(ids).toEqual(["top", "portals", "brand", "data", "onboarding", "pricing", "faq", "demo"]);
  });

  it("never calls a campus API on load", () => {
    render(<App />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tours the three portals with tabs", () => {
    render(<App />);
    const tabs = within(screen.getByRole("tablist", { name: "Portals" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Master Admin", "TeacherBuddy", "EduGames"]);
    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Where students sit exams");
  });

  it("recolours the preview live from the colour picker", () => {
    render(<App />);
    const preview = screen.getByTestId("brand-preview");
    fireEvent.change(screen.getByLabelText("Main colour"), { target: { value: "#1f5e3b" } });
    expect(preview.style.getPropertyValue("--color-brand-blue")).toBe(brandPalette({ primary_color: "#1f5e3b" }, false)["--color-brand-blue"]);
    fireEvent.click(screen.getByRole("button", { name: /Ocean/ }));
    expect(preview.style.getPropertyValue("--color-brand-blue")).toBe("#0f5e75");
    expect(screen.getByRole("button", { name: /Ocean/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("names the four websites each college gets", () => {
    render(<App />);
    const preview = screen.getByTestId("brand-preview");
    for (const name of ["Landing page", "Master Admin", "TeacherBuddy", "EduGames"]) expect(within(preview).getAllByText(name).length).toBeGreaterThan(0);
  });

  it("prices every plan as Contact us", () => {
    render(<App />);
    const pricing = screen.getByRole("region", { name: "Priced for your college" });
    expect(within(pricing).getAllByText("Contact us")).toHaveLength(3);
    expect(pricing.textContent).not.toMatch(/[₹$€£]\s?\d/);
  });

  it("keeps away from banned copy", () => {
    const { container } = render(<App />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(new RegExp(["Chr", "ist"].join(""), "i")); // no customer college by name
    expect(text).not.toMatch(/It's not .+\. It's/);
    expect((text.match(/—/g) ?? []).length).toBe(0);
  });
});

describe("demo request form", () => {
  it("checks required fields and consent before sending", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByText("Please tell us your name.")).toBeInTheDocument();
    expect(screen.getByText("Please agree to be contacted so we can reply.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the business backend and thanks the visitor", async () => {
    render(<App />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/I agree that EduAI Suite may contact me/));
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByText("Thank you, we have your request")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/demo-requests/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Priya Nair", role: "Registrar", institution: "Sample College", work_email: "priya@sample.edu",
      approx_students: 4200, consent: true, website: "",
    });
  });

  it("uses VITE_BUSINESS_API_URL when set", async () => {
    vi.stubEnv("VITE_BUSINESS_API_URL", "https://api.sales.example/");
    render(<App />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sales.example/api/demo-requests/");
  });

  it("shows the backend's field errors", async () => {
    fetchMock.mockImplementation(() => json({ work_email: ["Enter a valid email address."] }, 400));
    render(<App />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
  });

  it("explains when too many requests were sent", async () => {
    fetchMock.mockImplementation(() => json({ detail: "Request was throttled." }, 429));
    render(<App />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again later.");
  });

  it("keeps the honeypot out of sight and out of the tab order", () => {
    render(<App />);
    const trap = document.getElementById("demo-website")!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
