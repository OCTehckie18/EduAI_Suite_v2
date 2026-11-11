import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_RULES, rulesOf, type University } from "./university";

const university = (rules?: University["rules"]): University => ({
  configured: true, name: "CTU", short_name: "CTU", email_domain: "", contact_email: "", phone: "", website: "", address: "",
  logo_url: null, logo_dark_url: null, primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e", rules,
});

describe("rulesOf", () => {
  it("gives the platform's own behaviour when the university has not set rules", () => {
    expect(rulesOf(university())).toEqual(DEFAULT_PUBLIC_RULES);
  });

  it("lays the university's choices over the defaults", () => {
    const rules = rulesOf(university({ exam: { events: { window_blur: "warn" } }, signin: { methods: "google" } }));
    expect(rules.exam.events.window_blur).toBe("warn");
    expect(rules.exam.events.tab_hidden).toBe("end");
    expect(rules.signin.methods).toBe("google");
    expect(rules.signin.session_minutes).toBe(15);
  });
});
