import { describe, expect, it } from "vitest";
import { termsOf } from "./university";
import type { University } from "./university";

describe("termsOf", () => {
  it("uses the standard words when the university chose none", () => {
    const t = termsOf(null);
    expect(t("register_no")).toBe("Register number");
    expect(t("class", { plural: true })).toBe("Classes");
    expect(t("student", { plural: true, lower: true })).toBe("students");
  });

  it("uses the university's own words", () => {
    const university = { terms: { school: { singular: "Faculty", plural: "Faculties" } } } as unknown as University;
    const t = termsOf(university);
    expect(t("school")).toBe("Faculty");
    expect(t("school", { plural: true, lower: true })).toBe("faculties");
  });

  it("falls back to the standard word for one the table lacks or leaves blank", () => {
    const university = { terms: { exam: { singular: "", plural: "" } } } as unknown as University;
    expect(termsOf(university)("exam")).toBe("Exam");
    expect(termsOf(university)("assignment")).toBe("Assignment");
  });
});
