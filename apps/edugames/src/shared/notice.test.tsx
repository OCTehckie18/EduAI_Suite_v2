import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelpBlock, NoticeBanner, setUniversity, type University } from "./university";

const university = (extra: Partial<University>): University => ({
  configured: true, name: "CTU", short_name: "CTU", email_domain: "", contact_email: "", phone: "", website: "", address: "",
  logo_url: null, logo_dark_url: null, primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e", ...extra,
});

afterEach(() => localStorage.clear());

describe("notice banner", () => {
  it("shows nothing without a notice", () => {
    setUniversity(university({ notice: null }));
    const { container } = render(<NoticeBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows the notice, and a dismissed one stays hidden until its text changes", () => {
    setUniversity(university({ notice: { text: "Exams start Monday", tone: "info", dismissable: true, version: "v1" } }));
    const first = render(<NoticeBanner />);
    expect(screen.getByText("Exams start Monday")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss this notice"));
    expect(screen.queryByText("Exams start Monday")).toBeNull();
    first.unmount();
    const second = render(<NoticeBanner />);
    expect(screen.queryByText("Exams start Monday")).toBeNull();
    second.unmount();
    setUniversity(university({ notice: { text: "Exams moved to Tuesday", tone: "urgent", dismissable: true, version: "v2" } }));
    render(<NoticeBanner />);
    expect(screen.getByText("Exams moved to Tuesday")).toBeTruthy();
  });

  it("cannot be dismissed when the university says so", () => {
    setUniversity(university({ notice: { text: "Maintenance tonight", tone: "urgent", dismissable: false, version: "v3" } }));
    render(<NoticeBanner />);
    expect(screen.queryByLabelText("Dismiss this notice")).toBeNull();
  });
});

describe("help block", () => {
  it("is empty until the university fills something in", () => {
    setUniversity(university({ help: { email: "", phone: "", hours: "", link: "" } }));
    const { container } = render(<HelpBlock />);
    expect(container.textContent).toBe("");
  });

  it("shows the details as links", () => {
    setUniversity(university({ help: { email: "help@ctu.edu", phone: "+91 80 1234", hours: "9 to 5", link: "https://help.ctu.edu" } }));
    render(<HelpBlock />);
    expect(screen.getByText("help@ctu.edu").getAttribute("href")).toBe("mailto:help@ctu.edu");
    expect(screen.getByText("+91 80 1234").getAttribute("href")).toBe("tel:+91801234");
    expect(screen.getByText("9 to 5")).toBeTruthy();
  });
});
