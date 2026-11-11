import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleGate, moduleOn, setUniversity, type University } from "./university";

const university = (modules: Record<string, boolean>): University => ({
  configured: true, name: "Central Test University", short_name: "CTU", email_domain: "", contact_email: "", phone: "", website: "", address: "",
  logo_url: null, logo_dark_url: null, primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e", modules,
});

describe("module switches", () => {
  it("treats a module as on unless the university switched it off", () => {
    expect(moduleOn(university({}), "forms")).toBe(true);
    expect(moduleOn(university({ forms: true }), "forms")).toBe(true);
    expect(moduleOn(university({ forms: false }), "forms")).toBe(false);
  });

  it("shows the page while the module is on and a short note when it is off", () => {
    setUniversity(university({}));
    const { unmount } = render(<ModuleGate module="forms"><p>The forms page</p></ModuleGate>);
    expect(screen.getByText("The forms page")).toBeTruthy();
    unmount();
    setUniversity(university({ forms: false }));
    render(<ModuleGate module="forms"><p>The forms page</p></ModuleGate>);
    expect(screen.queryByText("The forms page")).toBeNull();
    expect(screen.getByText(/Forms is switched off at CTU/)).toBeTruthy();
  });
});
