import { describe, expect, it } from "vitest";
import { cgpaOf, formatDate, gradeOf, weekStartIndex, type Academic, type University } from "./university";

const letters = [{ min: 90, label: "O", points: 10 }, { min: 80, label: "A+", points: 9 }, { min: 40, label: "P", points: 4 }, { min: 0, label: "F", points: 0 }];
const university = (academic?: Partial<Academic>): University => ({
  configured: true, name: "CTU", short_name: "CTU", email_domain: "", contact_email: "", phone: "", website: "", address: "",
  logo_url: null, logo_dark_url: null, primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e",
  academic: academic ? ({ grading: { scale: "letters", pass_mark: 40, bands: letters }, calendar: { year_start_month: 6, term_name: "Semester", terms_per_year: 2, timezone: "Asia/Kolkata", date_format: "auto", week_starts: "sunday" }, current: { year_label: "2026-27", term_label: "Semester 1" }, ...academic } as Academic) : undefined,
});

describe("grades", () => {
  it("shows no grade while the university shows plain percentages", () => {
    expect(gradeOf(72, university())).toBeNull();
    expect(gradeOf(72, university({ grading: { scale: "percentage", pass_mark: 40, bands: [] } }))).toBeNull();
  });

  it("picks the band for a percentage and knows the pass mark", () => {
    const u = university({});
    expect(gradeOf(95, u)?.label).toBe("O");
    expect(gradeOf(85, u)?.label).toBe("A+");
    expect(gradeOf(39.9, u)).toMatchObject({ label: "F", passed: false });
    expect(gradeOf(40, u)).toMatchObject({ label: "P", passed: true });
    expect(gradeOf(null, u)).toBeNull();
  });

  it("averages grade points into a CGPA", () => {
    expect(cgpaOf([95, 85, 20], university({}))).toBe(6.33);
    expect(cgpaOf([95], university())).toBeNull();
  });
});

describe("dates and weeks", () => {
  it("follows the chosen date format", () => {
    const day = new Date(2026, 11, 5, 9, 7);
    const withFormat = (date_format: string) => university({ calendar: { year_start_month: 1, term_name: "S", terms_per_year: 2, timezone: "Asia/Kolkata", date_format, week_starts: "sunday" } });
    expect(formatDate(day, withFormat("DD/MM/YYYY"))).toBe("05/12/2026");
    expect(formatDate(day, withFormat("MM/DD/YYYY"))).toBe("12/05/2026");
    expect(formatDate(day, withFormat("YYYY-MM-DD"), true)).toBe("2026-12-05, 09:07");
    expect(formatDate(day, withFormat("D MMM YYYY"))).toBe("5 Dec 2026");
    expect(formatDate(null, withFormat("DD/MM/YYYY"))).toBe("");
  });

  it("starts the week where the university says, Sunday by default", () => {
    expect(weekStartIndex(university())).toBe(0);
    expect(weekStartIndex(university({ calendar: { year_start_month: 1, term_name: "S", terms_per_year: 2, timezone: "Asia/Kolkata", date_format: "auto", week_starts: "monday" } }))).toBe(1);
  });
});
