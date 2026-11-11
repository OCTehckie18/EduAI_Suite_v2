import { afterEach, describe, expect, it } from "vitest";
import { onFill } from "./brand";
import { applyLook, type Look } from "./look";

const base: Look = {
  heading_font: { kind: "default", family: "" }, body_font: { kind: "default", family: "" },
  corners: "soft", density: "comfortable",
  portal_names: { teacherbuddy: "", edugames: "", master_admin: "" }, favicon_url: null,
  signin: {} as Look["signin"], links: { help: "", privacy: "", terms: "" }, landing: { headline: "", text: "" },
};

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.head.innerHTML = "";
});

describe("applyLook", () => {
  it("leaves the portal's own look alone by default", () => {
    applyLook(base, "http://api");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--font-display")).toBe("");
    expect(style.getPropertyValue("--radius-xl")).toBe("");
    expect(style.fontSize).toBe("");
  });

  it("loads a listed font and an uploaded one", () => {
    applyLook({ ...base, heading_font: { kind: "curated", family: "Open Sans" }, body_font: { kind: "upload", family: "Campus", url: "/institution/university/assets/body_font/?v=1", format: "woff2" } }, "http://api");
    expect(document.documentElement.style.getPropertyValue("--font-display")).toContain("Open Sans");
    expect((document.getElementById("eduai-font-heading") as HTMLLinkElement).href).toContain("family=Open+Sans");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("EduAI body Campus");
    expect(document.getElementById("eduai-font-body")?.textContent).toContain("http://api/institution/university/assets/body_font/");
  });

  it("scales the corners and makes compact text smaller", () => {
    applyLook({ ...base, corners: "sharp", density: "compact" }, "http://api");
    expect(parseFloat(document.documentElement.style.getPropertyValue("--radius-xl"))).toBeLessThan(0.75);
    expect(document.documentElement.style.fontSize).toBe("15px");
    applyLook(base, "http://api");
    expect(document.documentElement.style.getPropertyValue("--radius-xl")).toBe("");
  });

  it("uses the uploaded tab icon, or the logo when there is none", () => {
    applyLook(base, "http://api", "/institution/university/logo/?v=2");
    expect(document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href).toBe("http://api/institution/university/logo/?v=2");
    applyLook({ ...base, favicon_url: "/institution/university/assets/favicon/?v=3" }, "http://api");
    expect(document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href).toBe("http://api/institution/university/assets/favicon/?v=3");
  });
});

describe("onFill", () => {
  it("keeps white text on dark fills and switches to near-black on light ones", () => {
    expect(onFill("#0b4a87")).toBe("#ffffff");
    expect(onFill("#ffee99")).toBe("#0b1220");
  });
});
